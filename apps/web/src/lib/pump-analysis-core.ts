import "server-only";

import { createHash } from "node:crypto";

import { PumpTokenIntelligenceSchema, type PumpTokenIntelligence } from "@silfable/contracts";
import { Connection, PublicKey } from "@solana/web3.js";

import { calculatePumpReferencePath } from "@/lib/pump-analysis-utils";
import { evaluatePumpResearchEligibility } from "@/lib/pump-research-eligibility";

export const PUMP_PROGRAM_ID = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
export const PUMP_SWAP_PROGRAM_ID = "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA";
const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const ASSOCIATED_TOKEN_PROGRAM_ID = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
const TOKEN_PROGRAMS = new Set([
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
]);
const ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/u;
const PUMP_BONDING_CURVE_DISCRIMINATOR = createHash("sha256").update("account:BondingCurve").digest().subarray(0, 8);
const PUMP_GLOBAL_DISCRIMINATOR = createHash("sha256").update("account:Global").digest().subarray(0, 8);
const PUMP_SWAP_POOL_DISCRIMINATOR = Buffer.from([241, 154, 109, 4, 17, 177, 109, 188]);

export function derivePumpAddresses(mint: string): {
  bondingCurveAddress: string;
  globalAddress: string;
  poolAuthority: string;
  pumpSwapPoolAddress: string;
} {
  const mintKey = new PublicKey(mint);
  const pumpProgram = new PublicKey(PUMP_PROGRAM_ID);
  const [bondingCurve] = PublicKey.findProgramAddressSync([Buffer.from("bonding-curve"), mintKey.toBuffer()], pumpProgram);
  const [global] = PublicKey.findProgramAddressSync([Buffer.from("global")], pumpProgram);
  const [poolAuthority] = PublicKey.findProgramAddressSync([Buffer.from("pool-authority"), mintKey.toBuffer()], pumpProgram);
  const [pumpSwapPool] = PublicKey.findProgramAddressSync([
    Buffer.from("pool"),
    Buffer.from([0, 0]),
    poolAuthority.toBuffer(),
    mintKey.toBuffer(),
    new PublicKey(SOL_MINT).toBuffer(),
  ], new PublicKey(PUMP_SWAP_PROGRAM_ID));
  return {
    bondingCurveAddress: bondingCurve.toBase58(),
    globalAddress: global.toBase58(),
    poolAuthority: poolAuthority.toBase58(),
    pumpSwapPoolAddress: pumpSwapPool.toBase58(),
  };
}

export async function analyzePumpToken(
  rpcUrl: string,
  mint: string,
  referenceBuyLamports = "1000000",
): Promise<PumpTokenIntelligence> {
  if (!ADDRESS_PATTERN.test(mint)) throw new Error("Pump token mint is invalid.");
  if (!/^[1-9]\d*$/u.test(referenceBuyLamports)) throw new Error("Pump reference buy amount is invalid.");
  const referenceBuyInput = BigInt(referenceBuyLamports);
  if (referenceBuyInput < 10_000n || referenceBuyInput > 10_000_000_000n) {
    throw new Error("Pump reference buy amount must be between 0.00001 and 10 SOL.");
  }
  const connection = new Connection(rpcUrl, "finalized");
  const addresses = derivePumpAddresses(mint);
  const [curveResponse, poolResponse, mintResponse, largestResponse, globalResponse] = await Promise.all([
    connection.getAccountInfoAndContext(new PublicKey(addresses.bondingCurveAddress), "finalized"),
    connection.getAccountInfoAndContext(new PublicKey(addresses.pumpSwapPoolAddress), "finalized"),
    connection.getParsedAccountInfo(new PublicKey(mint), "finalized"),
    connection.getTokenLargestAccounts(new PublicKey(mint), "finalized"),
    connection.getAccountInfoAndContext(new PublicKey(addresses.globalAddress), "finalized"),
  ]);
  const token = parseMintEvidence(mintResponse.value);
  const global = parsePumpGlobal(globalResponse.value);
  const pool = parseCanonicalPumpSwapPool(poolResponse.value, { poolAuthority: addresses.poolAuthority, mint });
  const [bondingCurveTokenAccount] = PublicKey.findProgramAddressSync([
    new PublicKey(addresses.bondingCurveAddress).toBuffer(),
    new PublicKey(token.program).toBuffer(),
    new PublicKey(mint).toBuffer(),
  ], new PublicKey(ASSOCIATED_TOKEN_PROGRAM_ID));
  const concentration = parseLargestAccountConcentration(
    largestResponse.value,
    token.supply,
    new Set([bondingCurveTokenAccount.toBase58(), ...(pool ? [pool.baseTokenAccount] : [])]),
  );
  const liquidity = pool ? await Promise.all([
    connection.getTokenAccountBalance(new PublicKey(pool.baseTokenAccount), "finalized"),
    connection.getTokenAccountBalance(new PublicKey(pool.quoteTokenAccount), "finalized"),
  ]).then(([baseBalance, quoteBalance]) => {
    const baseAmount = parseTokenBalanceAmount(baseBalance.value);
    const quoteAmount = parseTokenBalanceAmount(quoteBalance.value);
    const effectiveQuoteAmount = BigInt(quoteAmount) + pool.virtualQuoteReserves;
    if (effectiveQuoteAmount < 0n) throw new Error("PumpSwap effective quote reserves are invalid.");
    return {
      baseAmount,
      quoteAmount,
      effectiveQuoteAmount: String(effectiveQuoteAmount),
      slot: Math.max(baseBalance.context.slot, quoteBalance.context.slot),
    };
  }) : null;
  const poolVerified = pool !== null;
  const slot = Math.max(curveResponse.context.slot, poolResponse.context.slot, mintResponse.context.slot, largestResponse.context.slot, globalResponse.context.slot, liquidity?.slot ?? 0);
  const base = {
    mint,
    programId: PUMP_PROGRAM_ID,
    pumpSwapProgramId: PUMP_SWAP_PROGRAM_ID,
    bondingCurveAddress: addresses.bondingCurveAddress,
    pumpSwapPoolAddress: addresses.pumpSwapPoolAddress,
    pumpSwapPoolVerified: poolVerified,
    tokenProgram: token.program,
    decimals: token.decimals,
    mintSupply: token.supply,
    mintAuthority: token.mintAuthority,
    freezeAuthority: token.freezeAuthority,
    top10ConcentrationPercent: concentration,
    poolBaseTokenAccount: pool?.baseTokenAccount ?? null,
    poolQuoteTokenAccount: pool?.quoteTokenAccount ?? null,
    poolBaseReserves: liquidity?.baseAmount ?? null,
    poolQuoteReserves: liquidity?.quoteAmount ?? null,
    pumpSwapVirtualQuoteReserves: pool ? String(pool.virtualQuoteReserves) : null,
    pumpSwapEffectiveQuoteReserves: liquidity?.effectiveQuoteAmount ?? null,
    slot,
    verifiedAt: new Date().toISOString(),
  } as const;
  const authorityWarnings = tokenRiskWarnings(token, concentration);
  if (curveResponse.value === null) {
    return withResearchEligibility({
      ...base,
      venue: poolVerified ? "pumpswap-migrated" : "unknown",
      bondingCurveExists: false,
      accountVerified: false,
      complete: null,
      virtualTokenReserves: null,
      virtualQuoteReserves: null,
      realTokenReserves: null,
      realQuoteReserves: null,
      tokenTotalSupply: null,
      metrics: pumpMetrics({ token, global, curve: null, pool: liquidity, referenceBuyInput }),
      warnings: [
        ...authorityWarnings,
        poolVerified
          ? "A canonical PumpSwap pool was independently verified, but pool identity alone does not prove liquidity, sellability, or token safety."
          : "No Pump bonding-curve account or canonical PumpSwap pool was found. This mint is not verified as a Pump trading venue.",
        "No Pump.fun buy or sell transaction is authorized by this read-only analysis.",
      ],
    });
  }
  if (!curveResponse.value.owner.equals(new PublicKey(PUMP_PROGRAM_ID))) {
    throw new Error("Canonical Pump bonding-curve PDA is not owned by the official Pump program.");
  }
  const bytes = curveResponse.value.data;
  if (bytes.length < 49 || !bytes.subarray(0, 8).equals(PUMP_BONDING_CURVE_DISCRIMINATOR)) {
    throw new Error("Pump bonding-curve discriminator is invalid.");
  }
  const complete = bytes[48] === 1;
  const curve = {
    virtualTokenReserves: bytes.readBigUInt64LE(8),
    virtualQuoteReserves: bytes.readBigUInt64LE(16),
    realTokenReserves: bytes.readBigUInt64LE(24),
    realQuoteReserves: bytes.readBigUInt64LE(32),
    tokenTotalSupply: bytes.readBigUInt64LE(40),
    quoteMint: pumpCurveQuoteMint(bytes),
    complete,
  };
  return withResearchEligibility({
    ...base,
    venue: poolVerified ? "pumpswap-migrated" : complete ? "bonding-curve-complete" : "bonding-curve-active",
    bondingCurveExists: true,
    accountVerified: true,
    complete,
    virtualTokenReserves: String(curve.virtualTokenReserves),
    virtualQuoteReserves: String(curve.virtualQuoteReserves),
    realTokenReserves: String(curve.realTokenReserves),
    realQuoteReserves: String(curve.realQuoteReserves),
    tokenTotalSupply: String(curve.tokenTotalSupply),
    metrics: pumpMetrics({ token, global, curve, pool: liquidity, referenceBuyInput }),
    warnings: [
      ...authorityWarnings,
      "Canonical program ownership and curve state do not prove token quality, liquidity, sellability, or creator intent.",
      poolVerified
        ? "The canonical PumpSwap pool is verified; reserve liquidity and a fresh sell-path quote are still required before any proposal."
        : complete
          ? "The curve reports complete, but no canonical PumpSwap pool was verified; trading must remain blocked."
          : "The bonding curve is active, but this analysis grants no execution authority.",
      "Pump.fun-origin tokens are highly speculative. This evidence never authorizes a transaction.",
    ],
  });
}

function parseMintEvidence(value: Awaited<ReturnType<Connection["getParsedAccountInfo"]>>["value"]): {
  program: string;
  decimals: number;
  supply: string;
  mintAuthority: string | null;
  freezeAuthority: string | null;
} {
  if (!value || Buffer.isBuffer(value.data) || typeof value.data !== "object" || !("parsed" in value.data)) {
    throw new Error("Pump token mint account was not found or is not parsed.");
  }
  const program = value.owner.toBase58();
  const parsed = value.data.parsed as { type?: unknown; info?: unknown };
  if (!TOKEN_PROGRAMS.has(program) || parsed.type !== "mint" || typeof parsed.info !== "object" || parsed.info === null) {
    throw new Error("Pump token mint is invalid or uses an unsupported token program.");
  }
  const info = parsed.info as { decimals?: unknown; supply?: unknown; mintAuthority?: unknown; freezeAuthority?: unknown };
  if (typeof info.decimals !== "number" || !Number.isInteger(info.decimals) || info.decimals < 0 || info.decimals > 18
    || typeof info.supply !== "string" || !/^\d+$/u.test(info.supply)) {
    throw new Error("Pump token mint data is invalid.");
  }
  return {
    program,
    decimals: info.decimals,
    supply: info.supply,
    mintAuthority: publicKeyOrNull(info.mintAuthority),
    freezeAuthority: publicKeyOrNull(info.freezeAuthority),
  };
}

function publicKeyOrNull(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !ADDRESS_PATTERN.test(value)) return null;
  return new PublicKey(value).toBase58();
}

function parseLargestAccountConcentration(
  value: Awaited<ReturnType<Connection["getTokenLargestAccounts"]>>["value"],
  supply: string,
  excludedAccounts: ReadonlySet<string>,
): number | null {
  if (supply === "0") return null;
  let total = 0n;
  let included = 0;
  for (const entry of value) {
    const address = entry.address.toBase58();
    if (excludedAccounts.has(address)) continue;
    if (!/^\d+$/u.test(entry.amount)) return null;
    total += BigInt(entry.amount);
    included += 1;
    if (included === 10) break;
  }
  const basisPoints = (total * 10_000n) / BigInt(supply);
  return Number(basisPoints > 1_000_000n ? 1_000_000n : basisPoints) / 100;
}

type PumpGlobalEvidence = { initialRealTokenReserves: bigint; baseProtocolFeeBps: number; baseCreatorFeeBps: number };

function parsePumpGlobal(value: Awaited<ReturnType<Connection["getAccountInfoAndContext"]>>["value"]): PumpGlobalEvidence | null {
  if (!value) return null;
  if (!value.owner.equals(new PublicKey(PUMP_PROGRAM_ID))) throw new Error("Pump global account is not owned by the official Pump program.");
  const bytes = value.data;
  if (bytes.length < 162 || !bytes.subarray(0, 8).equals(PUMP_GLOBAL_DISCRIMINATOR)) {
    throw new Error("Pump global account discriminator or layout is invalid.");
  }
  const baseProtocolFeeBps = Number(bytes.readBigUInt64LE(105));
  const baseCreatorFeeBps = Number(bytes.readBigUInt64LE(154));
  if (!Number.isSafeInteger(baseProtocolFeeBps) || baseProtocolFeeBps > 10_000
    || !Number.isSafeInteger(baseCreatorFeeBps) || baseCreatorFeeBps > 10_000) {
    throw new Error("Pump global fee configuration is outside the supported range.");
  }
  return { initialRealTokenReserves: bytes.readBigUInt64LE(89), baseProtocolFeeBps, baseCreatorFeeBps };
}

function parseCanonicalPumpSwapPool(
  value: Awaited<ReturnType<Connection["getAccountInfoAndContext"]>>["value"],
  expected: { poolAuthority: string; mint: string },
): { baseTokenAccount: string; quoteTokenAccount: string; virtualQuoteReserves: bigint } | null {
  if (!value) return null;
  if (!value.owner.equals(new PublicKey(PUMP_SWAP_PROGRAM_ID))) throw new Error("Canonical PumpSwap pool is not owned by the official PumpSwap program.");
  const bytes = value.data;
  if (bytes.length < 203 || !bytes.subarray(0, 8).equals(PUMP_SWAP_POOL_DISCRIMINATOR)) throw new Error("PumpSwap pool discriminator is invalid.");
  const index = bytes.readUInt16LE(9);
  const creator = new PublicKey(bytes.subarray(11, 43)).toBase58();
  const baseMint = new PublicKey(bytes.subarray(43, 75)).toBase58();
  const quoteMint = new PublicKey(bytes.subarray(75, 107)).toBase58();
  const baseTokenAccount = new PublicKey(bytes.subarray(139, 171)).toBase58();
  const quoteTokenAccount = new PublicKey(bytes.subarray(171, 203)).toBase58();
  if (index !== 0 || creator !== expected.poolAuthority || baseMint !== expected.mint || quoteMint !== SOL_MINT) {
    throw new Error("Canonical PumpSwap pool bindings do not match the requested mint.");
  }
  return { baseTokenAccount, quoteTokenAccount, virtualQuoteReserves: bytes.length >= 261 ? readI128LE(bytes, 245) : 0n };
}

function parseTokenBalanceAmount(value: { amount: string }): string {
  if (!/^\d+$/u.test(value.amount)) throw new Error("PumpSwap vault balance is invalid.");
  return value.amount;
}

function pumpCurveQuoteMint(bytes: Buffer): string {
  if (bytes.length < 115 || bytes.subarray(83, 115).every((value) => value === 0)) return SOL_MINT;
  return new PublicKey(bytes.subarray(83, 115)).toBase58();
}

function tokenRiskWarnings(token: ReturnType<typeof parseMintEvidence>, concentration: number | null): string[] {
  const warnings: string[] = [];
  if (token.mintAuthority !== null) warnings.push("Mint authority remains active and could change the token supply.");
  if (token.freezeAuthority !== null) warnings.push("Freeze authority remains active and could freeze token accounts.");
  if (concentration === null) warnings.push("Top-ten holder concentration could not be established from finalized RPC evidence.");
  else if (concentration > 80) warnings.push(`Top-ten non-venue holder concentration is high at ${concentration.toFixed(2)}%.`);
  return warnings;
}

function pumpMetrics(input: {
  token: ReturnType<typeof parseMintEvidence>;
  global: PumpGlobalEvidence | null;
  curve: { virtualTokenReserves: bigint; virtualQuoteReserves: bigint; realTokenReserves: bigint; realQuoteReserves: bigint; tokenTotalSupply: bigint; quoteMint: string; complete: boolean } | null;
  pool: { baseAmount: string; quoteAmount: string; effectiveQuoteAmount: string; slot: number } | null;
  referenceBuyInput: bigint;
}): PumpTokenIntelligence["metrics"] {
  const quoteMint = input.pool ? SOL_MINT : input.curve?.quoteMint ?? null;
  const quoteSymbol = quoteMint === SOL_MINT ? "SOL" : quoteMint === USDC_MINT ? "USDC" : "unknown";
  const quoteDecimals = quoteSymbol === "SOL" ? 9 : quoteSymbol === "USDC" ? 6 : null;
  const tokenScale = 10 ** input.token.decimals;
  const quoteScale = quoteDecimals === null ? null : 10 ** quoteDecimals;
  const baseRaw = input.pool ? BigInt(input.pool.baseAmount) : input.curve?.virtualTokenReserves ?? null;
  const quoteRaw = input.pool ? BigInt(input.pool.effectiveQuoteAmount) : input.curve?.virtualQuoteReserves ?? null;
  const baseUi = baseRaw === null ? null : Number(baseRaw) / tokenScale;
  const quoteUi = quoteRaw === null || quoteScale === null ? null : Number(quoteRaw) / quoteScale;
  const spotPriceQuotePerToken = baseUi !== null && baseUi > 0 && quoteUi !== null ? quoteUi / baseUi : null;
  const supplyUi = Number(BigInt(input.token.supply)) / tokenScale;
  const estimatedMarketCapQuote = spotPriceQuotePerToken === null ? null : spotPriceQuotePerToken * supplyUi;
  const curveProgressPercent = input.pool || input.curve?.complete === true
    ? 100
    : input.curve && input.global && input.global.initialRealTokenReserves > 0n
      ? Number((input.global.initialRealTokenReserves > input.curve.realTokenReserves
        ? input.global.initialRealTokenReserves - input.curve.realTokenReserves
        : 0n) * 1_000_000n / input.global.initialRealTokenReserves) / 10_000
      : null;
  const displayedQuoteRaw = input.pool ? BigInt(input.pool.quoteAmount) : input.curve?.realQuoteReserves ?? null;
  const quoteReservesUi = displayedQuoteRaw === null || quoteScale === null ? null : Number(displayedQuoteRaw) / quoteScale;
  const referencePath = calculatePumpReferencePath({
    quoteSymbol,
    inputAmount: input.referenceBuyInput,
    baseReserves: baseRaw,
    quoteReserves: quoteRaw,
    availableBaseReserves: input.pool ? BigInt(input.pool.baseAmount) : input.curve?.realTokenReserves ?? null,
    venue: input.pool ? "pumpswap" : input.curve && !input.curve.complete ? "bonding-curve" : "unavailable",
  });
  return {
    quoteMint,
    quoteSymbol,
    spotPriceQuotePerToken: finiteMetric(spotPriceQuotePerToken),
    estimatedMarketCapQuote: finiteMetric(estimatedMarketCapQuote),
    curveProgressPercent: finiteMetric(curveProgressPercent === null ? null : Math.min(100, Math.max(0, curveProgressPercent))),
    quoteReservesUi: finiteMetric(quoteReservesUi),
    referenceBuyInputLamports: String(input.referenceBuyInput),
    referenceBuyPriceImpactBps: referencePath.buyPriceImpactBps,
    referencePath,
    priceImpactNote: referencePath.buyPriceImpactBps === null
      ? "A deterministic size-specific reserve path is unavailable for this venue or quote mint."
      : "Size-specific buy and sell-back reserve estimates; effective fees, slippage tolerance, account creation, and transaction simulation are excluded.",
    baseProtocolFeeBps: input.global?.baseProtocolFeeBps ?? null,
    baseCreatorFeeBps: input.global?.baseCreatorFeeBps ?? null,
    feeNote: input.global
      ? "On-chain Pump global base fee configuration only; effective fees, network fee, and rent require a fresh quote and simulation."
      : "Base Pump fee configuration is unavailable; no transaction fee estimate is claimed.",
  };
}

function withResearchEligibility(value: unknown): PumpTokenIntelligence {
  const intelligence = PumpTokenIntelligenceSchema.parse(value);
  return PumpTokenIntelligenceSchema.parse({ ...intelligence, researchEligibility: evaluatePumpResearchEligibility(intelligence) });
}

function finiteMetric(value: number | null): number | null {
  return value !== null && Number.isFinite(value) && value >= 0 ? value : null;
}

function readI128LE(bytes: Buffer, offset: number): bigint {
  let value = 0n;
  for (let index = 15; index >= 0; index -= 1) value = (value << 8n) | BigInt(bytes[offset + index] ?? 0);
  return (value & (1n << 127n)) === 0n ? value : value - (1n << 128n);
}
