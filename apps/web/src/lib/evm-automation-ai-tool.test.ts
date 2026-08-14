import assert from "node:assert/strict";
import test from "node:test";

import { decodeStoredEvmToken, encodeStoredEvmToken, parseEvmAutomationText } from "./evm-automation-core";

test("parses Indonesian DCA for a verified token symbol and bare cycle count", () => {
  assert.deepEqual(
    parseEvmAutomationText("buatkan DCA 0.0005 ETH ke WETH setiap 10 menit 2 kali"),
    {
      amount: "0.0005",
      inputReference: "ETH",
      outputReference: "WETH",
      intervalSeconds: 600,
      maximumExecutions: 2,
    },
  );
});

test("prefers an exact destination contract following a token symbol", () => {
  const address = "0x020bfC650A365f8BB26819deAAbF3E21291018b4";
  const parsed = parseEvmAutomationText(`DCA 1 USDE ke CASHCAT ${address} setiap 1 jam sebanyak 3 kali`);
  assert.equal(parsed?.inputReference, "USDE");
  assert.equal(parsed?.outputReference, address);
  assert.equal(parsed?.intervalSeconds, 3_600);
  assert.equal(parsed?.maximumExecutions, 3);
});

test("parses TP/SL token pair inputs independently of schedule fields", () => {
  const parsed = parseEvmAutomationText("TP/SL 2 WETH to USDG entry $2000 tp $2200 sl $1800");
  assert.equal(parsed?.amount, "2");
  assert.equal(parsed?.inputReference, "WETH");
  assert.equal(parsed?.outputReference, "USDG");
});

test("stores a dynamic token identity without requiring new Prisma columns", () => {
  const token = { symbol: "WETH", address: "0x0bd7d308f8e1639fab988df18a8011f41eacad73", decimals: 18 };
  const stored = encodeStoredEvmToken(token);
  assert.equal(stored, "WETH@0x0bd7d308f8e1639fab988df18a8011f41eacad73");
  assert.deepEqual(decodeStoredEvmToken(stored, token.decimals), { ...token, native: false });
});

test("continues to read legacy ETH and USDG strategies", () => {
  assert.equal(decodeStoredEvmToken("ETH", 18).symbol, "ETH");
  assert.equal(decodeStoredEvmToken("USDG", 6).symbol, "USDG");
});
