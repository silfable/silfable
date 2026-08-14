import { createHash } from "node:crypto";
import { Keypair, VersionedTransaction } from "@solana/web3.js";

import type { PumpMainnetRpc } from "./rpc.js";

export function verifyDigestMatchesTransaction(
  serializedTransaction: Uint8Array,
  expectedDigest: string
): void {
  const digest = createHash("sha256").update(serializedTransaction).digest("hex");
  if (digest !== expectedDigest) {
    throw new Error("Pump transaction digest mismatch; signing authority is denied");
  }
}

export function signPumpVersionedTransaction(
  transaction: VersionedTransaction,
  keypair: Keypair
): VersionedTransaction {
  transaction.sign([keypair]);
  return transaction;
}

export async function broadcastPumpTransaction(input: {
  signedTransaction: VersionedTransaction;
  rpc: PumpMainnetRpc;
}): Promise<{ signature: string }> {
  const serialized = input.signedTransaction.serialize();
  const base64 = Buffer.from(serialized).toString("base64");
  const signature = await input.rpc.sendTransaction(base64, { encoding: "base64", skipPreflight: false });
  return { signature };
}
