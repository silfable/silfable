import assert from "node:assert/strict";
import { test } from "node:test";

import { resolvePumpV2FinalizedBuildEvidence, type PumpFinalizedAccountReader } from "./state.js";
import { PUMP_FEE_PROGRAM_ID, PUMP_PROGRAM_ID } from "./inspector.js";

const TOKEN_MINT = "7LSsEoJGhLeZzGvDofTdNg7M3JttxQqGWNLo6vWMpump";
const CREATOR = "5L5k7gtNLbeXdzpvNrFshg1E1id1ceUDfc6vPUTxp98q";
const FEE_RECIPIENT = "62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV";
const BUYBACK_RECIPIENT = "5YxQFdt3Tr9zJLvkFccqXVUwhdTWJQc1fFg2YPbxvxeD";
const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
// Frozen finalized Mainnet account payloads. Tests never contact RPC.
const GLOBAL_DATA = Buffer.from("p+joschscn8B07uMqzQc4FKEV/LDgX0yeEQZY9zVX+1YuiTJmd2sAqpKwvjQ3Vy8l+MonBl8tQYqVPPZVrnOblEV+WVnqlyz5gAQ2EfjzwMAAKwj/AYAAAAAeMX7UdECAACAxqR+jQMAXwAAAAAAAAAf6nQ58860xO9Lucx77kChpiYXG2hBX+3tQLeolW+E5wHB4eQAAAAAAAUAAAAAAAAAYIzMHfzpYbQ7d5wZFQWm4tO/RdWk20YYrXbILWF1RTVjg3MADqIssmTTSv9koEte+r+7dN3NBImXsZgVR9fREIOEdCkuZ1qUtDbssKmYiUIyioPdxiM4ApYSZ8XNYRfLjRgaDISfqTem80re0wge+VcAqssMm7PZCaS5FHUnpOutEeak/ClEpPqCUb74FUJuG/soxrZkZndgfGrZ9WamRteqj7Bg2CkbTE1HXa/3Yslr3A2s6zbAEurRLtOpSEFh4ATIfOuY+lzkf4A4Bv0seUXSlSSVmuwA3tl4FPOPeEYf6nQ58860xO9Lucx77kChpiYXG2hBX+3tQLeolW+E5wchXZlAeTaU4RYGbORZuBj9+bugx7QbeD+joSDKQZUyAaKLX9JqtHmmqcxsv2sLI+thiFo3HgEgrKkTvu89E4p46JMUH7GOnxV02BDheOGeMGBOMXWqLkoy38hgByfRBwkBNYRTYlYJT5EoGRJ++k5Ea0MzcheT0Th2+arb89x9C19udQGCIPlCZ3ADI3tNa0U3WbSlxpC1nDXZuxh6CQy9KjOYep67E2eZq1mSWxPl3Iswgd8AXbQnwUePpG/4w0egdOlUPz43otBGInrdy06cd0xEJYxD7fJKqKrh8AIUZlvaTDjNbbdDj1m0CLuew7TKnorR8fJGU8SZtXlsINv5sy3dnuo/ObNyEVxxhHwYRc+lNsaFB04DDkTQId4++eNcTLeA8I7i/uhL7ERqV3gl2mjUOfqKXaOwxc/1D2P0VGsBQ55lEMA9ZfrZMeidBL4Ltw1Rlx9RxBX7NEwH20GfISICI1UWqRcTTGdYjEk4IK4VXulmZVd6wbcY2kfdzyoFDuan4iBou4hkCqV/kJMIxh/vcRoBY/WnVcBwvIYNH2NnIHzs2lvMbLHq8PFtaEBFZrGNVtJIGssxcDJlbpBVHHhElkH4SVjcc6dqhdh1b1XALNrKiboZMnkMNoqxV+ktc8VLlrXJMZQeRupL4uDjESd0T8a3TPtFXv6vi9VxeSztRPwfePlKM9CQnF5rX7AhVwrY262N6P2z0g7RzZnrjk6HcBV+6+tnimVduZs39rEybHZX25DPuKh6vvjHtvLIaYgTAAAAAAAAALnS/wAAAADG+nrzvtutOj1l82qryXQxsbvkwtL24OR8pgIDRS9dYQ==", "base64");
const CURVE_DATA = Buffer.from("F7f4N2DYrGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAxqR+jQMAAUBSJXvOKKUQdTokJiE6YgocGypswlhuYW526HQhLhuuAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "base64");

test("Pump v2 state resolver derives creator and fee allowlists only from one finalized snapshot", async () => {
  const reader = await fixtureReader();
  const evidence = await resolvePumpV2FinalizedBuildEvidence(reader, TOKEN_MINT, new Date("2026-07-22T00:00:00.000Z"));
  assert.equal(evidence.mint, TOKEN_MINT);
  assert.equal(evidence.creator, CREATOR);
  assert.equal(evidence.feeRecipients.includes(FEE_RECIPIENT), true);
  assert.equal(evidence.buybackFeeRecipients.includes(BUYBACK_RECIPIENT), true);
  assert.equal(evidence.tokenProgram, TOKEN_PROGRAM_ID);
  assert.deepEqual(evidence.mintSecurity, { initialized: true, mintAuthority: null, freezeAuthority: null });
  assert.equal(evidence.slot, 456_789);
  assert.equal(evidence.commitment, "finalized");
});

test("Pump v2 state resolver rejects completed curves before a Pump instruction can be built", async () => {
  const reader = await fixtureReader({ complete: true });
  await assert.rejects(() => resolvePumpV2FinalizedBuildEvidence(reader, TOKEN_MINT), /curve is complete/u);
});

test("Pump v2 state resolver rejects a mint outside the token-program allowlist", async () => {
  const reader = await fixtureReader({ mintOwner: "11111111111111111111111111111111" });
  await assert.rejects(() => resolvePumpV2FinalizedBuildEvidence(reader, TOKEN_MINT), /allowlisted token program/u);
});

test("Pump v2 state resolver decodes the finalized fee-program schedule", async () => {
  const reader = await fixtureReader({ feeConfig: true });
  const evidence = await resolvePumpV2FinalizedBuildEvidence(reader, TOKEN_MINT);
  assert.deepEqual(evidence.feeSchedule, {
    source: "fee-config",
    protocolFeeBps: "95",
    creatorFeeBps: "30",
    buybackAllocationBps: "5000",
    tiers: [{ marketCapQuoteThreshold: "500000", protocolFeeBps: "80", creatorFeeBps: "20" }],
  });
});

async function fixtureReader(options: { complete?: boolean; mintOwner?: string; mintAuthority?: boolean; freezeAuthority?: boolean; feeConfig?: boolean } = {}): Promise<PumpFinalizedAccountReader> {
  const curveData = Buffer.from(CURVE_DATA);
  curveData[48] = options.complete ? 1 : 0;
  const mintData = Buffer.alloc(82);
  mintData[45] = 1;
  if (options.mintAuthority) { mintData.writeUInt32LE(1, 0); mintData.fill(1, 4, 36); }
  if (options.freezeAuthority) { mintData.writeUInt32LE(1, 46); mintData.fill(2, 50, 82); }
  const account = (data: Buffer, owner: string) => ({ data, owner });
  return {
    async getMultipleAccountsInfoAndContext() {
      return {
        context: { slot: 456_789 },
        value: [
          account(GLOBAL_DATA, PUMP_PROGRAM_ID),
          account(curveData, PUMP_PROGRAM_ID),
          account(mintData, options.mintOwner ?? TOKEN_PROGRAM_ID),
          options.feeConfig ? account(feeConfigData(), PUMP_FEE_PROGRAM_ID) : null,
        ],
      };
    },
  };
}

test("Pump v2 state resolver rejects live mint and freeze authorities", async () => {
  const mintAuthorityReader = await fixtureReader({ mintAuthority: true });
  const freezeAuthorityReader = await fixtureReader({ freezeAuthority: true });
  await assert.rejects(() => resolvePumpV2FinalizedBuildEvidence(mintAuthorityReader, TOKEN_MINT), /mint authority has not been revoked/u);
  await assert.rejects(() => resolvePumpV2FinalizedBuildEvidence(freezeAuthorityReader, TOKEN_MINT), /freeze authority has not been revoked/u);
});

function feeConfigData(): Buffer {
  const data = Buffer.alloc(113);
  Buffer.from([143, 52, 146, 187, 219, 123, 76, 155]).copy(data, 0);
  data[8] = 1;
  data.writeBigUInt64LE(95n, 49);
  data.writeBigUInt64LE(30n, 57);
  data.writeUInt32LE(1, 65);
  data.writeBigUInt64LE(500_000n, 69);
  data.writeBigUInt64LE(80n, 93);
  data.writeBigUInt64LE(20n, 101);
  return data;
}
