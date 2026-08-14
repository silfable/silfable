import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  assertSecureStorageBackend,
  PortableEncryptedKeystore,
  type SecureStoragePort,
} from "./keystore-core";

class IntegrityStorage implements SecureStoragePort {
  available = true;
  backend = "kwallet6";
  isEncryptionAvailable() { return this.available; }
  getSelectedStorageBackend() { return this.backend; }
  encryptString(plaintext: string) {
    const body = Buffer.from(plaintext, "utf8").toString("base64");
    return Buffer.from(`${body}.${createHash("sha256").update(body).digest("hex")}`, "utf8");
  }
  decryptString(encrypted: Buffer) {
    const [body, digest] = encrypted.toString("utf8").split(".");
    if (body === undefined || digest !== createHash("sha256").update(body).digest("hex")) throw new Error("integrity failure");
    return Buffer.from(body, "base64").toString("utf8");
  }
}

test("locked and unavailable backends fail before secret access", async () => {
  const directory = await mkdtemp(join(tmpdir(), "silfable-keystore-lock-"));
  const storage = new IntegrityStorage();
  const keystore = new PortableEncryptedKeystore(join(directory, "secrets.json"), storage);
  try {
    await assert.rejects(keystore.getSecret("wallet-secret"), /locked/u);
    storage.available = false;
    assert.throws(() => keystore.unlock(), /unavailable/u);
    storage.available = true;
    storage.backend = "basic_text";
    assert.throws(() => assertSecureStorageBackend(storage, "linux"), /basic_text/u);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("ciphertext tampering is detected and never returned as plaintext", async () => {
  const directory = await mkdtemp(join(tmpdir(), "silfable-keystore-tamper-"));
  const path = join(directory, "secrets.json");
  const keystore = new PortableEncryptedKeystore(path, new IntegrityStorage());
  try {
    keystore.unlock();
    await keystore.setSecret("wallet-secret", "high-value-secret");
    const file = JSON.parse(await readFile(path, "utf8")) as { version: 1; records: { "wallet-secret": string } };
    const bytes = Buffer.from(file.records["wallet-secret"], "base64");
    bytes[0] = (bytes[0] ?? 0) ^ 1;
    file.records["wallet-secret"] = bytes.toString("base64");
    await writeFile(path, JSON.stringify(file));
    await assert.rejects(keystore.getSecret("wallet-secret"), /integrity failure/u);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("malformed, oversized, and unknown-record keystores are rejected", async () => {
  const directory = await mkdtemp(join(tmpdir(), "silfable-keystore-file-"));
  const path = join(directory, "secrets.json");
  const keystore = new PortableEncryptedKeystore(path, new IntegrityStorage());
  try {
    keystore.unlock();
    await writeFile(path, JSON.stringify({ version: 1, records: { arbitrary: Buffer.from("x").toString("base64") } }));
    await assert.rejects(keystore.getSecret("wallet-secret"), /invalid/u);
    await writeFile(path, "x".repeat(1024 * 1024 + 1));
    await assert.rejects(keystore.getSecret("wallet-secret"), /size limit/u);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("concurrent secret mutations are serialized without lost records", async () => {
  const directory = await mkdtemp(join(tmpdir(), "silfable-keystore-race-"));
  const keystore = new PortableEncryptedKeystore(join(directory, "secrets.json"), new IntegrityStorage());
  try {
    keystore.unlock();
    await Promise.all([
      keystore.setSecret("openai-api-key", "openai-secret"),
      keystore.setSecret("anthropic-api-key", "anthropic-secret"),
      keystore.setSecret("jupiter-api-key", "jupiter-secret"),
    ]);
    assert.equal(await keystore.getSecret("openai-api-key"), "openai-secret");
    assert.equal(await keystore.getSecret("anthropic-api-key"), "anthropic-secret");
    assert.equal(await keystore.getSecret("jupiter-api-key"), "jupiter-secret");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("released legacy and venue-isolated record names keep an existing vault readable", async () => {
  const directory = await mkdtemp(join(tmpdir(), "silfable-keystore-compatible-"));
  const path = join(directory, "secrets.json");
  const keystore = new PortableEncryptedKeystore(path, new IntegrityStorage());
  try {
    keystore.unlock();
    await keystore.setSecret("solana-rpc-url", "https://solana.example/v2/key");
    await keystore.setSecret("hyperliquid-agent-secret", "encrypted-agent-record");
    assert.equal(await keystore.getSecret("solana-rpc-url"), "https://solana.example/v2/key");
    assert.equal(await keystore.getSecret("hyperliquid-agent-secret"), "encrypted-agent-record");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("locked vault reset moves the encrypted keystore into a backup directory", async () => {
  const directory = await mkdtemp(join(tmpdir(), "silfable-keystore-reset-"));
  const path = join(directory, "secrets.json");
  const backup = join(directory, "backup");
  const keystore = new PortableEncryptedKeystore(path, new IntegrityStorage());
  try {
    keystore.unlock();
    await keystore.setSecret("wallet-secret", "old-wallet-secret");
    await assert.rejects(keystore.backupAndReset(backup), /Lock the keystore/u);
    keystore.lock();
    assert.equal(await keystore.backupAndReset(backup), true);
    const archived = await readFile(join(backup, "secrets.v1.json"), "utf8");
    assert.equal(archived.includes("old-wallet-secret"), false);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
