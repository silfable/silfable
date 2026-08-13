import assert from "node:assert/strict";
import test from "node:test";

import { RobinhoodApprovalExecutionService } from "./robinhood-approval-execution.js";
import { EvmSignerService } from "../wallet/evm-signer.js";

const ADDRESS = "0x1111111111111111111111111111111111111111" as const;

test("Robinhood approval rejects missing final confirmation before signing", async () => {
  const service = new RobinhoodApprovalExecutionService(
    { verify: async () => true } as never,
    { assertExecutionAllowed: () => undefined } as never,
    {} as never,
  );
  await assert.rejects(() => service.execute({
    masterPassword: "irrelevant", confirmation: "NO" as never, preflightId: crypto.randomUUID(), wallet: ADDRESS,
    engine: {} as never, withSigner: async () => { throw new Error("must not sign"); },
  }), /confirmation is required/u);
});

test("Robinhood approval refuses an incorrect master password before signing", async () => {
  const service = new RobinhoodApprovalExecutionService(
    { verify: async () => false } as never,
    { assertExecutionAllowed: () => undefined } as never,
    {} as never,
  );
  await assert.rejects(() => service.execute({
    masterPassword: "wrong", confirmation: "APPROVE ROBINHOOD MAINNET", preflightId: crypto.randomUUID(), wallet: ADDRESS,
    engine: {} as never, withSigner: async () => { throw new Error("must not sign"); },
  }), /Master password is incorrect/u);
});

test("Robinhood approval signs an exact approval, waits for a successful receipt, and never performs a swap", async () => {
  const sent: string[] = [];
  const persisted: Array<{ status: string; id: string }> = [];
  const service = new RobinhoodApprovalExecutionService(
    { verify: async () => true } as never,
    { assertExecutionAllowed: () => undefined } as never,
    { takeForApproval: () => ({ token: ADDRESS, spender: ADDRESS, exactAmount: 17n }) } as never,
    { save: async (receipt) => { persisted.push({ status: receipt.status, id: receipt.id }); } },
  );
  const result = await service.execute({
    masterPassword: "StrongPass1!", confirmation: "APPROVE ROBINHOOD MAINNET", preflightId: crypto.randomUUID(), wallet: ADDRESS,
    engine: {
      getChainId: () => 4663,
      getPendingNonce: async () => 7,
      estimateGasAndFees: async () => ({ gasLimit: 50_000n, maxFeePerGas: 2n, maxPriorityFeePerGas: 1n }),
      sendRawTransaction: async (raw) => { sent.push(raw); return "0x1234"; },
      waitForReceipt: async () => ({ status: "success" }),
    },
    withSigner: async (operation) => await operation(new EvmSignerService(new Uint8Array(32).fill(1))),
  });
  assert.equal(result.hash, "0x1234");
  assert.equal(sent.length, 1);
  assert.match(sent[0]!, /^0x02/u);
  assert.deepEqual(persisted.map((receipt) => receipt.status), ["unknown", "confirmed"]);
  assert.equal(persisted[0]!.id, persisted[1]!.id);
});
