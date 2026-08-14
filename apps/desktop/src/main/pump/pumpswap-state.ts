import {
  address,
  getAddressDecoder,
  getAddressEncoder,
  getProgramDerivedAddress,
} from "@solana/kit";

import {
  PUMP_FEE_PROGRAM_ID,
  PUMP_SWAP_PROGRAM_ID,
} from "./inspector.js";

const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/u;
const FINALIZED = "finalized" as const;
const textEncoder = new TextEncoder();
const addressEncoder = getAddressEncoder();
const addressDecoder = getAddressDecoder();

export type PumpSwapFinalizedAccount = {
  data: Uint8Array;
  owner: string;
};

export type PumpSwapFinalizedAccountReader = {
  getMultipleAccountsInfoAndContext(
    addresses: string[],
    config: { commitment: "finalized" },
  ): Promise<{
    context: { slot: number };
    value: Array<PumpSwapFinalizedAccount | null | undefined>;
  }>;
};

export type PumpSwapFinalizedBuildEvidence = {
  mint: string;
  tokenProgram: string;
  pool: string;
  baseVault: string;
  quoteVault: string;
  baseReserves: string;
  quoteReserves: string;
  coinCreatorVaultAta: string;
  coinCreatorVaultAuthority: string;
  protocolFeeRecipient: string;
  protocolFeeRecipientTokenAccount: string;
  mintSecurity: {
    initialized: true;
    mintAuthority: null;
    freezeAuthority: null;
  };
  feeSchedule: {
    protocolFeeBps: string;
    creatorFeeBps: string;
    buybackAllocationBps: string;
  };
  slot: number;
  commitment: "finalized";
  verifiedAt: string;
};

export async function resolvePumpSwapFinalizedBuildEvidence(
  reader: PumpSwapFinalizedAccountReader,
  mintAddress: string,
  now = new Date(),
): Promise<PumpSwapFinalizedBuildEvidence> {
  if (!ADDRESS_PATTERN.test(mintAddress)) throw new Error("PumpSwap token mint is invalid");
  address(mintAddress);

  const derived = await derivePumpSwapStateAddresses(mintAddress);

  const response = await reader.getMultipleAccountsInfoAndContext(
    [derived.pool, mintAddress, derived.baseVault, derived.quoteVault],
    { commitment: FINALIZED },
  );

  if (!Number.isSafeInteger(response.context.slot) || response.context.slot < 1) {
    throw new Error("PumpSwap finalized evidence slot is invalid");
  }

  const [poolAccount, mintAccount, baseVaultAccount, quoteVaultAccount] = response.value;

  if (poolAccount === null || poolAccount === undefined) {
    throw new Error("PumpSwap pool account was not found");
  }
  assertOwnedAccount(poolAccount, "PumpSwap Pool", PUMP_SWAP_PROGRAM_ID);

  if (mintAccount === null || mintAccount === undefined) {
    throw new Error("PumpSwap token mint account was not found");
  }
  if (mintAccount.owner !== TOKEN_PROGRAM_ID && mintAccount.owner !== TOKEN_2022_PROGRAM_ID) {
    throw new Error("PumpSwap token mint is not owned by an allowlisted token program");
  }

  const mintSecurity = decodeMintSecurity(mintAccount.data);
  if (!mintSecurity.initialized) throw new Error("PumpSwap token mint is not initialized");
  if (mintSecurity.mintAuthority !== null) throw new Error("PumpSwap token mint authority has not been revoked");
  if (mintSecurity.freezeAuthority !== null) throw new Error("PumpSwap token freeze authority has not been revoked");

  const pool = decodePumpSwapPool(poolAccount.data);

  const baseReserves = baseVaultAccount ? decodeTokenAccountAmount(baseVaultAccount.data) : 0n;
  const quoteReserves = quoteVaultAccount ? decodeTokenAccountAmount(quoteVaultAccount.data) : 0n;

  return {
    mint: mintAddress,
    tokenProgram: mintAccount.owner,
    pool: derived.pool,
    baseVault: derived.baseVault,
    quoteVault: derived.quoteVault,
    baseReserves: baseReserves.toString(),
    quoteReserves: quoteReserves.toString(),
    coinCreatorVaultAta: pool.coinCreatorVaultAta,
    coinCreatorVaultAuthority: pool.coinCreatorVaultAuthority,
    protocolFeeRecipient: pool.protocolFeeRecipient,
    protocolFeeRecipientTokenAccount: pool.protocolFeeRecipientTokenAccount,
    mintSecurity: {
      initialized: true,
      mintAuthority: null,
      freezeAuthority: null,
    },
    feeSchedule: {
      protocolFeeBps: pool.protocolFeeBps.toString(),
      creatorFeeBps: pool.creatorFeeBps.toString(),
      buybackAllocationBps: "0",
    },
    slot: response.context.slot,
    commitment: FINALIZED,
    verifiedAt: now.toISOString(),
  };
}

export async function derivePumpSwapStateAddresses(mintAddress: string) {
  const [pool] = await getProgramDerivedAddress({
    programAddress: address(PUMP_SWAP_PROGRAM_ID),
    seeds: [textEncoder.encode("pool"), addressEncoder.encode(address(mintAddress))],
  });
  const [baseVault] = await getProgramDerivedAddress({
    programAddress: address(PUMP_SWAP_PROGRAM_ID),
    seeds: [textEncoder.encode("pool_base_vault"), addressEncoder.encode(address(pool))],
  });
  const [quoteVault] = await getProgramDerivedAddress({
    programAddress: address(PUMP_SWAP_PROGRAM_ID),
    seeds: [textEncoder.encode("pool_quote_vault"), addressEncoder.encode(address(pool))],
  });

  return { pool, baseVault, quoteVault };
}

function assertOwnedAccount(
  account: PumpSwapFinalizedAccount | null | undefined,
  label: string,
  expectedOwner: string,
): void {
  if (account === null || account === undefined) {
    throw new Error(`PumpSwap ${label} account was not found`);
  }
  if (account.owner !== expectedOwner) {
    throw new Error(`PumpSwap ${label} account is not owned by ${expectedOwner}`);
  }
}

function decodeMintSecurity(data: Uint8Array) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const mintAuthorityOption = view.getUint32(0, true);
  const mintAuthority = mintAuthorityOption === 1 ? addressDecoder.decode(data.subarray(4, 36)) : null;
  const supplyOffset = 36;
  const decimalsOffset = supplyOffset + 8;
  const isInitializedOffset = decimalsOffset + 1;
  const isInitialized = data[isInitializedOffset] !== 0;
  const freezeAuthorityOptionOffset = isInitializedOffset + 1;
  const freezeAuthorityOption = view.getUint32(freezeAuthorityOptionOffset, true);
  const freezeAuthority = freezeAuthorityOption === 1
    ? addressDecoder.decode(data.subarray(freezeAuthorityOptionOffset + 4, freezeAuthorityOptionOffset + 36))
    : null;

  return { initialized: isInitialized, mintAuthority, freezeAuthority };
}

function decodePumpSwapPool(data: Uint8Array) {
  if (data.length < 200) {
    throw new Error("PumpSwap pool account data is incomplete");
  }

  // Anchor discriminator (8 bytes) + pool fields
  const protocolFeeRecipient = addressDecoder.decode(data.subarray(8, 40));
  const protocolFeeRecipientTokenAccount = addressDecoder.decode(data.subarray(40, 72));
  const coinCreatorVaultAta = addressDecoder.decode(data.subarray(72, 104));
  const coinCreatorVaultAuthority = addressDecoder.decode(data.subarray(104, 136));

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const protocolFeeBps = BigInt(view.getUint16(136, true));
  const creatorFeeBps = BigInt(view.getUint16(138, true));

  return {
    protocolFeeRecipient,
    protocolFeeRecipientTokenAccount,
    coinCreatorVaultAta,
    coinCreatorVaultAuthority,
    protocolFeeBps,
    creatorFeeBps,
  };
}

function decodeTokenAccountAmount(data: Uint8Array): bigint {
  if (data.length < 72) return 0n;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return view.getBigUint64(64, true);
}
