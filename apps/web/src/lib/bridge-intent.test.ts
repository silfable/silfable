import assert from "node:assert/strict";
import test from "node:test";

import { resolveSolanaBridgeIntent } from "./bridge-intent";

test("resolves a Solana to Robinhood bridge from one message", () => {
  assert.deepEqual(resolveSolanaBridgeIntent([
    { role: "user", content: "Bridge 0.5 USDC ke USDG Robinhood Chain ke 0x462e05D112DE35a42a8F0EaB5e0F4A898C9D4913" },
  ]), { requested: true, amountUsdc: 0.5, destinationRecipient: "0x462e05D112DE35a42a8F0EaB5e0F4A898C9D4913" });
});

test("combines amount and recipient from a bridge follow-up", () => {
  assert.deepEqual(resolveSolanaBridgeIntent([
    { role: "user", content: "bridge 0.5 usdc ke usdg robinhood chain" },
    { role: "assistant", content: "Tuliskan alamat tujuan EVM." },
    { role: "user", content: "address nya 0x462e05D112DE35a42a8F0EaB5e0F4A898C9D4913, jumlahnya pakai yang tadi" },
  ]), { requested: true, amountUsdc: 0.5, destinationRecipient: "0x462e05D112DE35a42a8F0EaB5e0F4A898C9D4913" });
});

test("does not reuse an old bridge request for an unrelated follow-up", () => {
  assert.deepEqual(resolveSolanaBridgeIntent([
    { role: "user", content: "bridge 0.5 usdc ke usdg robinhood chain" },
    { role: "assistant", content: "Tuliskan alamat tujuan EVM." },
    { role: "user", content: "Apa kemampuan agent ini?" },
  ]), { requested: false, amountUsdc: null, destinationRecipient: null });
});
