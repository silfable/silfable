import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";

function getEncryptionKey(): Buffer {
  const secret = process.env.WORKER_ENCRYPTION_KEY?.trim();
  if (!secret) {
    throw new Error("WORKER_ENCRYPTION_KEY is required.");
  }
  if (!/^[0-9a-fA-F]{64}$/u.test(secret)) {
    throw new Error("WORKER_ENCRYPTION_KEY must be exactly 32 bytes encoded as 64 hexadecimal characters.");
  }
  return Buffer.from(secret, "hex");
}

export function encryptAgentKey(plaintextSecret: string): { ciphertext: string; iv: string } {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintextSecret, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return {
    ciphertext: `${encrypted}:${authTag}`,
    iv: iv.toString("hex"),
  };
}

export function decryptAgentKey(ciphertextPayload: string, ivHex: string): string {
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, "hex");
  const [ciphertext, authTagHex] = ciphertextPayload.split(":");

  if (!ciphertext || !authTagHex) {
    throw new Error("Invalid ciphertext payload format");
  }

  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
