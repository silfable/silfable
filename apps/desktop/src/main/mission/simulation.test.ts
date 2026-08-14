import assert from "node:assert/strict";
import test from "node:test";

import {
  address,
  appendTransactionMessageInstruction,
  blockhash,
  compileTransaction,
  createTransactionMessage,
  createKeyPairSignerFromPrivateKeyBytes,
  getSignatureFromTransaction,
  getTransactionDecoder,
  getTransactionEncoder,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/kit";
import type { MissionContractPreview } from "@silfable/contracts";

import type { MainnetReadService } from "../integrations/read-only.js";
import type { WalletOnboardingService } from "../wallet/onboarding.js";
import { MissionSimulationService, resolveSwapReceiptStatus } from "./simulation.js";

const WALLET = "11111111111111111111111111111111";
const SOL = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SELECTED_WALLET = "SysvarRent111111111111111111111111111111111";
const WALLETS = {} as WalletOnboardingService;

test("mission simulation revalidates policy and never builds an order after balance evidence changes", async () => {
  let orderBuildAttempted = false;
  const reads = {
    portfolio: async () => ({ address: WALLET, slot: 1, solBalance: "0", solUsdPrice: 150, totalUsd: 0, assets: [], verifiedAt: new Date().toISOString() }),
    swapQuote: async () => ({ inputMint: SOL, outputMint: USDC, inAmount: "100000000", outAmount: "15000000", router: "metis", mode: "ultra", feeBps: 2, feeMint: SOL, quoteOnly: true as const, verifiedAt: new Date().toISOString() }),
    buildUnsignedSwapOrder: async () => {
      orderBuildAttempted = true;
      throw new Error("must not build");
    },
  } as unknown as MainnetReadService;
  const mission: MissionContractPreview = {
    id: "00000000-0000-4000-8000-000000000001",
    status: "ready-for-review",
    goal: "Preview selling 0.1 SOL for USDC",
    walletAddress: WALLET,
    inputMint: SOL,
    outputMint: USDC,
    inputAmount: "100000000",
    maxSlippageBps: 100,
    deadlineAt: new Date(Date.now() + 60 * 60_000).toISOString(),
    stopConditions: ["Stop if any policy check fails"],
    quote: { inputMint: SOL, outputMint: USDC, inAmount: "100000000", outAmount: "15000000", router: "metis", mode: "ultra", feeBps: 2, feeMint: SOL, quoteOnly: true, verifiedAt: new Date().toISOString() },
    checks: [{ code: "balance_sufficient", status: "pass", message: "Previously sufficient" }],
    executionAllowed: false,
    createdAt: new Date().toISOString(),
  };
  const result = await new MissionSimulationService(reads, WALLETS).simulate(mission);
  assert.equal(result.status, "blocked");
  assert.equal(result.transactionSigned, false);
  assert.equal(result.broadcastAttempted, false);
  assert.equal(orderBuildAttempted, false);
});

test("mission simulation accepts an unsigned sole-signer transaction with an allowlisted program", async () => {
  const transaction = unsignedTransaction("11111111111111111111111111111111");
  const reads = passingReads(transaction, {
    slot: 2,
    err: null,
    logs: ["Program 11111111111111111111111111111111 success"],
    unitsConsumed: 500,
    feeLamports: 5000,
  });
  const result = await new MissionSimulationService(reads, WALLETS).simulate(missionFor(SELECTED_WALLET));
  assert.equal(result.status, "passed");
  assert.deepEqual(result.programIds, ["11111111111111111111111111111111"]);
  assert.equal(result.transactionSigned, false);
  assert.equal(result.broadcastAttempted, false);
});

test("mission simulation accepts the explicitly allowlisted OKX Aggregator V6 route", async () => {
  const program = "proVF4pMXVaYqmy4NjniPh4pqKNfMmsihgd4wdkCX3u";
  const transaction = unsignedTransaction(program);
  const reads = passingReads(transaction, {
    slot: 2,
    err: null,
    logs: [`Program ${program} success`],
    unitsConsumed: 700,
    feeLamports: 5000,
  });
  const result = await new MissionSimulationService(reads, WALLETS).simulate(missionFor(SELECTED_WALLET));
  assert.equal(result.status, "passed");
  assert.deepEqual(result.programIds, [program]);
  assert.equal(result.transactionSigned, false);
  assert.equal(result.broadcastAttempted, false);
});

test("P2 reverse swap simulates USDC to SOL with finalized token balance evidence", async () => {
  const mission: MissionContractPreview = {
    ...missionFor(SELECTED_WALLET),
    goal: "Preview selling 1 USDC for SOL",
    inputMint: USDC,
    outputMint: SOL,
    inputAmount: "1000000",
    quote: {
      inputMint: USDC,
      outputMint: SOL,
      inAmount: "1000000",
      outAmount: "6500000",
      router: "metis",
      mode: "ultra",
      feeBps: 2,
      feeMint: USDC,
      quoteOnly: true,
      verifiedAt: new Date().toISOString(),
    },
  };
  const transaction = unsignedTransaction("11111111111111111111111111111111");
  let builtPair = "";
  const reads = {
    portfolio: async () => ({
      address: SELECTED_WALLET,
      slot: 1,
      solBalance: "1",
      solUsdPrice: 150,
      totalUsd: 151,
      assets: [{
        mint: USDC,
        symbol: "USDC",
        amount: "1000000",
        balance: "1",
        decimals: 6,
        usdPrice: 1,
        usdValue: 1,
        logoUri: null,
      }],
      verifiedAt: new Date().toISOString(),
    }),
    swapQuote: async (inputMint: string, outputMint: string) => ({
      inputMint,
      outputMint,
      inAmount: "1000000",
      outAmount: "6500000",
      router: "metis",
      mode: "ultra",
      feeBps: 2,
      feeMint: USDC,
      quoteOnly: true as const,
      verifiedAt: new Date().toISOString(),
    }),
    buildUnsignedSwapOrder: async (inputMint: string, outputMint: string) => {
      builtPair = `${inputMint}->${outputMint}`;
      return {
        transaction,
        requestId: "private-order-id",
        lastValidBlockHeight: "12345",
        outAmount: "6500000",
        router: "metis",
        mode: "ultra",
      };
    },
    simulateUnsignedTransaction: async () => ({
      slot: 2,
      err: null,
      logs: [],
      unitsConsumed: 500,
      feeLamports: 5000,
    }),
  } as unknown as MainnetReadService;

  const result = await new MissionSimulationService(reads, WALLETS).simulate(mission);
  assert.equal(result.status, "passed");
  assert.equal(builtPair, `${USDC}->${SOL}`);
  assert.equal(result.transactionSigned, false);
  assert.equal(result.broadcastAttempted, false);
});

test("P2 reverse swap blocks insufficient USDC before construction or signing", async () => {
  const mission: MissionContractPreview = {
    ...missionFor(SELECTED_WALLET),
    inputMint: USDC,
    outputMint: SOL,
    inputAmount: "1000000",
  };
  let constructionAttempts = 0;
  const reads = {
    portfolio: async () => ({
      address: SELECTED_WALLET,
      slot: 1,
      solBalance: "1",
      solUsdPrice: 150,
      totalUsd: 150,
      assets: [],
      verifiedAt: new Date().toISOString(),
    }),
    swapQuote: async () => ({
      inputMint: USDC,
      outputMint: SOL,
      inAmount: "1000000",
      outAmount: "6500000",
      router: "metis",
      mode: "ultra",
      feeBps: 2,
      feeMint: USDC,
      quoteOnly: true as const,
      verifiedAt: new Date().toISOString(),
    }),
    buildUnsignedSwapOrder: async () => {
      constructionAttempts += 1;
      throw new Error("must not construct");
    },
  } as unknown as MainnetReadService;

  const result = await new MissionSimulationService(reads, WALLETS).simulate(mission);
  assert.equal(result.status, "blocked");
  assert.match(result.error ?? "", /policy no longer passes/iu);
  assert.equal(constructionAttempts, 0);
  assert.equal(result.transactionSigned, false);
  assert.equal(result.broadcastAttempted, false);
});

test("fee guard blocks an excessive simulated fee before the signer can be reached", async () => {
  const transaction = unsignedTransaction("11111111111111111111111111111111");
  const reads = passingReads(transaction, { slot: 2, err: null, logs: [], unitsConsumed: 500, feeLamports: 250_000 });
  const settings = { get: () => ({ maxNetworkFeeLamports: 200_000, maxFeePercent: 5, defaultSlippageBps: 50, maxSlippageBps: 300, defaultDeadlineMinutes: 30, priority: "standard" as const }) };
  const result = await new MissionSimulationService(reads, WALLETS, settings).simulate(missionFor(SELECTED_WALLET));
  assert.equal(result.status, "blocked");
  assert.equal(result.feeRisk, "extreme");
  assert.equal(result.feeGuardPassed, false);
  assert.match(result.feeGuardMessage ?? "", /exceeds the configured limit/u);
  assert.equal(result.transactionSigned, false);
  assert.equal(result.broadcastAttempted, false);
});

test("P2 percentage fee ceiling blocks before signer access even below the absolute ceiling", async () => {
  const transaction = unsignedTransaction("11111111111111111111111111111111");
  const reads = passingReads(transaction, { slot: 2, err: null, logs: [], unitsConsumed: 500, feeLamports: 150_000 });
  let signerAttempts = 0;
  const wallets = {
    withWalletSigner: async () => {
      signerAttempts += 1;
      throw new Error("signer must remain sealed");
    },
  } as unknown as WalletOnboardingService;
  const settings = { get: () => ({ maxNetworkFeeLamports: 200_000, maxFeePercent: 0.1, defaultSlippageBps: 50, maxSlippageBps: 300, defaultDeadlineMinutes: 30, priority: "standard" as const }) };
  const service = new MissionSimulationService(reads, wallets, settings);
  const mission = missionFor(SELECTED_WALLET);
  const simulation = await service.simulate(mission);
  assert.equal(simulation.status, "blocked");
  assert.equal(simulation.feeRisk, "extreme");
  assert.equal(simulation.feeGuardPassed, false);
  assert.match(simulation.feeGuardMessage ?? "", /0\.15%/u);
  await assert.rejects(() => service.execute(mission, simulation.id), /approval expired/u);
  assert.equal(signerAttempts, 0);
});

test("P2 simulation exposes account funding and estimated SOL wallet outflow separately", async () => {
  const transaction = unsignedTransaction("11111111111111111111111111111111");
  const reads = passingReads(transaction, {
    slot: 2,
    err: null,
    logs: [],
    unitsConsumed: 500,
    feeLamports: 5_000,
    accountCreationFundingLamports: 2_039_280,
    estimatedWalletOutflowLamports: "102044280",
  });
  const result = await new MissionSimulationService(reads, WALLETS).simulate(missionFor(SELECTED_WALLET));
  assert.equal(result.status, "passed");
  assert.equal(result.feeLamports, 5_000);
  assert.equal(result.accountFundingLamports, 2_039_280);
  assert.equal(result.estimatedWalletOutflowLamports, "102044280");
});

test("P2 final wallet impact increase blocks before the vault signer is opened", async () => {
  const signer = await createKeyPairSignerFromPrivateKeyBytes(Uint8Array.from({ length: 32 }, (_, index) => index + 1));
  const mission = missionFor(signer.address);
  const transaction = unsignedTransactionFor(signer.address, "11111111111111111111111111111111");
  let simulationAttempts = 0;
  let signerAttempts = 0;
  const reads = {
    portfolio: async () => ({ address: signer.address, slot: 1, solBalance: "1000000000", solUsdPrice: 150, totalUsd: 150, assets: [], verifiedAt: new Date().toISOString() }),
    swapQuote: async () => ({ inputMint: SOL, outputMint: USDC, inAmount: mission.inputAmount, outAmount: "15000000", router: "metis", mode: "ultra", feeBps: 2, feeMint: SOL, quoteOnly: true as const, verifiedAt: new Date().toISOString() }),
    buildUnsignedSwapOrder: async () => ({ transaction, requestId: "private-order-id", lastValidBlockHeight: "12345", outAmount: "15000000", router: "metis", mode: "ultra" }),
    simulateUnsignedTransaction: async () => {
      simulationAttempts += 1;
      return {
        slot: simulationAttempts,
        err: null,
        logs: [],
        unitsConsumed: 500,
        feeLamports: 5_000,
        accountCreationFundingLamports: simulationAttempts === 1 ? 2_039_280 : 3_039_280,
        estimatedWalletOutflowLamports: simulationAttempts === 1 ? "102044280" : "103044280",
      };
    },
  } as unknown as MainnetReadService;
  const wallets = {
    withWalletSigner: async () => {
      signerAttempts += 1;
      throw new Error("signer must remain sealed");
    },
  } as unknown as WalletOnboardingService;
  const service = new MissionSimulationService(reads, wallets);
  const simulation = await service.simulate(mission);
  assert.equal(simulation.status, "passed");
  await assert.rejects(() => service.execute(mission, simulation.id), /account funding exceeds the reviewed simulation/u);
  assert.equal(simulationAttempts, 2);
  assert.equal(signerAttempts, 0);
});

test("mission simulation blocks a transaction containing a non-allowlisted program before RPC simulation", async () => {
  let simulated = false;
  const transaction = unsignedTransaction("Vote111111111111111111111111111111111111111");
  const reads = passingReads(transaction, null, () => { simulated = true; });
  const result = await new MissionSimulationService(reads, WALLETS).simulate(missionFor(SELECTED_WALLET));
  assert.equal(result.status, "blocked");
  assert.match(result.error ?? "", /non-allowlisted program/u);
  assert.equal(simulated, false);
  assert.equal(result.broadcastAttempted, false);
});

test("approved execution signs the exact simulated transaction once and returns a confirmed receipt", async () => {
  const signer = await createKeyPairSignerFromPrivateKeyBytes(Uint8Array.from({ length: 32 }, (_, index) => index + 1));
  const mission = missionFor(signer.address);
  const transaction = unsignedTransactionFor(signer.address, "11111111111111111111111111111111");
  let submittedSignaturePresent = false;
  let submittedSignature = "";
  const reads = {
    portfolio: async () => ({ address: signer.address, slot: 1, solBalance: "1000000000", solUsdPrice: 150, totalUsd: 150, assets: [], verifiedAt: new Date().toISOString() }),
    swapQuote: async () => ({ inputMint: SOL, outputMint: USDC, inAmount: "100000000", outAmount: "15000000", router: "metis", mode: "ultra", feeBps: 2, feeMint: SOL, quoteOnly: true as const, verifiedAt: new Date().toISOString() }),
    buildUnsignedSwapOrder: async () => ({ transaction, requestId: "private-order-id", lastValidBlockHeight: "12345", outAmount: "15000000", router: "metis", mode: "ultra" }),
    simulateUnsignedTransaction: async () => ({ slot: 2, err: null, logs: [], unitsConsumed: 500, feeLamports: 5000 }),
    executeSignedSwap: async (signed: string) => {
      const decoded = getTransactionDecoder().decode(Buffer.from(signed, "base64"));
      submittedSignaturePresent = decoded.signatures[signer.address] !== null;
      submittedSignature = getSignatureFromTransaction(decoded);
      return { status: "Success" as const, signature: submittedSignature, code: 0, totalInputAmount: "100000000", totalOutputAmount: "15000000", error: null };
    },
    verifyTransactionSignature: async () => ({ state: "finalized" as const, slot: 77, error: null, verifiedAt: new Date().toISOString() }),
    transactionSettlement: async () => ({ slot: 77, feeLamports: 5000, walletPreLamports: "1000000000", walletPostLamports: "899995000" }),
  } as unknown as MainnetReadService;
  const wallets = {
    withWalletSigner: async <T>(addressValue: string, operation: (value: typeof signer) => Promise<T>) => {
      assert.equal(addressValue, signer.address);
      return operation(signer);
    },
  } as unknown as WalletOnboardingService;
  const service = new MissionSimulationService(reads, wallets);
  const simulation = await service.simulate(mission);
  assert.equal(simulation.status, "passed");
  const receipt = await service.execute(mission, simulation.id);
  assert.equal(receipt.status, "confirmed");
  assert.equal(receipt.signature, submittedSignature);
  assert.equal(receipt.chainVerification, "finalized");
  assert.equal(receipt.chainSlot, 77);
  assert.equal(receipt.actualNetworkFeeLamports, 5000);
  assert.equal(receipt.totalWalletOutflowLamports, "100005000");
  assert.equal(receipt.accountFundingLamports, "0");
  assert.equal(receipt.actualSlippageBps, 0);
  assert.equal(submittedSignaturePresent, true);
  await assert.rejects(() => service.execute(mission, simulation.id), /expired/u);
});

test("execution re-simulates immediately and blocks a stale OKX route before signing", async () => {
  const signer = await createKeyPairSignerFromPrivateKeyBytes(Uint8Array.from({ length: 32 }, (_, index) => index + 1));
  const mission = missionFor(signer.address);
  const transaction = unsignedTransactionFor(signer.address, "proVF4pMXVaYqmy4NjniPh4pqKNfMmsihgd4wdkCX3u");
  let simulations = 0;
  let signerOpened = false;
  let broadcastAttempted = false;
  const reads = {
    portfolio: async () => ({ address: signer.address, slot: 1, solBalance: "1000000000", solUsdPrice: 150, totalUsd: 150, assets: [], verifiedAt: new Date().toISOString() }),
    swapQuote: async () => ({ inputMint: SOL, outputMint: USDC, inAmount: "100000000", outAmount: "15000000", router: "okx", mode: "ultra", feeBps: 2, feeMint: SOL, quoteOnly: true as const, verifiedAt: new Date().toISOString() }),
    buildUnsignedSwapOrder: async () => ({ transaction, requestId: "private-order-id", lastValidBlockHeight: "12345", outAmount: "15000000", router: "okx", mode: "ultra" }),
    simulateUnsignedTransaction: async () => {
      simulations += 1;
      return simulations === 1
        ? { slot: 2, err: null, logs: [], unitsConsumed: 500, feeLamports: 5000 }
        : { slot: 3, err: { InstructionError: [7, { Custom: 6010 }] }, logs: ["Error Code: MinReturnNotReached"], unitsConsumed: 500, feeLamports: 5000 };
    },
    executeSignedSwap: async () => { broadcastAttempted = true; throw new Error("must not broadcast"); },
  } as unknown as MainnetReadService;
  const wallets = {
    withWalletSigner: async <T>(_address: string, operation: (value: typeof signer) => Promise<T>) => {
      signerOpened = true;
      return operation(signer);
    },
  } as unknown as WalletOnboardingService;
  const service = new MissionSimulationService(reads, wallets);
  const simulation = await service.simulate(mission);
  await assert.rejects(() => service.execute(mission, simulation.id), /minimum output/iu);
  assert.equal(simulations, 2);
  assert.equal(signerOpened, false);
  assert.equal(broadcastAttempted, false);
});

test("a successful router response remains unknown until Solana RPC confirms its signature", async () => {
  const signer = await createKeyPairSignerFromPrivateKeyBytes(Uint8Array.from({ length: 32 }, (_, index) => index + 1));
  const mission = missionFor(signer.address);
  const transaction = unsignedTransactionFor(signer.address, "11111111111111111111111111111111");
  const reads = {
    portfolio: async () => ({ address: signer.address, slot: 1, solBalance: "1000000000", solUsdPrice: 150, totalUsd: 150, assets: [], verifiedAt: new Date().toISOString() }),
    swapQuote: async () => ({ inputMint: SOL, outputMint: USDC, inAmount: "100000000", outAmount: "15000000", router: "metis", mode: "ultra", feeBps: 2, feeMint: SOL, quoteOnly: true as const, verifiedAt: new Date().toISOString() }),
    buildUnsignedSwapOrder: async () => ({ transaction, requestId: "private-order-id", lastValidBlockHeight: "12345", outAmount: "15000000", router: "metis", mode: "ultra" }),
    simulateUnsignedTransaction: async () => ({ slot: 2, err: null, logs: [], unitsConsumed: 500, feeLamports: 5000 }),
    executeSignedSwap: async (signed: string) => ({
      status: "Success" as const,
      signature: getSignatureFromTransaction(
        getTransactionDecoder().decode(Buffer.from(signed, "base64")),
      ),
      code: 0,
      totalInputAmount: "100000000",
      totalOutputAmount: "15000000",
      error: null,
    }),
    verifyTransactionSignature: async () => ({ state: "not-found" as const, slot: null, error: null, verifiedAt: new Date().toISOString() }),
  } as unknown as MainnetReadService;
  const wallets = { withWalletSigner: async <T>(_address: string, operation: (value: typeof signer) => Promise<T>) => operation(signer) } as unknown as WalletOnboardingService;
  const service = new MissionSimulationService(reads, wallets);
  const simulation = await service.simulate(mission);
  const receipt = await service.execute(mission, simulation.id);
  assert.equal(receipt.status, "unknown");
  assert.equal(receipt.chainVerification, "not-found");
  assert.match(receipt.error ?? "", /not yet|not independently/u);
});

test("a timed-out Jupiter broadcast persists the local signature and is never retried", async () => {
  const signer = await createKeyPairSignerFromPrivateKeyBytes(
    Uint8Array.from({ length: 32 }, (_, index) => index + 1),
  );
  const mission = missionFor(signer.address);
  const transaction = unsignedTransactionFor(
    signer.address,
    "11111111111111111111111111111111",
  );
  let broadcastAttempts = 0;
  let verificationChecks = 0;
  const reads = {
    portfolio: async () => ({
      address: signer.address,
      slot: 1,
      solBalance: "1000000000",
      solUsdPrice: 150,
      totalUsd: 150,
      assets: [],
      verifiedAt: new Date().toISOString(),
    }),
    swapQuote: async () => ({
      inputMint: SOL,
      outputMint: USDC,
      inAmount: "100000000",
      outAmount: "15000000",
      router: "metis",
      mode: "ultra",
      feeBps: 2,
      feeMint: SOL,
      quoteOnly: true as const,
      verifiedAt: new Date().toISOString(),
    }),
    buildUnsignedSwapOrder: async () => ({
      transaction,
      requestId: "private-order-id",
      lastValidBlockHeight: "12345",
      outAmount: "15000000",
      router: "metis",
      mode: "ultra",
    }),
    simulateUnsignedTransaction: async () => ({
      slot: 2,
      err: null,
      logs: [],
      unitsConsumed: 500,
      feeLamports: 5000,
    }),
    executeSignedSwap: async () => {
      broadcastAttempts += 1;
      throw Object.assign(new Error("Jupiter broadcast timed out"), {
        name: "TimeoutError",
      });
    },
    verifyTransactionSignature: async () => {
      verificationChecks += 1;
      return {
        state: "not-found" as const,
        slot: null,
        error: null,
        verifiedAt: new Date().toISOString(),
      };
    },
  } as unknown as MainnetReadService;
  const wallets = {
    withWalletSigner: async <T>(
      _address: string,
      operation: (value: typeof signer) => Promise<T>,
    ) => operation(signer),
  } as unknown as WalletOnboardingService;
  const service = new MissionSimulationService(reads, wallets);
  const simulation = await service.simulate(mission);
  const receipt = await service.execute(mission, simulation.id);

  assert.equal(receipt.status, "unknown");
  assert.equal(receipt.signature?.length !== 0, true);
  assert.match(receipt.error ?? "", /timed out/u);
  assert.match(receipt.chainError ?? "", /never rebroadcast/u);
  assert.equal(broadcastAttempts, 1);

  const checked = await service.verifyReceipt(receipt);
  assert.equal(checked.status, "unknown");
  assert.equal(checked.signature, receipt.signature);
  assert.equal(verificationChecks, 1);
  assert.equal(broadcastAttempts, 1);
});

test("verifyReceipt rejects a receipt without a signature", async () => {
  const service = new MissionSimulationService({} as unknown as MainnetReadService, WALLETS);
  const receipt = {
    id: "00000000-0000-4000-8000-000000000010",
    missionId: "00000000-0000-4000-8000-000000000002",
    simulationId: "00000000-0000-4000-8000-000000000003",
    status: "unknown" as const,
    signature: null,
    explorerUrl: null,
    router: "metis",
    inputAmount: "100000000",
    outputAmount: null,
    code: null,
    error: "No signature",
    transactionSigned: true as const,
    broadcastAttempted: true as const,
    executedAt: new Date().toISOString(),
  };
  await assert.rejects(() => service.verifyReceipt(receipt), /no signature to verify/u);
});

test("verifyReceipt updates an unknown receipt to confirmed when Solana RPC finalizes signature", async () => {
  let broadcastCalled = false;
  const reads = {
    executeSignedSwap: async () => { broadcastCalled = true; throw new Error("Must not rebroadcast"); },
    verifyTransactionSignature: async (sig: string) => {
      assert.equal(sig, "2".repeat(64));
      return { state: "finalized" as const, slot: 105, error: null, verifiedAt: "2026-07-24T12:00:00.000Z" };
    },
    transactionSettlement: async (sig: string, wallet: string) => {
      assert.equal(sig, "2".repeat(64));
      assert.equal(wallet, SELECTED_WALLET);
      return { slot: 105, feeLamports: 5000, walletPreLamports: "1000000000", walletPostLamports: "899995000" };
    },
  } as unknown as MainnetReadService;
  const service = new MissionSimulationService(reads, WALLETS);
  const initialReceipt = {
    id: "00000000-0000-4000-8000-000000000011",
    missionId: "00000000-0000-4000-8000-000000000002",
    simulationId: "00000000-0000-4000-8000-000000000003",
    status: "unknown" as const,
    signature: "2".repeat(64),
    explorerUrl: `https://solscan.io/tx/${"2".repeat(64)}`,
    router: "metis",
    inputAmount: "100000000",
    outputAmount: "15000000",
    walletAddress: SELECTED_WALLET,
    inputMint: SOL,
    code: null,
    error: "Not yet confirmed",
    transactionSigned: true as const,
    broadcastAttempted: true as const,
    executedAt: new Date().toISOString(),
  };
  const verified = await service.verifyReceipt(initialReceipt);
  assert.equal(verified.status, "confirmed");
  assert.equal(verified.chainVerification, "finalized");
  assert.equal(verified.chainSlot, 105);
  assert.equal(verified.error, null);
  assert.equal(verified.verifiedAt, "2026-07-24T12:00:00.000Z");
  assert.equal(broadcastCalled, false);
});

test("verifyReceipt updates receipt to failed when RPC reports a failed transaction", async () => {
  const reads = {
    verifyTransactionSignature: async () => ({
      state: "failed" as const,
      slot: 106,
      error: "InstructionError: Custom 6001",
      verifiedAt: "2026-07-24T12:05:00.000Z",
    }),
  } as unknown as MainnetReadService;
  const service = new MissionSimulationService(reads, WALLETS);
  const initialReceipt = {
    id: "00000000-0000-4000-8000-000000000012",
    missionId: "00000000-0000-4000-8000-000000000002",
    simulationId: "00000000-0000-4000-8000-000000000003",
    status: "unknown" as const,
    signature: "3".repeat(64),
    explorerUrl: null,
    router: "metis",
    inputAmount: "100000000",
    outputAmount: null,
    code: null,
    error: "Pending verification",
    transactionSigned: true as const,
    broadcastAttempted: true as const,
    executedAt: new Date().toISOString(),
  };
  const verified = await service.verifyReceipt(initialReceipt);
  assert.equal(verified.status, "failed");
  assert.equal(verified.chainVerification, "failed");
  assert.equal(verified.chainSlot, 106);
  assert.match(verified.error ?? "", /InstructionError/iu);
});

test("mission simulation forwards configured transaction priority setting to order builder", async () => {
  let passedPriority: string | undefined;
  const transaction = unsignedTransaction("11111111111111111111111111111111");
  const reads = {
    ...passingReads(transaction, { slot: 2, err: null, logs: [], unitsConsumed: 500, feeLamports: 5000 }),
    buildUnsignedSwapOrder: async (inMint: string, outMint: string, amount: string, taker: string, slippage: number, priority?: "economy" | "standard" | "fast") => {
      passedPriority = priority;
      return { transaction, requestId: "private-order-id", lastValidBlockHeight: "12345", outAmount: "15000000", router: "metis", mode: "ultra" };
    },
  } as unknown as MainnetReadService;
  const settings = { get: () => ({ maxNetworkFeeLamports: 200_000, maxFeePercent: 5, defaultSlippageBps: 50, maxSlippageBps: 300, defaultDeadlineMinutes: 30, priority: "fast" as const }) };
  const service = new MissionSimulationService(reads, WALLETS, settings);
  const result = await service.simulate(missionFor(SELECTED_WALLET));
  assert.equal(result.status, "passed");
  assert.equal(passedPriority, "fast");
});

test("mission simulation re-enforces a tighter persisted session slippage ceiling", async () => {
  const transaction = unsignedTransaction("11111111111111111111111111111111");
  const reads = passingReads(transaction, { slot: 2, err: null, logs: [], unitsConsumed: 500, feeLamports: 5000 });
  const service = new MissionSimulationService(reads, WALLETS);
  const result = await service.simulate(missionFor(SELECTED_WALLET), {
    maxNetworkFeeLamports: 200_000,
    maxFeePercent: 5,
    defaultSlippageBps: 25,
    maxSlippageBps: 25,
    defaultDeadlineMinutes: 30,
    priority: "standard",
  });
  assert.equal(result.status, "blocked");
  assert.match(result.error ?? "", /Mission policy no longer passes/i);
});

function missionFor(walletAddress: string): MissionContractPreview {
  return {
    id: "00000000-0000-4000-8000-000000000002",
    status: "ready-for-review",
    goal: "Preview selling 0.1 SOL for USDC",
    walletAddress,
    inputMint: SOL,
    outputMint: USDC,
    inputAmount: "100000000",
    maxSlippageBps: 100,
    deadlineAt: new Date(Date.now() + 60 * 60_000).toISOString(),
    stopConditions: ["Stop if any policy check fails"],
    quote: { inputMint: SOL, outputMint: USDC, inAmount: "100000000", outAmount: "15000000", router: "metis", mode: "ultra", feeBps: 2, feeMint: SOL, quoteOnly: true, verifiedAt: new Date().toISOString() },
    checks: [{ code: "balance_sufficient", status: "pass", message: "Sufficient" }],
    executionAllowed: false,
    createdAt: new Date().toISOString(),
  };
}

test("mission simulation blocks when network fee exceeds configured ceiling", async () => {
  const transaction = unsignedTransaction("11111111111111111111111111111111");
  const reads = passingReads(transaction, { slot: 1, err: null, logs: [], unitsConsumed: 400, feeLamports: 100_000_000 }); // Excessive fee 0.1 SOL
  const transactionSettings = {
    get: () => ({ maxNetworkFeeLamports: 5_000_000, maxFeePercent: 1 }),
  };
  const service = new MissionSimulationService(reads, WALLETS, transactionSettings as any);
  const result = await service.simulate(missionFor(SELECTED_WALLET));
  assert.equal(result.status, "blocked");
  assert.match(result.error ?? "", /Fee guard/i);
});

function passingReads(transaction: string, simulation: {
  slot: number;
  err: unknown;
  logs: string[];
  unitsConsumed: number;
  feeLamports: number;
  accountCreationFundingLamports?: number | null;
  estimatedWalletOutflowLamports?: string | null;
} | null, onSimulate?: () => void): MainnetReadService {
  return {
    portfolio: async () => ({ address: SELECTED_WALLET, slot: 1, solBalance: "1000000000", solUsdPrice: 150, totalUsd: 150, assets: [], verifiedAt: new Date().toISOString() }),
    swapQuote: async () => ({ inputMint: SOL, outputMint: USDC, inAmount: "100000000", outAmount: "15000000", router: "metis", mode: "ultra", feeBps: 2, feeMint: SOL, quoteOnly: true as const, verifiedAt: new Date().toISOString() }),
    buildUnsignedSwapOrder: async () => ({ transaction, requestId: "private-order-id", lastValidBlockHeight: "12345", outAmount: "15000000", router: "metis", mode: "ultra" }),
    simulateUnsignedTransaction: async () => {
      onSimulate?.();
      if (simulation === null) throw new Error("must not simulate");
      return simulation;
    },
  } as unknown as MainnetReadService;
}

function unsignedTransaction(program: string): string {
  return unsignedTransactionFor(SELECTED_WALLET, program);
}

function unsignedTransactionFor(walletValue: string, program: string): string {
  const wallet = address(walletValue);
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (value) => setTransactionMessageFeePayer(wallet, value),
    (value) => setTransactionMessageLifetimeUsingBlockhash({ blockhash: blockhash("11111111111111111111111111111111"), lastValidBlockHeight: 1n }, value),
    (value) => appendTransactionMessageInstruction({ programAddress: address(program) }, value),
  );
  return Buffer.from(getTransactionEncoder().encode(compileTransaction(message))).toString("base64");
}

test("finalized RPC evidence is authoritative and records provider contradictions", () => {
  const confirmed = resolveSwapReceiptStatus("Failed", 8010, "3".repeat(64), {
    state: "finalized",
    slot: 123,
    error: null,
    verifiedAt: "2026-07-28T00:00:00.000Z",
  });
  assert.deepEqual(confirmed, {
    status: "confirmed",
    conflictCode: "ROUTER_FAILED_RPC_CONFIRMED",
  });

  const failed = resolveSwapReceiptStatus("Success", 0, "3".repeat(64), {
    state: "failed",
    slot: 124,
    error: "Instruction failed",
    verifiedAt: "2026-07-28T00:00:01.000Z",
  });
  assert.deepEqual(failed, {
    status: "failed",
    conflictCode: "ROUTER_SUCCESS_RPC_FAILED",
  });
});
