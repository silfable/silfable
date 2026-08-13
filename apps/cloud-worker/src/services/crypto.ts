import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { config } from "../config/env.js";

const ALGORITHM = "aes-256-gcm";

export function encryptAgentKey(plaintextSecret: string): { ciphertext: string; iv: string } {
  const key = Buffer.from(config.workerEncryptionKey.slice(0, 64), "hex");
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
  const key = Buffer.from(config.workerEncryptionKey.slice(0, 64), "hex");
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
