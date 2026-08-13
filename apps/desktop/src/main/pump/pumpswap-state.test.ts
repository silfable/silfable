import assert from "node:assert/strict";
import test from "node:test";

import {
  resolvePumpSwapFinalizedBuildEvidence,
  type PumpSwapFinalizedAccountReader,
} from "./pumpswap-state.js";

const MINT = "7LSsEoJGhLeZzGvDofTdNg7M3JttxQqGWNLo6vWMpump";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const PUMP_SWAP = "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA";

function mockMintData(): Uint8Array {
  const data = new Uint8Array(82);
  const view = new DataView(data.buffer);
  view.setUint32(0, 0, true); // mintAuthority = null
  view.setBigUint64(4, 1_000_000_000_000_000n, true); // supply
  data[44] = 6; // decimals
  data[45] = 1; // isInitialized = true
  view.setUint32(46, 0, true); // freezeAuthority = null
  return data;
}

function mockPoolData(): Uint8Array {
  const data = new Uint8Array(200);
  return data;
}

function createMockReader(): PumpSwapFinalizedAccountReader {
  return {
    async getMultipleAccountsInfoAndContext() {
      return {
        context: { slot: 500 },
        value: [
          { data: mockPoolData(), owner: PUMP_SWAP },
          { data: mockMintData(), owner: TOKEN_PROGRAM },
          { data: new Uint8Array(165), owner: TOKEN_PROGRAM },
          { data: new Uint8Array(165), owner: TOKEN_PROGRAM },
        ],
      };
    },
  };
}

test("resolvePumpSwapFinalizedBuildEvidence parses pool evidence correctly", async () => {
  const reader = createMockReader();
  const evidence = await resolvePumpSwapFinalizedBuildEvidence(reader, MINT);
  assert.equal(evidence.mint, MINT);
  assert.equal(evidence.tokenProgram, TOKEN_PROGRAM);
  assert.equal(evidence.slot, 500);
  assert.equal(evidence.mintSecurity.initialized, true);
  assert.equal(evidence.mintSecurity.mintAuthority, null);
  assert.equal(evidence.mintSecurity.freezeAuthority, null);
});

test("resolvePumpSwapFinalizedBuildEvidence rejects unrevoked mint authority", async () => {
  const reader: PumpSwapFinalizedAccountReader = {
    async getMultipleAccountsInfoAndContext() {
      const mintData = mockMintData();
      const view = new DataView(mintData.buffer);
      view.setUint32(0, 1, true); // mintAuthority present
      return {
        context: { slot: 500 },
        value: [
          { data: mockPoolData(), owner: PUMP_SWAP },
          { data: mintData, owner: TOKEN_PROGRAM },
          null,
          null,
        ],
      };
    },
  };

  await assert.rejects(
    () => resolvePumpSwapFinalizedBuildEvidence(reader, MINT),
    /mint authority has not been revoked/,
  );
});

test("resolvePumpSwapFinalizedBuildEvidence rejects incomplete pool data without fallback accounts", async () => {
  const reader: PumpSwapFinalizedAccountReader = {
    async getMultipleAccountsInfoAndContext() {
      return {
        context: { slot: 500 },
        value: [
          { data: new Uint8Array(199), owner: PUMP_SWAP },
          { data: mockMintData(), owner: TOKEN_PROGRAM },
          { data: new Uint8Array(165), owner: TOKEN_PROGRAM },
          { data: new Uint8Array(165), owner: TOKEN_PROGRAM },
        ],
      };
    },
  };

  await assert.rejects(
    () => resolvePumpSwapFinalizedBuildEvidence(reader, MINT),
    /pool account data is incomplete/u,
  );
});
