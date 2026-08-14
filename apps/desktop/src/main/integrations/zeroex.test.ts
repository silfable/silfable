import assert from "node:assert/strict";
import test from "node:test";

import { verifyZeroExRobinhoodSupport } from "./zeroex.js";

test("0x capability check accepts Robinhood Chain only when it is listed", async () => {
  const fetcher: typeof fetch = async (url, init) => {
    assert.equal(url, "https://api.0x.org/swap/chains");
    assert.equal(new Headers(init?.headers).get("0x-api-key"), "test-api-key");
    assert.equal(new Headers(init?.headers).get("0x-version"), "v2");
    return new Response(JSON.stringify({ chains: [{ chainId: 4663, chainName: "Robinhood" }] }), { status: 200 });
  };
  assert.deepEqual(await verifyZeroExRobinhoodSupport("test-api-key", fetcher), { chainId: 4663 });
});

test("0x capability check fails closed when Robinhood Chain is absent or the provider fails", async () => {
  await assert.rejects(
    () => verifyZeroExRobinhoodSupport("test-api-key", async () => new Response(JSON.stringify({ chains: [{ chainId: 1 }] }), { status: 200 })),
    /does not currently report Robinhood Chain/u,
  );
  await assert.rejects(
    () => verifyZeroExRobinhoodSupport("test-api-key", async () => new Response("denied", { status: 401 })),
    /rejected the capability check/u,
  );
});
