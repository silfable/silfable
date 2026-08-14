import assert from "node:assert/strict";
import test from "node:test";

import { parseRelayEvmQuote, ROBINHOOD_USDG_ADDRESS } from "./relay-evm-bridge-core";

const WALLET = "0x1111111111111111111111111111111111111111";
const DEPOSIT = "0x2222222222222222222222222222222222222222";
const REQUEST_ID = `0x${"ab".repeat(32)}`;

function approvalData(spender = DEPOSIT, amount = BigInt(1_000_000)) {
  return `0x095ea7b3${spender.slice(2).padStart(64, "0")}${amount.toString(16).padStart(64, "0")}`;
}

function payload(approvalAmount = BigInt(1_000_000)) {
  return {
    steps: [
      { id: "approve", action: "Approve token", kind: "transaction", items: [{ kind: "transaction", data: { from: WALLET, to: ROBINHOOD_USDG_ADDRESS, data: approvalData(DEPOSIT, approvalAmount), value: "0", chainId: 4663 } }] },
      { id: "deposit", action: "Deposit funds", kind: "transaction", requestId: REQUEST_ID, items: [{ data: { from: WALLET, to: DEPOSIT, data: "0x1234", value: "0", chainId: 4663 } }] },
    ],
    details: { totalImpact: { usd: "0.03" }, currencyOut: { amount: "975000", minimumAmount: "965000" }, timeEstimate: 15 },
  };
}

test("returns an exact approval as the next reviewed action", () => {
  const quote = parseRelayEvmQuote({ payload: payload(), walletAddress: WALLET, amountIn: "1000000", maximumTotalFeeUsd: 0.1 });
  assert.equal(quote.action, "approval");
  assert.equal(quote.transaction.to.toLowerCase(), ROBINHOOD_USDG_ADDRESS);
  assert.equal(quote.requestId, REQUEST_ID);
  assert.equal(quote.minimumAmountOut, "965000");
});

test("rejects an unlimited approval returned by Relay", () => {
  assert.throws(() => parseRelayEvmQuote({ payload: payload((BigInt(2) ** BigInt(256)) - BigInt(1)), walletAddress: WALLET, amountIn: "1000000", maximumTotalFeeUsd: 0.1 }), /approval amount exceeds/u);
});

test("rejects a transaction for another source chain", () => {
  const wrongChain = payload();
  wrongChain.steps[1].items[0].data.chainId = 1;
  assert.throws(() => parseRelayEvmQuote({ payload: wrongChain, walletAddress: WALLET, amountIn: "1000000", maximumTotalFeeUsd: 0.1 }), /not pinned to Robinhood/u);
});
