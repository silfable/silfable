import assert from "node:assert/strict";
import test from "node:test";

import { activityExplorerUrl, assertAllowedExplorerUrl } from "./explorer-mapping.js";

const SOLANA_SIGNATURE = "5wvyob89LipLEMyD9ypWdR1mjb9UfPh8NmuJTcA8W4PhtKDRioZwWCybk1R8qrN7bFwYA4Up3T4qUfx98V32322";
const EVM_HASH = `0x${"a".repeat(64)}`;

test("maps only structurally valid Solana and EVM transaction identifiers", () => {
  assert.equal(activityExplorerUrl({
    family: "solana",
    chainKey: "solana",
    transactionId: SOLANA_SIGNATURE,
    venue: "jupiter",
  }), `https://explorer.solana.com/tx/${SOLANA_SIGNATURE}`);
  assert.equal(activityExplorerUrl({
    family: "evm",
    chainKey: "robinhood",
    transactionId: EVM_HASH,
    venue: "evm-swap",
  }), `https://robinhoodchain.blockscout.com/tx/${EVM_HASH}`);
  assert.equal(activityExplorerUrl({
    family: "offchain",
    chainKey: "hyperliquid",
    transactionId: "123",
    venue: "hyperliquid",
  }), null);
});

test("allows only release-controlled HTTPS transaction explorer URLs", () => {
  assert.equal(
    assertAllowedExplorerUrl(`https://robinhoodchain.blockscout.com/tx/${EVM_HASH}`).hostname,
    "robinhoodchain.blockscout.com",
  );
  assert.throws(
    () => assertAllowedExplorerUrl(`https://example.com/tx/${EVM_HASH}`),
    /release-controlled/u,
  );
  assert.throws(
    () => assertAllowedExplorerUrl("https://robinhoodchain.blockscout.com/address/0x1111111111111111111111111111111111111111"),
    /release-controlled/u,
  );
});
