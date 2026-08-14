import assert from "node:assert/strict";
import test from "node:test";

import { resolveEvmToSolanaBridgeIntent } from "./evm-bridge-intent";

test("resolves a Robinhood USDG to Solana USDC bridge", () => {
  assert.deepEqual(resolveEvmToSolanaBridgeIntent([
    { role: "user", content: "Bridge 1 USDG dari Robinhood ke Solana 2r2pXUspsXamwzNWc8dQn52GK2BJJWmr63MPzDDxjTcg" },
  ]), {
    requested: true,
    amountUsdg: "1",
    destinationRecipient: "2r2pXUspsXamwzNWc8dQn52GK2BJJWmr63MPzDDxjTcg",
  });
});

test("combines the Solana recipient from a follow-up", () => {
  assert.deepEqual(resolveEvmToSolanaBridgeIntent([
    { role: "user", content: "Bridge 0.5 USDG dari Robinhood ke Solana" },
    { role: "assistant", content: "Tuliskan alamat Solana tujuan." },
    { role: "user", content: "alamatnya 2r2pXUspsXamwzNWc8dQn52GK2BJJWmr63MPzDDxjTcg" },
  ]), {
    requested: true,
    amountUsdg: "0.5",
    destinationRecipient: "2r2pXUspsXamwzNWc8dQn52GK2BJJWmr63MPzDDxjTcg",
  });
});

test("does not mistake Solana to Robinhood for the reverse route", () => {
  assert.equal(resolveEvmToSolanaBridgeIntent([
    { role: "user", content: "Bridge 1 USDC dari Solana ke Robinhood 0x462e05D112DE35a42a8F0EaB5e0F4A898C9D4913" },
  ]).requested, false);
});
