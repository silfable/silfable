import assert from "node:assert/strict";
import test from "node:test";

import { MAYHEM_PROGRAM_ID } from "../pump/launch-codec.js";
import { PUMP_PROGRAM_ID } from "../pump/inspector.js";
import { allowedSolanaPrograms, SOLANA_PROGRAM_POLICY } from "./solana-program-policy.js";

test("Solana program policy has unique pinned addresses and bounded rationales", () => {
  const addresses = SOLANA_PROGRAM_POLICY.map((entry) => entry.address);
  assert.equal(new Set(addresses).size, addresses.length);
  for (const entry of SOLANA_PROGRAM_POLICY) {
    assert.match(entry.address, /^[1-9A-HJ-NP-Za-km-z]{32,44}$/u);
    assert.ok(entry.rationale.length >= 20 && entry.rationale.length <= 180);
    assert.ok(entry.lanes.length >= 1);
  }
});

test("lane allowlists do not leak Pump launch authority into Jupiter swaps", () => {
  const jupiter = allowedSolanaPrograms("jupiter-swap");
  const launch = allowedSolanaPrograms("pump-token-launch");
  assert.equal(jupiter.has("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4"), true);
  assert.equal(jupiter.has("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"), false);
  assert.equal(launch.has("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"), true);
  assert.equal(launch.has("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4"), false);
  assert.equal(launch.has(PUMP_PROGRAM_ID), true);
  assert.equal(launch.has(MAYHEM_PROGRAM_ID), true);
});
