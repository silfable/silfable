import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { RuntimeDatabase } from "../storage/database.js";
import { SessionService } from "./service.js";

class MemorySecrets {
  value: string | null = null;
  async getSecret() { return this.value; }
  async setSecret(_name: "session-data-key", value: string) { this.value = value; }
}

test("sessions survive reopen while message plaintext stays out of SQLite", async () => {
  const directory = await mkdtemp(join(tmpdir(), "silfable-sessions-"));
  const path = join(directory, "runtime.sqlite3");
  const secrets = new MemorySecrets();
  const session = {
    id: "00000000-0000-4000-8000-000000000001",
    title: "Wallet review",
    mode: "mission" as const,
    permission: "restricted" as const,
    workspace: "pump" as const,
    pumpConfig: {
      scope: "exact-mint" as const,
      objective: "monitor" as const,
      tokenMint: "So11111111111111111111111111111111111111112",
      lifecycle: "proposal-only" as const,
    },
    walletAddress: null,
    messages: [
      { id: "00000000-0000-4000-8000-000000000002", role: "user" as const, text: "private session question", at: "2026-07-21T00:00:00.000Z" },
      {
        id: "00000000-0000-4000-8000-000000000003",
        role: "assistant" as const,
        text: "Pump simulation passed without signing.",
        at: "2026-07-21T00:01:00.000Z",
        pumpSimulation: {
          status: "passed" as const,
          simulationSlot: 434_000_000,
          unitsConsumed: 123_456,
          networkFeeLamports: 5_000,
          rentLamports: 2_039_280,
          networkFeePercent: 0.5,
          totalKnownFeeLamports: "2056780",
          feeRisk: "reasonable" as const,
          invokedPrograms: ["6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"],
          logs: ["private finalized Pump simulation evidence"],
          error: null,
          transactionSigned: false as const,
          broadcastAttempted: false as const,
          simulatedAt: "2026-07-21T00:01:00.000Z",
        },
        pumpExecution: {
          id: "00000000-0000-4000-8000-000000000004",
          previewId: "00000000-0000-4000-8000-000000000005",
          signature: `5K${"A".repeat(62)}`,
          walletAddress: "11111111111111111111111111111111",
          tokenMint: "So11111111111111111111111111111111111111112",
          side: "buy" as const,
          transactionDigest: "a".repeat(64),
          lastValidBlockHeight: 434_000_123,
          status: "broadcast-unknown" as const,
          error: "RPC timeout; verification is pending and no rebroadcast is allowed.",
          createdAt: "2026-07-21T00:01:05.000Z",
          updatedAt: "2026-07-21T00:01:06.000Z",
        },
      },
    ],
    startedAt: "2026-07-21T00:00:00.000Z",
    usage: { input: 0, output: 0, total: 0, cost: null },
  };
  try {
    const database = await RuntimeDatabase.open(path);
    await new SessionService(database, secrets).upsert(session);
    database.close();
    assert.equal((await readFile(path)).includes(Buffer.from("private session question")), false);
    assert.equal((await readFile(path)).includes(Buffer.from("private finalized Pump simulation evidence")), false);
    assert.equal((await readFile(path)).includes(Buffer.from(`5K${"A".repeat(62)}`)), false);
    const reopened = await RuntimeDatabase.open(path);
    try {
      const reopenedSessions = await new SessionService(reopened, secrets).list();
      assert.deepEqual(reopenedSessions, [session]);
      assert.equal(reopenedSessions[0]?.messages[1]?.pumpExecution?.status, "broadcast-unknown");
    } finally {
      reopened.close();
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("sessions with mission execution receipts survive reopen cleanly while secrets stay encrypted", async () => {
  const directory = await mkdtemp(join(tmpdir(), "silfable-sessions-receipt-"));
  const path = join(directory, "runtime.sqlite3");
  const secrets = new MemorySecrets();
  const session = {
    id: "00000000-0000-4000-8000-000000000010",
    title: "Jupiter Swap Session",
    mode: "mission" as const,
    permission: "restricted" as const,
    workspace: "general" as const,
    walletAddress: "11111111111111111111111111111111",
    messages: [
      {
        id: "00000000-0000-4000-8000-000000000011",
        role: "assistant" as const,
        text: "Jupiter swap completed successfully.",
        at: "2026-07-24T12:00:00.000Z",
        missionExecution: {
          id: "00000000-0000-4000-8000-000000000012",
          missionId: "00000000-0000-4000-8000-000000000013",
          simulationId: "00000000-0000-4000-8000-000000000014",
          status: "confirmed" as const,
          signature: "5K123456789SecretSignatureStringHereForTesting123456789012345678",
          explorerUrl: "https://solscan.io/tx/5K123456789SecretSignatureStringHereForTesting123456789012345678",
          router: "metis",
          inputAmount: "100000000",
          outputAmount: "15000000",
          expectedOutputAmount: "15000000",
          actualSlippageBps: 0,
          actualSlippageRawAmount: "0",
          networkFeeLamports: 5000,
          actualNetworkFeeLamports: 5000,
          walletPreLamports: "1000000000",
          walletPostLamports: "899995000",
          totalWalletOutflowLamports: "100005000",
          accountFundingLamports: "0",
          walletAddress: "11111111111111111111111111111111",
          inputMint: "So11111111111111111111111111111111111111112",
          code: null,
          error: null,
          transactionSigned: true as const,
          broadcastAttempted: true as const,
          executedAt: "2026-07-24T12:00:00.000Z",
          chainVerification: "finalized" as const,
          chainSlot: 9999,
          chainError: null,
          verifiedAt: "2026-07-24T12:00:05.000Z",
        },
      },
    ],
    startedAt: "2026-07-24T12:00:00.000Z",
    usage: { input: 0, output: 0, total: 0, cost: null },
  };
  try {
    const database = await RuntimeDatabase.open(path);
    const service = new SessionService(database, secrets);
    await service.upsert(session);
    database.close();

    const rawDbContent = await readFile(path);
    assert.equal(rawDbContent.includes(Buffer.from("Jupiter swap completed successfully")), false);
    assert.equal(rawDbContent.includes(Buffer.from("5K123456789SecretSignatureStringHereForTesting123456789012345678")), false);

    let reopenedDb: RuntimeDatabase | null = await RuntimeDatabase.open(path);
    try {
      const reopenedService = new SessionService(reopenedDb, secrets);
      const fetched = await reopenedService.get(session.id);
      assert.notEqual(fetched, null);
      assert.equal(fetched?.messages[0]?.missionExecution?.signature, "5K123456789SecretSignatureStringHereForTesting123456789012345678");
      assert.equal(fetched?.messages[0]?.missionExecution?.status, "confirmed");
    } finally {
      reopenedDb.close();
      reopenedDb = null;
    }
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
});

test("unknown limit-order receipts survive restart and remain encrypted for manual verification", async () => {
  const directory = await mkdtemp(join(tmpdir(), "silfable-limit-receipts-"));
  const path = join(directory, "runtime.sqlite3");
  const secrets = new MemorySecrets();
  const depositSignature = "3".repeat(64);
  const withdrawalSignature = "4".repeat(64);
  const session = {
    id: "00000000-0000-4000-8000-000000000020",
    title: "Limit order recovery",
    mode: "mission" as const,
    permission: "restricted" as const,
    workspace: "general" as const,
    walletAddress: "11111111111111111111111111111111",
    messages: [
      {
        id: "00000000-0000-4000-8000-000000000021",
        role: "assistant" as const,
        text: "Limit order receipt is awaiting an on-chain verification check.",
        at: "2026-07-24T13:00:00.000Z",
        limitOrderExecution: {
          id: "00000000-0000-4000-8000-000000000022",
          previewId: "00000000-0000-4000-8000-000000000023",
          simulationId: "00000000-0000-4000-8000-000000000024",
          orderId: "order-123456",
          status: "unknown" as const,
          depositSignature,
          vaultAddress: "So11111111111111111111111111111111111111112",
          explorerUrl: `https://explorer.solana.com/tx/${depositSignature}`,
          depositConfirmed: false,
          chainVerification: "unavailable" as const,
          chainSlot: null,
          error: "Deposit broadcast status is unknown.",
          verifiedAt: null,
          createdAt: "2026-07-24T13:00:00.000Z",
        },
        limitOrderCancelReceipt: {
          id: "00000000-0000-4000-8000-000000000025",
          orderId: "order-123456",
          simulationId: "00000000-0000-4000-8000-000000000026",
          status: "unknown" as const,
          withdrawalSignature,
          explorerUrl: `https://explorer.solana.com/tx/${withdrawalSignature}`,
          chainVerification: "unavailable" as const,
          chainSlot: null,
          error: "Withdrawal broadcast status is unknown.",
          verifiedAt: null,
          createdAt: "2026-07-24T13:01:00.000Z",
        },
      },
    ],
    startedAt: "2026-07-24T13:00:00.000Z",
    usage: { input: 0, output: 0, total: 0, cost: null },
  };

  try {
    const database = await RuntimeDatabase.open(path);
    await new SessionService(database, secrets).upsert(session);
    database.close();

    const rawDbContent = await readFile(path);
    assert.equal(rawDbContent.includes(Buffer.from(depositSignature)), false);
    assert.equal(rawDbContent.includes(Buffer.from(withdrawalSignature)), false);

    const reopened = await RuntimeDatabase.open(path);
    try {
      const fetched = await new SessionService(reopened, secrets).get(session.id);
      assert.equal(
        fetched?.messages[0]?.limitOrderExecution?.status,
        "unknown",
      );
      assert.equal(
        fetched?.messages[0]?.limitOrderExecution?.depositSignature,
        depositSignature,
      );
      assert.equal(
        fetched?.messages[0]?.limitOrderCancelReceipt?.withdrawalSignature,
        withdrawalSignature,
      );
    } finally {
      reopened.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
});

test("unknown Jupiter broadcast keeps its local signature across encrypted restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "silfable-jupiter-unknown-"));
  const path = join(directory, "runtime.sqlite3");
  const secrets = new MemorySecrets();
  const signature = "5".repeat(64);
  const session = {
    id: "00000000-0000-4000-8000-000000000030",
    title: "Unknown Jupiter broadcast",
    mode: "mission" as const,
    permission: "restricted" as const,
    workspace: "general" as const,
    walletAddress: "11111111111111111111111111111111",
    messages: [{
      id: "00000000-0000-4000-8000-000000000031",
      role: "assistant" as const,
      text: "Broadcast status is unknown; verify the existing signature.",
      at: "2026-07-24T14:00:00.000Z",
      missionExecution: {
        id: "00000000-0000-4000-8000-000000000032",
        missionId: "00000000-0000-4000-8000-000000000033",
        simulationId: "00000000-0000-4000-8000-000000000034",
        status: "unknown" as const,
        signature,
        explorerUrl: `https://explorer.solana.com/tx/${signature}`,
        router: "metis",
        inputAmount: null,
        outputAmount: null,
        expectedOutputAmount: "6500000",
        actualSlippageBps: null,
        networkFeeLamports: 5000,
        actualNetworkFeeLamports: null,
        walletPreLamports: null,
        walletPostLamports: null,
        totalWalletOutflowLamports: null,
        accountFundingLamports: null,
        walletAddress: "11111111111111111111111111111111",
        inputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        code: null,
        error: "Jupiter broadcast timed out.",
        transactionSigned: true as const,
        broadcastAttempted: true as const,
        executedAt: "2026-07-24T14:00:00.000Z",
        chainVerification: "unavailable" as const,
        chainSlot: null,
        chainError: "Verify the locally derived signature; never rebroadcast.",
        verifiedAt: null,
      },
    }],
    startedAt: "2026-07-24T14:00:00.000Z",
    usage: { input: 0, output: 0, total: 0, cost: null },
  };

  try {
    const database = await RuntimeDatabase.open(path);
    await new SessionService(database, secrets).upsert(session);
    database.close();

    assert.equal((await readFile(path)).includes(Buffer.from(signature)), false);
    const reopened = await RuntimeDatabase.open(path);
    try {
      const fetched = await new SessionService(reopened, secrets).get(session.id);
      assert.equal(fetched?.messages[0]?.missionExecution?.status, "unknown");
      assert.equal(fetched?.messages[0]?.missionExecution?.signature, signature);
      assert.match(
        fetched?.messages[0]?.missionExecution?.chainError ?? "",
        /never rebroadcast/u,
      );
    } finally {
      reopened.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
});
