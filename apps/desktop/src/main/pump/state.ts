import {
  address,
  getAddressDecoder,
  getAddressEncoder,
  getProgramDerivedAddress,
} from "@solana/kit";

import {
  PUMP_FEE_PROGRAM_ID,
  PUMP_PROGRAM_ID,
} from "./inspector.js";

const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const DEFAULT_ADDRESS = "11111111111111111111111111111111";
const GLOBAL_DISCRIMINATOR = [167, 232, 232, 177, 200, 108, 114, 127];
const CURVE_DISCRIMINATOR = [23, 183, 248, 55, 96, 216, 172, 96];
const FEE_CONFIG_DISCRIMINATOR = [143, 52, 146, 187, 219, 123, 76, 155];
const ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/u;
const FINALIZED = "finalized" as const;
const textEncoder = new TextEncoder();
const addressEncoder = getAddressEncoder();
const addressDecoder = getAddressDecoder();

export type PumpFinalizedAccount = {
  data: Uint8Array;
  owner: string;
};

export type PumpFinalizedAccountReader = {
  getMultipleAccountsInfoAndContext(
    addresses: string[],
    config: { commitment: "finalized" },
  ): Promise<{
    context: { slot: number };
    value: Array<PumpFinalizedAccount | null | undefined>;
  }>;
};

export type PumpV2FinalizedBuildEvidence = {
  mint: string;
  tokenProgram: string;
  creator: string;
  mintSecurity: {
    initialized: true;
    mintAuthority: null;
    freezeAuthority: null;
  };
  feeRecipients: string[];
  buybackFeeRecipients: string[];
  curve: {
    virtualTokenReserves: string;
    virtualQuoteReserves: string;
    realTokenReserves: string;
    tokenTotalSupply: string;
    mayhemMode: boolean;
  };
  feeSchedule: {
    source: "fee-config" | "global-fallback";
    protocolFeeBps: string;
    creatorFeeBps: string;
    buybackAllocationBps: string;
    tiers: Array<{
      marketCapQuoteThreshold: string;
      protocolFeeBps: string;
      creatorFeeBps: string;
    }>;
  };
  slot: number;
  commitment: "finalized";
  verifiedAt: string;
};

export type PumpGlobalLaunchReadiness = {
  initialized: boolean;
  createV2Enabled: boolean;
  mayhemModeEnabled: boolean;
  isCashbackEnabled: boolean;
};

export function decodePumpGlobalLaunchReadiness(data: Uint8Array): PumpGlobalLaunchReadiness {
  const global = decodeGlobal(data);
  return {
    initialized: global.initialized,
    createV2Enabled: global.createV2Enabled,
    mayhemModeEnabled: global.mayhemModeEnabled,
    isCashbackEnabled: global.isCashbackEnabled,
  };
}

export async function resolvePumpV2FinalizedBuildEvidence(
  reader: PumpFinalizedAccountReader,
  mintAddress: string,
  now = new Date(),
): Promise<PumpV2FinalizedBuildEvidence> {
  if (!ADDRESS_PATTERN.test(mintAddress)) throw new Error("Pump token mint is invalid");
  address(mintAddress);
  const stateAddresses = await deriveStateAddresses(mintAddress);
  const response = await reader.getMultipleAccountsInfoAndContext(
    [stateAddresses.global, stateAddresses.curve, mintAddress, stateAddresses.feeConfig],
    { commitment: FINALIZED },
  );
  if (!Number.isSafeInteger(response.context.slot) || response.context.slot < 1) {
    throw new Error("Pump finalized evidence slot is invalid");
  }
  const [globalAccount, curveAccount, mintAccount, feeConfigAccount] = response.value;
  assertOwnedAccount(globalAccount, "Global", PUMP_PROGRAM_ID);
  assertOwnedAccount(curveAccount, "bonding curve", PUMP_PROGRAM_ID);
  if (mintAccount === null || mintAccount === undefined) {
    throw new Error("Pump token mint account was not found");
  }
  if (mintAccount.owner !== TOKEN_PROGRAM_ID && mintAccount.owner !== TOKEN_2022_PROGRAM_ID) {
    throw new Error("Pump token mint is not owned by an allowlisted token program");
  }
  const mintSecurity = decodeMintSecurity(mintAccount.data);
  if (!mintSecurity.initialized) throw new Error("Pump token mint is not initialized");
  if (mintSecurity.mintAuthority !== null) throw new Error("Pump token mint authority has not been revoked");
  if (mintSecurity.freezeAuthority !== null) throw new Error("Pump token freeze authority has not been revoked");

  const global = decodeGlobal(globalAccount.data);
  const curve = decodeCurve(curveAccount.data);
  const feeConfig = feeConfigAccount === null || feeConfigAccount === undefined
    ? null
    : decodeFeeConfigAccount(feeConfigAccount);
  if (!global.initialized) throw new Error("Pump Global state is not initialized");
  if (curve.complete) throw new Error("Pump bonding curve is complete; use the independently verified PumpSwap path");
  if (curve.creator === DEFAULT_ADDRESS) throw new Error("Pump bonding curve creator is unavailable");
  const feeRecipients = uniqueAddresses([global.feeRecipient, ...global.feeRecipients]);
  const buybackFeeRecipients = uniqueAddresses(global.buybackFeeRecipients);
  if (feeRecipients.length === 0) throw new Error("Pump finalized Global state contains no fee recipient");
  if (buybackFeeRecipients.length === 0) throw new Error("Pump finalized Global state contains no buyback fee recipient");

  return {
    mint: mintAddress,
    tokenProgram: mintAccount.owner,
    creator: curve.creator,
    mintSecurity: {
      initialized: true,
      mintAuthority: null,
      freezeAuthority: null,
    },
    feeRecipients,
    buybackFeeRecipients,
    curve: {
      virtualTokenReserves: curve.virtualTokenReserves.toString(),
      virtualQuoteReserves: curve.virtualQuoteReserves.toString(),
      realTokenReserves: curve.realTokenReserves.toString(),
      tokenTotalSupply: curve.tokenTotalSupply.toString(),
      mayhemMode: curve.mayhemMode,
    },
    feeSchedule: feeConfig === null ? {
      source: "global-fallback",
      protocolFeeBps: global.feeBasisPoints.toString(),
      creatorFeeBps: global.creatorFeeBasisPoints.toString(),
      buybackAllocationBps: global.buybackBasisPoints.toString(),
      tiers: [],
    } : {
      source: "fee-config",
      protocolFeeBps: feeConfig.flatFees.protocolFeeBps.toString(),
      creatorFeeBps: feeConfig.flatFees.creatorFeeBps.toString(),
      buybackAllocationBps: global.buybackBasisPoints.toString(),
      tiers: feeConfig.feeTiers.map((tier) => ({
        marketCapQuoteThreshold: tier.marketCapQuoteThreshold.toString(),
        protocolFeeBps: tier.protocolFeeBps.toString(),
        creatorFeeBps: tier.creatorFeeBps.toString(),
      })),
    },
    slot: response.context.slot,
    commitment: FINALIZED,
    verifiedAt: now.toISOString(),
  };
}

async function deriveStateAddresses(mintAddress: string): Promise<{
  global: string;
  curve: string;
  feeConfig: string;
}> {
  const [global] = await getProgramDerivedAddress({
    programAddress: address(PUMP_PROGRAM_ID),
    seeds: [textEncoder.encode("global")],
  });
  const [curve] = await getProgramDerivedAddress({
    programAddress: address(PUMP_PROGRAM_ID),
    seeds: [textEncoder.encode("bonding-curve"), addressEncoder.encode(address(mintAddress))],
  });
  const [feeConfig] = await getProgramDerivedAddress({
    programAddress: address(PUMP_FEE_PROGRAM_ID),
    seeds: [textEncoder.encode("fee_config"), addressEncoder.encode(address(PUMP_PROGRAM_ID))],
  });
  return { global, curve, feeConfig };
}

function decodeGlobal(data: Uint8Array) {
  const cursor = new BorshCursor(data, GLOBAL_DISCRIMINATOR, "Global");
  const initialized = cursor.bool();
  cursor.pubkey();
  const feeRecipient = cursor.pubkey();
  cursor.u64();
  cursor.u64();
  cursor.u64();
  cursor.u64();
  const feeBasisPoints = cursor.u64();
  cursor.pubkey();
  cursor.bool();
  cursor.u64();
  const creatorFeeBasisPoints = cursor.u64();
  const feeRecipients = cursor.pubkeys(7);
  cursor.pubkey();
  cursor.pubkey();
  const createV2Enabled = cursor.bool();
  cursor.pubkey();
  cursor.pubkey();
  const mayhemModeEnabled = cursor.bool();
  cursor.pubkeys(7);
  const isCashbackEnabled = cursor.bool();
  const buybackFeeRecipients = cursor.pubkeys(8);
  const buybackBasisPoints = cursor.u64();
  cursor.u64();
  cursor.pubkeys(1);
  cursor.assertConsumed();
  return {
    initialized,
    feeRecipient,
    feeBasisPoints,
    creatorFeeBasisPoints,
    feeRecipients,
    buybackFeeRecipients,
    buybackBasisPoints,
    createV2Enabled,
    mayhemModeEnabled,
    isCashbackEnabled,
  };
}

function decodeCurve(data: Uint8Array) {
  const cursor = new BorshCursor(data, CURVE_DISCRIMINATOR, "bonding curve");
  const virtualTokenReserves = cursor.u64();
  const virtualQuoteReserves = cursor.u64();
  const realTokenReserves = cursor.u64();
  cursor.u64();
  const tokenTotalSupply = cursor.u64();
  const complete = cursor.bool();
  const creator = cursor.pubkey();
  const mayhemMode = cursor.bool();
  cursor.bool();
  cursor.pubkey();
  cursor.assertTrailingZeroes();
  return { virtualTokenReserves, virtualQuoteReserves, realTokenReserves, tokenTotalSupply, complete, creator, mayhemMode };
}

function decodeFeeConfigAccount(account: PumpFinalizedAccount) {
  assertOwnedAccount(account, "fee config", PUMP_FEE_PROGRAM_ID);
  const cursor = new BorshCursor(account.data, FEE_CONFIG_DISCRIMINATOR, "fee config");
  cursor.u8();
  cursor.pubkey();
  const flatFees = cursor.fees();
  const feeTiers = cursor.feeTiers();
  cursor.feeTiers();
  cursor.assertTrailingZeroes();
  return { flatFees, feeTiers };
}

function decodeMintSecurity(data: Uint8Array): {
  initialized: boolean;
  mintAuthority: string | null;
  freezeAuthority: string | null;
} {
  if (data.length < 82) throw new Error("Pump token mint account data is truncated");
  const mintAuthority = decodeCOptionAddress(data, 0, "mint authority");
  const initialized = data[45] === 1;
  if (data[45] !== 0 && data[45] !== 1) throw new Error("Pump token mint initialized flag is invalid");
  const freezeAuthority = decodeCOptionAddress(data, 46, "freeze authority");
  return { initialized, mintAuthority, freezeAuthority };
}

function decodeCOptionAddress(data: Uint8Array, offset: number, label: string): string | null {
  const option = new DataView(data.buffer, data.byteOffset + offset, 4).getUint32(0, true);
  if (option === 0) return null;
  if (option !== 1) throw new Error(`Pump token ${label} option is invalid`);
  return addressDecoder.decode(data.subarray(offset + 4, offset + 36));
}

function assertOwnedAccount(
  account: PumpFinalizedAccount | null | undefined,
  label: string,
  expectedOwner: string,
): asserts account is PumpFinalizedAccount {
  if (account === null || account === undefined) throw new Error(`Pump ${label} account was not found`);
  if (account.owner !== expectedOwner) throw new Error(`Pump ${label} account is not owned by the pinned ${label === "fee config" ? "Pump fee" : "Pump"} program`);
  if (!(account.data instanceof Uint8Array)) throw new Error(`Pump ${label} account data is invalid`);
}

function uniqueAddresses(values: string[]): string[] {
  return [...new Set(values.filter((value) => value !== DEFAULT_ADDRESS))]
    .sort((left, right) => left.localeCompare(right));
}

class BorshCursor {
  readonly #data: Uint8Array;
  readonly #label: string;
  #offset = 8;

  constructor(data: Uint8Array, discriminator: number[], label: string) {
    this.#data = data;
    this.#label = label;
    if (data.length < discriminator.length || !discriminator.every((value, index) => data[index] === value)) {
      throw new Error(`Pump ${label} discriminator is invalid`);
    }
  }

  u8(): number {
    this.#require(1);
    return this.#data[this.#offset++]!;
  }

  bool(): boolean {
    const value = this.u8();
    if (value !== 0 && value !== 1) throw new Error(`Pump ${this.#label} boolean field is invalid`);
    return value === 1;
  }

  u64(): bigint {
    this.#require(8);
    const value = new DataView(this.#data.buffer, this.#data.byteOffset + this.#offset, 8).getBigUint64(0, true);
    this.#offset += 8;
    return value;
  }

  u128(): bigint {
    const low = this.u64();
    const high = this.u64();
    return low + (high << 64n);
  }

  pubkey(): string {
    this.#require(32);
    const value = addressDecoder.decode(this.#data.subarray(this.#offset, this.#offset + 32));
    this.#offset += 32;
    return value;
  }

  pubkeys(count: number): string[] {
    return Array.from({ length: count }, () => this.pubkey());
  }

  fees(): { protocolFeeBps: bigint; creatorFeeBps: bigint } {
    this.u64();
    return { protocolFeeBps: this.u64(), creatorFeeBps: this.u64() };
  }

  feeTiers(): Array<{ marketCapQuoteThreshold: bigint; protocolFeeBps: bigint; creatorFeeBps: bigint }> {
    this.#require(4);
    const count = new DataView(this.#data.buffer, this.#data.byteOffset + this.#offset, 4).getUint32(0, true);
    this.#offset += 4;
    if (count > 64) throw new Error(`Pump ${this.#label} fee tier count is invalid`);
    return Array.from({ length: count }, () => ({
      marketCapQuoteThreshold: this.u128(),
      ...this.fees(),
    }));
  }

  assertConsumed(): void {
    if (this.#offset !== this.#data.length) throw new Error(`Pump ${this.#label} account size is invalid`);
  }

  assertTrailingZeroes(): void {
    if (this.#data.subarray(this.#offset).some((value) => value !== 0)) {
      throw new Error(`Pump ${this.#label} trailing account data is invalid`);
    }
  }

  #require(size: number): void {
    if (this.#offset + size > this.#data.length) throw new Error(`Pump ${this.#label} account data is truncated`);
  }
}
