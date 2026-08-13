import assert from "node:assert/strict";
import test from "node:test";

import { PUMP_PROGRAM_ID, PUMP_SDK } from "@pump-fun/pump-sdk";
import { PumpLaunchDraftSchema } from "@silfable/contracts";
import { createKeyPairSignerFromPrivateKeyBytes } from "@solana/kit";
import { Keypair } from "@solana/web3.js";

import { encodeAndInspectPumpLaunchInstruction } from "./launch-codec.js";
import {
  markPumpLaunchBroadcastUnknown,
  markPumpLaunchFailed,
  markPumpLaunchFinalized,
  PumpLaunchPreflightService,
  type PumpLaunchPreflightRpc,
} from "./launch-preflight.js";

const NOW = new Date("2026-07-28T00:00:00.000Z");
const CREATOR_KEYPAIR = Keypair.generate();
const CREATOR = CREATOR_KEYPAIR.publicKey.toBase58();
const BLOCKHASH = Keypair.generate().publicKey.toBase58();
const draft = PumpLaunchDraftSchema.parse({
  id: "d9b5e590-15a8-4b07-af9c-e4ec3b2c71a3",
  creatorWallet: CREATOR,
  metadata: {
    name: "Example Coin",
    symbol: "EXAMPLE",
    description: "An explicit reviewable token launch.",
    imageUri: "https://gateway.pinata.cloud/ipfs/bafyimage",
    metadataUri: "ipfs://bafymetadata",
    websiteUrl: null,
    xUrl: null,
    telegramUrl: null,
  },
  quoteAsset: "SOL",
  initialPurchaseAmount: "0",
  maxCreatorOutflowLamports: "100000000",
  maxPriorityFeeLamports: "100000",
  deadlineAt: "2026-07-28T00:30:00.000Z",
  acknowledgedIrreversiblePublication: true,
  lifecycle: "draft-only",
  executionAllowed: false,
  createdAt: NOW.toISOString(),
});

test("local create_v2 codec remains byte-for-byte compatible with the pinned official SDK", async () => {
  const mint = Keypair.generate().publicKey;
  const creator = Keypair.generate().publicKey;
  const local = await encodeAndInspectPumpLaunchInstruction({
    creatorWallet: creator.toBase58(),
    mintAddress: mint.toBase58(),
    name: "Example Coin",
    symbol: "EXAMPLE",
    metadataUri: "ipfs://bafymetadata",
  });
  const official = await PUMP_SDK.createV2Instruction({
    mint,
    name: "Example Coin",
    symbol: "EXAMPLE",
    uri: "ipfs://bafymetadata",
    creator,
    user: creator,
    mayhemMode: false,
    cashback: false,
  });

  assert.equal(local.programAddress, official.programId.toBase58());
  assert.deepEqual(
    local.accounts.map(({ address, signer, writable }) => ({ address, signer, writable })),
    official.keys.map((key) => ({
      address: key.pubkey.toBase58(),
      signer: key.isSigner,
      writable: key.isWritable,
    })),
  );
  assert.deepEqual(Buffer.from(local.data), Buffer.from(official.data));
});

test("Token Launch preflight builds, inspects, and simulates an unsigned create_v2 transaction", async () => {
  let accountCalls = 0;
  const rpc: PumpLaunchPreflightRpc = {
    async getMultipleAccountsInfoAndContext(addresses) {
      accountCalls += 1;
      if (accountCalls === 1) {
        assert.deepEqual(addresses.length, 1);
        return {
          context: { slot: 100 },
          value: [{ lamports: 1, owner: PUMP_PROGRAM_ID.toBase58(), data: new Uint8Array([1]) }],
        };
      }
      return { context: { slot: 101 }, value: addresses.map(() => null) };
    },
    async getLatestBlockhashAndContext() {
      return { context: { slot: 101 }, value: { blockhash: BLOCKHASH, lastValidBlockHeight: 999 } };
    },
    async getBalanceAndContext() {
      return { context: { slot: 101 }, value: "1000000000" };
    },
    async getBlockHeight() {
      return 900;
    },
    async getFeeForMessage(message) {
      assert.ok(Buffer.from(message, "base64").length > 0);
      return { context: { slot: 101 }, value: 105000 };
    },
    async simulateTransaction(_transaction, config) {
      return {
        context: { slot: 101 },
        value: {
          err: null,
          logs: [
            `Program ${PUMP_PROGRAM_ID.toBase58()} invoke [1]`,
            "Program 11111111111111111111111111111111 invoke [2]",
            "Program 11111111111111111111111111111111 success",
            `Program ${PUMP_PROGRAM_ID.toBase58()} success`,
          ],
          unitsConsumed: 180000,
          accounts: config.accounts.addresses.map(() => ({ lamports: 1000, data: ["", "base64"] as [string, "base64"] })),
          innerInstructions: [],
        },
      };
    },
  };
  const service = new PumpLaunchPreflightService(rpc, {
    decodeGlobal: () => ({ createV2Enabled: true, mayhemModeEnabled: false, isCashbackEnabled: false }),
  });
  const preflight = await service.prepare({ draft, metadataUri: "ipfs://bafymetadata", now: NOW });

  assert.equal(preflight.lifecycle, "unsigned-preflight");
  assert.equal(preflight.instructionName, "create_v2");
  assert.equal(preflight.sdkVersion, "1.36.0");
  assert.equal(preflight.creatorWallet, CREATOR);
  assert.equal(preflight.signerAddresses[0], CREATOR);
  assert.equal(preflight.signerAddresses[1], preflight.mintAddress);
  assert.equal(preflight.computeUnitsConsumed, 180000);
  assert.equal(preflight.networkFeeLamports, "105000");
  assert.equal(preflight.priorityFeeLamports, "100000");
  assert.equal(preflight.signed, false);
  assert.equal(preflight.broadcastAttempted, false);
  assert.equal(preflight.executionAllowed, false);
  assert.equal(preflight.checks.every((check) => check.status === "pass"), true);
  assert.match(preflight.transactionDigest, /^[a-f0-9]{64}$/u);
  assert.notEqual(service.getPrepared(preflight.id, NOW), null);
  const revalidation = await service.finalRevalidate({
    draft,
    preflightId: preflight.id,
    now: new Date("2026-07-28T00:01:00.000Z"),
  });
  assert.equal(revalidation.status, "ready-for-password");
  assert.equal(revalidation.checks.every((check) => check.passed), true);
  const walletSigner = await createKeyPairSignerFromPrivateKeyBytes(CREATOR_KEYPAIR.secretKey.subarray(0, 32));
  const signed = await service.signPrepared({
    revalidationId: revalidation.id,
    walletSigner,
    now: new Date("2026-07-28T00:01:01.000Z"),
  });
  assert.equal(signed.execution.status, "signed-not-broadcast");
  assert.equal(signed.execution.broadcastAttempted, false);
  assert.equal(signed.execution.creatorWallet, CREATOR);
  assert.equal(signed.execution.mintAddress, preflight.mintAddress);
  assert.ok(Buffer.from(signed.signedTransactionBase64, "base64").length > 0);
  const unknown = markPumpLaunchBroadcastUnknown(signed.execution, "RPC timeout", new Date("2026-07-28T00:01:02.000Z"));
  assert.equal(unknown.status, "broadcast-unknown");
  assert.equal(unknown.broadcastAttempted, true);
  const finalized = markPumpLaunchFinalized(unknown, {
    slot: 123,
    feeLamports: 5_000,
    accountCreationFundingLamports: 2_039_280,
    walletPreLamports: "100000000",
    walletPostLamports: "97955720",
    walletOutflowLamports: "2044280",
  }, new Date("2026-07-28T00:01:03.000Z"));
  assert.equal(finalized.status, "finalized");
  assert.equal(finalized.finalizedSlot, 123);
  assert.equal(finalized.mintAccountVerified, true);
  assert.equal(finalized.actualNetworkFeeLamports, 5_000);
  assert.equal(finalized.actualWalletOutflowLamports, "2044280");
  assert.equal(finalized.settlementVerified, true);
  const failed = markPumpLaunchFailed(unknown, "{\"InstructionError\":[0,\"Custom\"]}", new Date("2026-07-28T00:01:03.000Z"));
  assert.equal(failed.status, "failed");
  assert.doesNotMatch(failed.error ?? "", /^\{/u);
  await assert.rejects(
    () => service.signPrepared({
      revalidationId: revalidation.id,
      walletSigner,
      now: new Date("2026-07-28T00:01:02.000Z"),
    }),
    /stale|consumed/u,
  );
  assert.equal(service.getPrepared(preflight.id, new Date("2026-07-28T00:11:00.000Z")), null);
});

test("Token Launch preflight blocks initial purchase and mismatched metadata before RPC", async () => {
  let calls = 0;
  const rpc = {
    async getMultipleAccountsInfoAndContext() {
      calls += 1;
      throw new Error("must not be reached");
    },
  } as unknown as PumpLaunchPreflightRpc;
  const service = new PumpLaunchPreflightService(rpc, {
    decodeGlobal: () => ({ createV2Enabled: true, mayhemModeEnabled: false, isCashbackEnabled: false }),
  });

  await assert.rejects(
    () => service.prepare({
      draft: PumpLaunchDraftSchema.parse({ ...draft, initialPurchaseAmount: "1" }),
      metadataUri: "ipfs://bafymetadata",
      now: NOW,
    }),
    /Initial purchase/u,
  );
  await assert.rejects(
    () => service.prepare({ draft, metadataUri: "ipfs://different", now: NOW }),
    /does not match/u,
  );
  assert.equal(calls, 0);
});
