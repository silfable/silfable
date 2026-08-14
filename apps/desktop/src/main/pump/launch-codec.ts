import {
  address,
  getAddressEncoder,
  getProgramDerivedAddress,
} from "@solana/kit";

import { PUMP_PROGRAM_ID } from "./inspector.js";

export const PUMP_CREATE_V2_DISCRIMINATOR = Uint8Array.from([214, 144, 76, 236, 95, 139, 49, 180]);
export const PUMP_LAUNCH_CODEC_REVISION = "pump-sdk-1.36.0:create-v2";
export const MAYHEM_PROGRAM_ID = "MAyhSmzXzV1pTf7LsNkrNwkWKTo4ougAJ1PPg47MD4e";
export const SYSTEM_PROGRAM_ID = "11111111111111111111111111111111";
export const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
export const ASSOCIATED_TOKEN_PROGRAM_ID = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";

const textEncoder = new TextEncoder();
const addressEncoder = getAddressEncoder();

export type PumpLaunchInstructionAccount = {
  role: string;
  address: string;
  signer: boolean;
  writable: boolean;
};

export type PumpLaunchEncodedInstruction = {
  programAddress: typeof PUMP_PROGRAM_ID;
  accounts: PumpLaunchInstructionAccount[];
  data: Uint8Array;
  codecRevision: typeof PUMP_LAUNCH_CODEC_REVISION;
};

export async function encodeAndInspectPumpLaunchInstruction(input: {
  creatorWallet: string;
  mintAddress: string;
  name: string;
  symbol: string;
  metadataUri: string;
}): Promise<PumpLaunchEncodedInstruction> {
  const creator = address(input.creatorWallet);
  const mint = address(input.mintAddress);
  const pump = address(PUMP_PROGRAM_ID);
  const mayhem = address(MAYHEM_PROGRAM_ID);
  const associatedToken = address(ASSOCIATED_TOKEN_PROGRAM_ID);
  const token2022 = address(TOKEN_2022_PROGRAM_ID);
  const mintBytes = addressEncoder.encode(mint);

  const [mintAuthority] = await getProgramDerivedAddress({
    programAddress: pump,
    seeds: [textEncoder.encode("mint-authority")],
  });
  const [bondingCurve] = await getProgramDerivedAddress({
    programAddress: pump,
    seeds: [textEncoder.encode("bonding-curve"), mintBytes],
  });
  const [associatedBondingCurve] = await getProgramDerivedAddress({
    programAddress: associatedToken,
    seeds: [addressEncoder.encode(bondingCurve), addressEncoder.encode(token2022), mintBytes],
  });
  const [global] = await getProgramDerivedAddress({
    programAddress: pump,
    seeds: [textEncoder.encode("global")],
  });
  const [globalParams] = await getProgramDerivedAddress({
    programAddress: mayhem,
    seeds: [textEncoder.encode("global-params")],
  });
  const [solVault] = await getProgramDerivedAddress({
    programAddress: mayhem,
    seeds: [textEncoder.encode("sol-vault")],
  });
  const [mayhemState] = await getProgramDerivedAddress({
    programAddress: mayhem,
    seeds: [textEncoder.encode("mayhem-state"), mintBytes],
  });
  const [mayhemTokenVault] = await getProgramDerivedAddress({
    programAddress: associatedToken,
    seeds: [addressEncoder.encode(solVault), addressEncoder.encode(token2022), mintBytes],
  });
  const [eventAuthority] = await getProgramDerivedAddress({
    programAddress: pump,
    seeds: [textEncoder.encode("__event_authority")],
  });

  const accounts: PumpLaunchInstructionAccount[] = [
    account("mint", mint, true, true),
    account("mint_authority", mintAuthority),
    account("bonding_curve", bondingCurve, false, true),
    account("associated_bonding_curve", associatedBondingCurve, false, true),
    account("global", global),
    account("user", creator, true, true),
    account("system_program", SYSTEM_PROGRAM_ID),
    account("token_program", TOKEN_2022_PROGRAM_ID),
    account("associated_token_program", ASSOCIATED_TOKEN_PROGRAM_ID),
    account("mayhem_program_id", MAYHEM_PROGRAM_ID, false, true),
    account("global_params", globalParams),
    account("sol_vault", solVault, false, true),
    account("mayhem_state", mayhemState, false, true),
    account("mayhem_token_vault", mayhemTokenVault, false, true),
    account("event_authority", eventAuthority),
    account("program", PUMP_PROGRAM_ID),
  ];
  const data = encodeCreateV2Data(input);
  inspectPumpLaunchInstruction({ programAddress: PUMP_PROGRAM_ID, accounts, data });
  return {
    programAddress: PUMP_PROGRAM_ID,
    accounts,
    data,
    codecRevision: PUMP_LAUNCH_CODEC_REVISION,
  };
}

export function inspectPumpLaunchInstruction(
  instruction: Pick<PumpLaunchEncodedInstruction, "programAddress" | "accounts" | "data">,
): void {
  if (instruction.programAddress !== PUMP_PROGRAM_ID) throw new Error("Token launch instruction program is invalid");
  if (!equalBytes(instruction.data.subarray(0, 8), PUMP_CREATE_V2_DISCRIMINATOR)) {
    throw new Error("Token launch create_v2 discriminator is invalid");
  }
  if (instruction.accounts.length !== 16) throw new Error("Token launch create_v2 account layout changed");
  const mint = instruction.accounts[0];
  const creator = instruction.accounts[5];
  if (
    mint?.role !== "mint" || !mint.signer || !mint.writable
    || creator?.role !== "user" || !creator.signer || !creator.writable
    || instruction.accounts.filter((value) => value.signer).length !== 2
  ) {
    throw new Error("Token launch signer or account bindings are invalid");
  }
  const fixed = new Map([
    ["system_program", SYSTEM_PROGRAM_ID],
    ["token_program", TOKEN_2022_PROGRAM_ID],
    ["associated_token_program", ASSOCIATED_TOKEN_PROGRAM_ID],
    ["mayhem_program_id", MAYHEM_PROGRAM_ID],
    ["program", PUMP_PROGRAM_ID],
  ]);
  for (const value of instruction.accounts) {
    address(value.address);
    const expected = fixed.get(value.role);
    if (expected !== undefined && value.address !== expected) {
      throw new Error(`Token launch ${value.role} binding is invalid`);
    }
  }
}

function encodeCreateV2Data(input: {
  creatorWallet: string;
  name: string;
  symbol: string;
  metadataUri: string;
}): Uint8Array {
  const name = borshString(input.name, "name");
  const symbol = borshString(input.symbol.toUpperCase(), "symbol");
  const uri = borshString(input.metadataUri, "metadata URI");
  const creator = addressEncoder.encode(address(input.creatorWallet));
  return concat(PUMP_CREATE_V2_DISCRIMINATOR, name, symbol, uri, creator, Uint8Array.of(0, 0));
}

function borshString(value: string, label: string): Uint8Array {
  const bytes = textEncoder.encode(value);
  if (bytes.length === 0 || bytes.length > 512) throw new Error(`Token launch ${label} is invalid`);
  const length = new Uint8Array(4);
  new DataView(length.buffer).setUint32(0, bytes.length, true);
  return concat(length, bytes);
}

function account(
  role: string,
  value: string,
  signer = false,
  writable = false,
): PumpLaunchInstructionAccount {
  return { role, address: String(value), signer, writable };
}

function concat(...values: ArrayLike<number>[]): Uint8Array {
  const output = new Uint8Array(values.reduce((sum, value) => sum + value.length, 0));
  let offset = 0;
  for (const value of values) {
    for (let index = 0; index < value.length; index += 1) output[offset + index] = value[index]!;
    offset += value.length;
  }
  return output;
}

function equalBytes(left: ArrayLike<number>, right: ArrayLike<number>): boolean {
  return left.length === right.length && Array.from(left).every((value, index) => value === right[index]);
}
