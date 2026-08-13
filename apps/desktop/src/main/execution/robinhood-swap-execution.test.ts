import assert from "node:assert/strict";
import test from "node:test";

import { RobinhoodPreflightService } from "./robinhood-preflight.js";
import { RobinhoodSwapExecutionService } from "./robinhood-swap-execution.js";
import { EvmSignerService } from "../wallet/evm-signer.js";

const address = "0x1111111111111111111111111111111111111111" as const;
const quote = { allowanceTarget: address, to: address, data: "0x1234" as const, value: 0n, sellAmount: "100", buyAmount: "99", minBuyAmount: "98" };

async function prepared(): Promise<{ service: RobinhoodSwapExecutionService; id: string }> {
  const preflight = new RobinhoodPreflightService();
  const result = await preflight.prepare({ engine: { getErc20Allowance: async () => 100n, estimateGasAndFees: async () => ({ gasLimit: 21_000n, maxFeePerGas: 1n, maxPriorityFeePerGas: 1n }) }, wallet: address, token: address, firmQuote: quote });
  return { id: result.id, service: new RobinhoodSwapExecutionService({ verify: async () => true } as never, { assertExecutionAllowed: () => undefined } as never, preflight) };
}

test("Robinhood swap consumes a preflight exactly once and broadcasts only after fresh allowance and gas checks", async () => {
  const { service, id } = await prepared(); let sent = false;
  const result = await service.execute({
    masterPassword: "StrongPass1!", confirmation: "EXECUTE ROBINHOOD MAINNET SWAP", preflightId: id, wallet: address,
    engine: { getChainId: () => 4663, getErc20Allowance: async () => 100n, getPendingNonce: async () => 1, estimateGasAndFees: async () => ({ gasLimit: 21_000n, maxFeePerGas: 1n, maxPriorityFeePerGas: 1n }), sendRawTransaction: async () => { sent = true; return "0x1234"; }, waitForReceipt: async () => ({ status: "success" }) },
    withSigner: async (operation) => await operation(new EvmSignerService(new Uint8Array(32).fill(1))),
  });
  assert.equal(result.hash, "0x1234"); assert.equal(sent, true);
  await assert.rejects(() => service.execute({ masterPassword: "StrongPass1!", confirmation: "EXECUTE ROBINHOOD MAINNET SWAP", preflightId: id, wallet: address, engine: {} as never, withSigner: async () => { throw new Error("must not sign"); } }), /unavailable/u);
});

test("Robinhood swap rejects insufficient allowance before signing or broadcast", async () => {
  const { service, id } = await prepared();
  await assert.rejects(() => service.execute({ masterPassword: "StrongPass1!", confirmation: "EXECUTE ROBINHOOD MAINNET SWAP", preflightId: id, wallet: address, engine: { getChainId: () => 4663, getErc20Allowance: async () => 99n } as never, withSigner: async () => { throw new Error("must not sign"); } }), /requires a confirmed exact/u);
});
