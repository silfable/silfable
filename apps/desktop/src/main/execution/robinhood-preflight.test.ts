import assert from "node:assert/strict";
import test from "node:test";
import { RobinhoodPreflightService } from "./robinhood-preflight.js";
const a = "0x1111111111111111111111111111111111111111" as const;
const engine = { getErc20Allowance: async () => 0n, estimateGasAndFees: async () => ({ gasLimit: 21_000n, maxFeePerGas: 1_000_000_000n, maxPriorityFeePerGas: 1n }) };
const quote = { allowanceTarget: a, to: a, data: "0x1234" as const, value: 0n, sellAmount: "100", buyAmount: "99", minBuyAmount: "98" };
test("Robinhood preflight is one-time and gas-bounded", async () => { const service = new RobinhoodPreflightService(); const preview = await service.prepare({ engine, wallet: a, token: a, firmQuote: quote }); assert.equal(preview.allowanceRequired, true); assert.equal(service.take(preview.id).data, "0x1234"); assert.throws(() => service.take(preview.id), /unavailable/u); });

test("Robinhood preflight binds approval to its wallet, token, spender, and exact quote amount", async () => {
  const service = new RobinhoodPreflightService();
  const preview = await service.prepare({ engine, wallet: a, token: a, firmQuote: quote });
  assert.throws(
    () => service.takeForApproval(preview.id, "0x2222222222222222222222222222222222222222"),
    /wallet scope/u,
  );

  const second = await service.prepare({ engine, wallet: a, token: a, firmQuote: quote });
  assert.deepEqual(service.takeForApproval(second.id, a), {
    token: a,
    spender: a,
    exactAmount: 100n,
  });
  assert.throws(() => service.takeForApproval(second.id, a), /unavailable/u);
});
