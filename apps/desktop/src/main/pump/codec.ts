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
  PUMP_PROGRAM_ID,
  SOL_MINT,
  type PumpInspectionResult,
  type PumpInstructionPlan,
} from "./inspector.js";

const SYSTEM_PROGRAM_ID = "11111111111111111111111111111111";
const ASSOCIATED_TOKEN_PROGRAM_ID = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const RAW_AMOUNT_PATTERN = /^[1-9]\d*$/u;
const MAX_U64 = 18_446_744_073_709_551_615n;
const textEncoder = new TextEncoder();
const addressEncoder = getAddressEncoder();

export type PumpV2CodecInput = {
  side: "buy" | "sell";
  walletAddress: string;
  tokenMint: string;
  tokenProgram: string;
  creator: string;
  feeRecipient: string;
  authorizedFeeRecipients: string[];
  buybackFeeRecipient: string;
  authorizedBuybackFeeRecipients: string[];
  inputAmount: string;
  minimumOutputAmount: string;
};

export type PumpV2EncodedInstruction = {
  codec: "silfable-pump-v2";
  idlRevision: string;
  programAddress: string;
  data: Uint8Array;
  plan: PumpInstructionPlan;
  inspection: PumpInspectionResult;
  transactionBuilt: false;
  signingAttempted: false;
  broadcastAttempted: false;
};

export async function encodeAndInspectPumpV2Instruction(
  input: PumpV2CodecInput,
): Promise<PumpV2EncodedInstruction> {
  validateInput(input);
  const manifest = pumpInstructionManifest("pump", input.side);
  const accounts = await deriveAccounts(input);
  const plan: PumpInstructionPlan = {
    venue: "pump",
    side: input.side,
    programId: PUMP_PROGRAM_ID,
    discriminator: [...manifest.discriminator],
    tokenMint: input.tokenMint,
    quoteMint: SOL_MINT,
    walletAddress: input.walletAddress,
    accounts: manifest.roles.map((role) => {
      const accountAddress = accounts[role.name];
      if (accountAddress === undefined) {
        throw new Error(`Pump codec omitted required account role ${role.name}`);
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
      `Pump v2 local codec failed the pinned inspector${failed ? `: ${failed.code}` : ""}`,
    );
  }
  return {
    codec: "silfable-pump-v2",
    idlRevision: PUMP_IDL_REVISION,
    programAddress: PUMP_PROGRAM_ID,
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

async function deriveAccounts(input: PumpV2CodecInput): Promise<Record<string, string>> {
  const bondingCurve = await pda(PUMP_PROGRAM_ID, "bonding-curve", input.tokenMint);
  const creatorVault = await pda(PUMP_PROGRAM_ID, "creator-vault", input.creator);
  const userVolumeAccumulator = await pda(
    PUMP_PROGRAM_ID,
    "user_volume_accumulator",
    input.walletAddress,
  );
  return {
    global: await pda(PUMP_PROGRAM_ID, "global"),
    base_mint: input.tokenMint,
    quote_mint: SOL_MINT,
    base_token_program: input.tokenProgram,
    quote_token_program: TOKEN_PROGRAM_ID,
    associated_token_program: ASSOCIATED_TOKEN_PROGRAM_ID,
    fee_recipient: input.feeRecipient,
    associated_quote_fee_recipient: await associatedTokenAddress(
      input.feeRecipient,
      SOL_MINT,
      TOKEN_PROGRAM_ID,
    ),
    buyback_fee_recipient: input.buybackFeeRecipient,
    associated_quote_buyback_fee_recipient: await associatedTokenAddress(
      input.buybackFeeRecipient,
      SOL_MINT,
      TOKEN_PROGRAM_ID,
    ),
    bonding_curve: bondingCurve,
    associated_base_bonding_curve: await associatedTokenAddress(
      bondingCurve,
      input.tokenMint,
      input.tokenProgram,
    ),
    associated_quote_bonding_curve: await associatedTokenAddress(
      bondingCurve,
      SOL_MINT,
      TOKEN_PROGRAM_ID,
    ),
    user: input.walletAddress,
    associated_base_user: await associatedTokenAddress(
      input.walletAddress,
      input.tokenMint,
      input.tokenProgram,
    ),
    associated_quote_user: await associatedTokenAddress(
      input.walletAddress,
      SOL_MINT,
      TOKEN_PROGRAM_ID,
    ),
    creator_vault: creatorVault,
    associated_creator_vault: await associatedTokenAddress(
      creatorVault,
      SOL_MINT,
      TOKEN_PROGRAM_ID,
    ),
    sharing_config: await pda(PUMP_FEE_PROGRAM_ID, "sharing-config", input.tokenMint),
    global_volume_accumulator: await pda(PUMP_PROGRAM_ID, "global_volume_accumulator"),
    user_volume_accumulator: userVolumeAccumulator,
    associated_user_volume_accumulator: await associatedTokenAddress(
      userVolumeAccumulator,
      SOL_MINT,
      TOKEN_PROGRAM_ID,
    ),
    fee_config: await pda(PUMP_FEE_PROGRAM_ID, "fee_config", PUMP_PROGRAM_ID),
    fee_program: PUMP_FEE_PROGRAM_ID,
    system_program: SYSTEM_PROGRAM_ID,
    event_authority: await pda(PUMP_PROGRAM_ID, "__event_authority"),
    program: PUMP_PROGRAM_ID,
  };
}

async function pda(program: string, ...seeds: string[]): Promise<string> {
  const [derived] = await getProgramDerivedAddress({
    programAddress: checkedAddress(program),
    seeds: seeds.map((seed, index) =>
      index > 0 || isAddressSeed(seed)
        ? addressEncoder.encode(checkedAddress(seed))
        : textEncoder.encode(seed),
    ),
  });
  return derived;
}

function isAddressSeed(value: string): boolean {
  return value.length >= 32 && value.length <= 44 && !value.includes("_") && !value.includes("-");
}

async function associatedTokenAddress(
  owner: string,
  mint: string,
  tokenProgram: string,
): Promise<string> {
  const [derived] = await getProgramDerivedAddress({
    programAddress: checkedAddress(ASSOCIATED_TOKEN_PROGRAM_ID),
    seeds: [owner, tokenProgram, mint].map((value) =>
      addressEncoder.encode(checkedAddress(value)),
    ),
  });
  return derived;
}

function encodeInstructionData(
  discriminator: number[],
  inputAmount: bigint,
  minimumOutputAmount: bigint,
): Uint8Array {
  const data = new Uint8Array(24);
  data.set(discriminator, 0);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  view.setBigUint64(8, inputAmount, true);
  view.setBigUint64(16, minimumOutputAmount, true);
  return data;
}

function validateInput(input: PumpV2CodecInput): void {
  for (const [name, value] of Object.entries({
    walletAddress: input.walletAddress,
    tokenMint: input.tokenMint,
    creator: input.creator,
    feeRecipient: input.feeRecipient,
    buybackFeeRecipient: input.buybackFeeRecipient,
  })) {
    try {
      checkedAddress(value);
    } catch {
      throw new Error(`Pump ${name} is invalid`);
    }
  }
  if (input.tokenMint === SOL_MINT) throw new Error("Pump token mint cannot be SOL");
  if (input.tokenProgram !== TOKEN_PROGRAM_ID && input.tokenProgram !== TOKEN_2022_PROGRAM_ID) {
    throw new Error("Pump token program is not allowlisted");
  }
  if (!input.authorizedFeeRecipients.includes(input.feeRecipient)) {
    throw new Error("Pump fee recipient is not present in finalized Global state");
  }
  if (!input.authorizedBuybackFeeRecipients.includes(input.buybackFeeRecipient)) {
    throw new Error("Pump buyback fee recipient is not present in finalized Global state");
  }
  for (const [name, amount] of Object.entries({
    inputAmount: input.inputAmount,
    minimumOutputAmount: input.minimumOutputAmount,
  })) {
    if (!RAW_AMOUNT_PATTERN.test(amount) || BigInt(amount) > MAX_U64) {
      throw new Error(`Pump ${name} is not a positive u64 amount`);
    }
  }
}

function checkedAddress(value: string): Address {
  return address(value);
}
