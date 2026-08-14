import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { verifyMessage } from "viem";
import { buildEvmWalletLinkMessage, normalizeEvmAddress } from "./evm-wallet-auth-core";

describe("EVM linked-wallet authentication", () => {
  it("verifies only the exact wallet-bound challenge", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const message = buildEvmWalletLinkMessage({
      domain: "silfable.example",
      uri: "https://silfable.example",
      address: account.address,
      chainId: 4_663,
      nonce: "test-nonce-that-is-not-secret",
      issuedAt: new Date("2026-08-07T00:00:00.000Z"),
      expiresAt: new Date("2026-08-07T00:05:00.000Z"),
    });
    const signature = await account.signMessage({ message });
    assert.equal(await verifyMessage({ address: account.address, message, signature }), true);
    assert.equal(await verifyMessage({ address: account.address, message: `${message}\naltered`, signature }), false);
  });

  it("normalizes EVM addresses to a checksummed representation", () => {
    assert.equal(
      normalizeEvmAddress("0x462e05d112de35a42a8f0eab5e0f4a898c9d4913"),
      "0x462e05D112DE35a42a8F0EaB5e0F4A898C9D4913",
    );
  });
});

