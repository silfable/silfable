import { describe, test } from "node:test";
import assert from "node:assert/strict";
import bs58 from "bs58";
import nacl from "tweetnacl";
import {
  buildWalletAuthMessage,
  createOpaqueToken,
  normalizeWalletAddress,
  sha256,
  verifyWalletSignature,
} from "./wallet-auth-crypto";

describe("wallet authentication cryptography", () => {
  test("accepts the exact signed challenge and rejects altered content", () => {
    const keypair = nacl.sign.keyPair();
    const walletAddress = bs58.encode(keypair.publicKey);
    const message = buildWalletAuthMessage({
      domain: "silfable.example",
      uri: "https://silfable.example",
      walletAddress,
      nonce: "one-time-nonce",
      issuedAt: new Date("2026-07-26T00:00:00.000Z"),
      expiresAt: new Date("2026-07-26T00:05:00.000Z"),
    });
    const signature = bs58.encode(
      nacl.sign.detached(new TextEncoder().encode(message), keypair.secretKey),
    );

    assert.equal(verifyWalletSignature({ walletAddress, message, signature }), true);
    assert.equal(
      verifyWalletSignature({ walletAddress, message: `${message}\nFull Access: true`, signature }),
      false,
    );
  });

  test("rejects another wallet and malformed signatures", () => {
    const signer = nacl.sign.keyPair();
    const other = nacl.sign.keyPair();
    const message = "restricted authentication only";
    const signature = bs58.encode(
      nacl.sign.detached(new TextEncoder().encode(message), signer.secretKey),
    );

    assert.equal(
      verifyWalletSignature({
        walletAddress: bs58.encode(other.publicKey),
        message,
        signature,
      }),
      false,
    );
    assert.equal(
      verifyWalletSignature({
        walletAddress: bs58.encode(signer.publicKey),
        message,
        signature: "not-base58-0",
      }),
      false,
    );
  });

  test("normalizes Solana addresses and creates opaque non-secret hashes", () => {
    const walletAddress = bs58.encode(nacl.sign.keyPair().publicKey);
    assert.equal(normalizeWalletAddress(walletAddress), walletAddress);
    assert.throws(() => normalizeWalletAddress("not-a-wallet"));

    const first = createOpaqueToken();
    const second = createOpaqueToken();
    assert.notEqual(first, second);
    assert.equal(sha256(first).length, 64);
    assert.notEqual(sha256(first), first);
  });
});
