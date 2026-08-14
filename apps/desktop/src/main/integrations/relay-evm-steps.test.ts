import assert from "node:assert/strict";
import test from "node:test";

import { parseRelayEvmTransactionSteps } from "./relay-evm-steps.js";

const ADDRESS = "0x1111111111111111111111111111111111111111";

test("parses a bounded approval plus bridge transaction for one EVM source chain", () => {
  const result = parseRelayEvmTransactionSteps({
    expectedChainId: 8453,
    steps: [
      { action: "allowance", items: [{ kind: "transaction", label: "Approve USDC", data: { chainId: 8453, to: ADDRESS, data: "0x095ea7b3", value: "0" } }] },
      { action: "deposit", items: [{ kind: "transaction", label: "Bridge deposit", data: { chainId: "8453", to: ADDRESS, data: "0x1234", value: "42" } }] },
    ],
  });
  assert.deepEqual(result.map((step) => step.kind), ["approval", "bridge"]);
  assert.equal(result[1]?.valueWei, 42n);
});

test("parses the current Relay V2 parent-step transaction shape", () => {
  const result = parseRelayEvmTransactionSteps({
    expectedChainId: 4663,
    steps: [
      { kind: "transaction", id: "approve", description: "Sign an approval for USDG", items: [{ data: { chainId: 4663, to: ADDRESS, data: "0x095ea7b3", value: "0" } }] },
      { kind: "transaction", id: "deposit", description: "Depositing funds to the relayer", items: [{ data: { chainId: 4663, to: ADDRESS, data: "0x1234", value: "0" } }] },
    ],
  });
  assert.deepEqual(result.map((step) => step.kind), ["approval", "bridge"]);
});

test("rejects a transaction for another EVM chain", () => {
  assert.throws(() => parseRelayEvmTransactionSteps({
    expectedChainId: 8453,
    steps: [{ items: [{ kind: "transaction", data: { chainId: 1, to: ADDRESS, data: "0x", value: "0" } }] }],
  }), /chain mismatch/u);
});

test("rejects Relay signature steps until their dedicated approval flow exists", () => {
  assert.throws(() => parseRelayEvmTransactionSteps({
    expectedChainId: 8453,
    steps: [{ items: [{ kind: "signature", data: {} }] }],
  }), /signature step/u);
});
