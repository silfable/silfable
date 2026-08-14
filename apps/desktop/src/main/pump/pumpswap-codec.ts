import {
  address,
  getAddressEncoder,
  getProgramDerivedAddress,
  type Address,
} from "@solana/kit";

import {
  inspectPumpInstructionPlan,
  pumpInstructionManifest,
  PUMP_FEE_PROGRAM_ID,
  PUMP_IDL_REVISION,
  PUMP_SWAP_PROGRAM_ID,
  SOL_MINT,
  type PumpInspectionResult,
  type PumpInstructionPlan,
} from "./inspector.js";

const SYSTEM_PROGRAM_ID = "11111111111111111111111111111111";
const ASSOCIATED_TOKEN_PROGRAM_ID = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const RAW_AMOUNT_PATTERN = /^[1-9]\d*$/u;
const MAX_U64 = 18_446_744_073_709_551_615n;
const textEncoder = new TextEncoder();
const addressEncoder = getAddressEncoder();

export type PumpSwapCodecInput = {
  side: "buy" | "sell";
  walletAddress: string;
  tokenMint: string;
  tokenProgram: string;
  pool: string;
  userBaseTokenAccount: string;
  userQuoteTokenAccount: string;
  poolBaseTokenAccount: string;
  poolQuoteTokenAccount: string;
  protocolFeeRecipient: string;
  protocolFeeRecipientTokenAccount: string;
  coinCreatorVaultAta: string;
  coinCreatorVaultAuthority: string;
  inputAmount: string;
  minimumOutputAmount: string;
};

export type PumpSwapEncodedInstruction = {
  codec: "silfable-pumpswap";
  idlRevision: string;
  programAddress: string;
  data: Uint8Array;
  plan: PumpInstructionPlan;
  inspection: PumpInspectionResult;
  transactionBuilt: false;
  signingAttempted: false;
  broadcastAttempted: false;
};

export async function encodeAndInspectPumpSwapInstruction(
  input: PumpSwapCodecInput,
): Promise<PumpSwapEncodedInstruction> {
  validateInput(input);
  const manifest = pumpInstructionManifest("pumpswap", input.side);
  const derived = await deriveSwapAccounts(input);

  const accountsMap: Record<string, string> = {
    pool: input.pool,
    user: input.walletAddress,
    global_config: derived.globalConfig,
    base_mint: input.tokenMint,
    quote_mint: SOL_MINT,
    user_base_token_account: input.userBaseTokenAccount,
    user_quote_token_account: input.userQuoteTokenAccount,
    pool_base_token_account: input.poolBaseTokenAccount,
    pool_quote_token_account: input.poolQuoteTokenAccount,
    protocol_fee_recipient: input.protocolFeeRecipient,
    protocol_fee_recipient_token_account: input.protocolFeeRecipientTokenAccount,
    base_token_program: input.tokenProgram,
    quote_token_program: TOKEN_PROGRAM_ID,
    system_program: SYSTEM_PROGRAM_ID,
    associated_token_program: ASSOCIATED_TOKEN_PROGRAM_ID,
    event_authority: derived.eventAuthority,
    program: PUMP_SWAP_PROGRAM_ID,
    coin_creator_vault_ata: input.coinCreatorVaultAta,
    coin_creator_vault_authority: input.coinCreatorVaultAuthority,
    global_volume_accumulator: derived.globalVolumeAccumulator,
    user_volume_accumulator: derived.userVolumeAccumulator,
    fee_config: derived.feeConfig,
    fee_program: PUMP_FEE_PROGRAM_ID,
  };

  const plan: PumpInstructionPlan = {
    venue: "pumpswap",
    side: input.side,
    programId: PUMP_SWAP_PROGRAM_ID,
    discriminator: [...manifest.discriminator],
    tokenMint: input.tokenMint,
    quoteMint: SOL_MINT,
    walletAddress: input.walletAddress,
    accounts: manifest.roles.map((role) => {
      const accountAddress = accountsMap[role.name];
      if (accountAddress === undefined) {
        throw new Error(`PumpSwap codec omitted required account role ${role.name}`);
      }
      return {
        role: role.name,
        address: accountAddress,
        signer: role.signer,
        writable: role.writable,
      };
    }),
  };

  const inspection = inspectPumpInstructionPlan(plan);
  if (!inspection.allowed) {
    const failed = inspection.checks.find((check) => check.status === "fail");
    throw new Error(
      `PumpSwap local codec failed the pinned inspector${failed ? `: ${failed.code}` : ""}`,
    );
  }

  return {
    codec: "silfable-pumpswap",
    idlRevision: PUMP_IDL_REVISION,
    programAddress: PUMP_SWAP_PROGRAM_ID,
    data: encodeInstructionData(
      manifest.discriminator,
      BigInt(input.inputAmount),
      BigInt(input.minimumOutputAmount),
    ),
    plan,
    inspection,
    transactionBuilt: false,
    signingAttempted: false,
    broadcastAttempted: false,
  };
}

function validateInput(input: PumpSwapCodecInput): void {
  if (!RAW_AMOUNT_PATTERN.test(input.inputAmount) || BigInt(input.inputAmount) > MAX_U64) {
    throw new Error("PumpSwap instruction input amount is invalid");
  }
  if (!RAW_AMOUNT_PATTERN.test(input.minimumOutputAmount) || BigInt(input.minimumOutputAmount) > MAX_U64) {
    throw new Error("PumpSwap instruction minimum output amount is invalid");
  }
}

async function deriveSwapAccounts(input: PumpSwapCodecInput) {
  const [globalConfig] = await getProgramDerivedAddress({
    programAddress: address(PUMP_SWAP_PROGRAM_ID),
    seeds: [textEncoder.encode("global_config")],
  });
  const [eventAuthority] = await getProgramDerivedAddress({
    programAddress: address(PUMP_SWAP_PROGRAM_ID),
    seeds: [textEncoder.encode("__event_authority")],
  });
  const [globalVolumeAccumulator] = await getProgramDerivedAddress({
    programAddress: address(PUMP_SWAP_PROGRAM_ID),
    seeds: [textEncoder.encode("global_volume_accumulator")],
  });
  const [userVolumeAccumulator] = await getProgramDerivedAddress({
    programAddress: address(PUMP_SWAP_PROGRAM_ID),
    seeds: [textEncoder.encode("user_volume_accumulator"), addressEncoder.encode(address(input.walletAddress))],
  });
  const [feeConfig] = await getProgramDerivedAddress({
    programAddress: address(PUMP_FEE_PROGRAM_ID),
    seeds: [textEncoder.encode("fee_config"), addressEncoder.encode(address(PUMP_SWAP_PROGRAM_ID))],
  });

  return {
    globalConfig,
    eventAuthority,
    globalVolumeAccumulator,
    userVolumeAccumulator,
    feeConfig,
  };
}

function encodeInstructionData(
  discriminator: number[],
  inputAmount: bigint,
  minimumOutputAmount: bigint,
): Uint8Array {
  const out = new Uint8Array(8 + 8 + 8);
  out.set(discriminator, 0);
  const view = new DataView(out.buffer);
  view.setBigUint64(8, inputAmount, true);
  view.setBigUint64(16, minimumOutputAmount, true);
  return out;
}
