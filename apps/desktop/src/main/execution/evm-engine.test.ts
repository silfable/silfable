import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import { EvmEngine } from "./evm-engine.js";
import { VenueExecutionGate } from "./venue-execution-gate.js";

async function withRpc<T>(chainId: number, run: (url: string) => Promise<T>): Promise<T> {
  const server = createServer((request, response) => {
    let raw = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => { raw += chunk; });
    request.on("end", () => {
      const rpc = JSON.parse(raw) as { id: number; method: string };
      const result = rpc.method === "eth_chainId"
        ? `0x${chainId.toString(16)}`
        : rpc.method === "eth_getBalance"
          ? "0x0"
          : rpc.method === "eth_call"
            ? `0x${"0".repeat(58)}1312d0`
          : null;
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("Robinhood EVM engine accepts only chain ID 4663", async () => {
  await withRpc(4663, async (url) => {
    const engine = new EvmEngine(url);
    assert.equal(await engine.assertExpectedChain(), 4663);
    assert.deepEqual(await engine.getBalance("0x1111111111111111111111111111111111111111"), {
      wei: 0n,
      formatted: "0",
    });
  });
});

test("Robinhood EVM engine blocks a mismatched RPC before reads", async () => {
  await withRpc(1, async (url) => {
    const engine = new EvmEngine(url);
    await assert.rejects(
      () => engine.getBalance("0x1111111111111111111111111111111111111111"),
      /expected 4663, received 1/u,
    );
  });
});

test("Robinhood EVM engine reads ERC-20 portfolio balances without renderer conversion", async () => {
  await withRpc(4663, async (url) => {
    const engine = new EvmEngine(url);
    assert.deepEqual(
      await engine.getErc20PortfolioBalance(
        "0x5fc5360d0400a0fd4f2af552add042d716f1d168",
        "0x1111111111111111111111111111111111111111",
        6,
      ),
      { raw: 1_250_000n, formatted: "1.25" },
    );
  });
});

test("Robinhood EVM engine blocks broadcast before any RPC call when venue readiness is incomplete", async () => {
  await withRpc(4663, async (url) => {
    const engine = new EvmEngine(url, 4663, new VenueExecutionGate());
    await assert.rejects(
      () => engine.sendRawTransaction("0x02"),
      /evm execution is disabled until/u,
    );
  });
});

test("EVM simulation returns bigint gas and fee evidence required by preflight", async () => {
  const engine = new EvmEngine("https://rpc.invalid", 4663);
  engine.estimateGasAndFees = async () => ({
    gasLimit: 21_000n,
    maxFeePerGas: 2_000_000_000n,
    maxPriorityFeePerGas: 1_000_000_000n,
  });

  const result = await engine.simulateTransaction({
    from: `0x${"11".repeat(20)}`,
    to: `0x${"22".repeat(20)}`,
    valueWei: 0n,
  });

  assert.deepEqual(result, {
    gasLimit: 21_000n,
    maxFeePerGas: 2_000_000_000n,
    maxPriorityFeePerGas: 1_000_000_000n,
  });
  assert.equal(result.gasLimit * result.maxFeePerGas, 42_000_000_000_000n);
});
