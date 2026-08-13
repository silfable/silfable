import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decryptAgentKey, encryptAgentKey } from "./crypto.js";

process.env.WORKER_ENCRYPTION_KEY = "a".repeat(64);

describe("Cloud Worker Cryptography Service", () => {
  it("encrypts and decrypts agent private key correctly using AES-256-GCM", () => {
    const rawSecret = "5K8...solana_private_key_base58_or_hex_string";
    const { ciphertext, iv } = encryptAgentKey(rawSecret);

    assert.ok(ciphertext);
    assert.equal(iv.length, 24); // 12 bytes hex = 24 chars

    const decrypted = decryptAgentKey(ciphertext, iv);
    assert.equal(decrypted, rawSecret);
  });

  it("throws error when attempting to decrypt tampered ciphertext", () => {
    const rawSecret = "secret_key_payload";
    const { ciphertext, iv } = encryptAgentKey(rawSecret);
    const tampered = "bad" + ciphertext.slice(3);

    assert.throws(() => decryptAgentKey(tampered, iv));
  });
});
