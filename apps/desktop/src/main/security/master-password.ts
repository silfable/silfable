import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

type SettingsStore = {
  getSetting(key: string): unknown | null;
  setSetting(key: string, value: unknown): void;
};

const SETTING_KEY = "security.master-password.v1";
const KEY_LENGTH = 32;

type PasswordRecord = { version: 1; salt: string; hash: string };

export class MasterPasswordService {
  readonly #settings: SettingsStore;

  constructor(settings: SettingsStore) {
    this.#settings = settings;
  }

  isConfigured(): boolean {
    return parseRecord(this.#settings.getSetting(SETTING_KEY)) !== null;
  }

  async configure(password: string): Promise<void> {
    if (this.isConfigured()) throw new Error("Master password is already configured");
    assertStrongPassword(password);
    this.#settings.setSetting(SETTING_KEY, await createRecord(password));
  }

  async verify(password: string): Promise<boolean> {
    const record = parseRecord(this.#settings.getSetting(SETTING_KEY));
    if (record === null || password.length < 1 || password.length > 256) return false;
    const actual = await derive(password, Buffer.from(record.salt, "base64"));
    const expected = Buffer.from(record.hash, "base64");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  async change(currentPassword: string, newPassword: string): Promise<void> {
    if (!(await this.verify(currentPassword))) throw new Error("Current master password is incorrect");
    assertStrongPassword(newPassword);
    this.#settings.setSetting(SETTING_KEY, await createRecord(newPassword));
  }
}

export function assertStrongPassword(password: string): void {
  const characterGroups = [/[a-z]/u, /[A-Z]/u, /[0-9]/u, /[^a-zA-Z0-9]/u].filter((pattern) => pattern.test(password)).length;
  if (password.length < 8 || password.length > 256 || characterGroups < 3) {
    throw new Error("Use at least 8 characters and combine three of: lowercase, uppercase, number, or symbol");
  }
}

async function createRecord(password: string): Promise<PasswordRecord> {
  const salt = randomBytes(16);
  const hash = await derive(password, salt);
  return { version: 1, salt: salt.toString("base64"), hash: hash.toString("base64") };
}

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, KEY_LENGTH, { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

function parseRecord(value: unknown): PasswordRecord | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as { version?: unknown; salt?: unknown; hash?: unknown };
  if (record.version !== 1 || typeof record.salt !== "string" || typeof record.hash !== "string") return null;
  try {
    const salt = Buffer.from(record.salt, "base64");
    const hash = Buffer.from(record.hash, "base64");
    if (salt.length !== 16 || hash.length !== KEY_LENGTH || salt.toString("base64") !== record.salt || hash.toString("base64") !== record.hash) return null;
    return { version: 1, salt: record.salt, hash: record.hash };
  } catch {
    return null;
  }
}
