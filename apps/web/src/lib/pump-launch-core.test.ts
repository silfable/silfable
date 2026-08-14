import assert from "node:assert/strict";
import test from "node:test";

import { Keypair } from "@solana/web3.js";

import {
  buildPumpLaunchTransaction,
  inspectPumpLaunchTransaction,
  PUMP_PROGRAM_ID,
  transactionDigest,
} from "./pump-launch-core";

const creator = Keypair.fromSeed(Uint8Array.from({ length: 32 }, (_, index) => index + 1));
const mint = Keypair.fromSeed(Uint8Array.from({ length: 32 }, (_, index) => 100 + index));
const blockhash = Keypair.fromSeed(Uint8Array.from({ length: 32 }, (_, index) => 200 + index)).publicKey.toBase58();

test("builds a lookup-free Pump.fun create_v2 transaction with exactly two signers", () => {
  const built = buildPumpLaunchTransaction({
    creatorWallet: creator.publicKey.toBase58(),
    mintAddress: mint.publicKey.toBase58(),
    name: "Silfable Test",
    symbol: "SLFB",
    metadataUri: "ipfs://bafybeigdyrzt4examplemetadata",
    recentBlockhash: blockhash,
    priorityFeeLamports: BigInt(100_000),
  });
  const inspected = inspectPumpLaunchTransaction(built.transaction, creator.publicKey.toBase58(), mint.publicKey.toBase58());
  assert.equal(inspected.creatorWallet, creator.publicKey.toBase58());
  assert.equal(inspected.mintAddress, mint.publicKey.toBase58());
  assert.equal(built.transaction.message.addressTableLookups.length, 0);
  assert.equal(built.transaction.message.header.numRequiredSignatures, 2);
  assert.equal(built.transaction.message.staticAccountKeys[built.transaction.message.compiledInstructions.at(-1)!.programIdIndex]!.toBase58(), PUMP_PROGRAM_ID.toBase58());
  assert.match(transactionDigest(built.transaction), /^[a-f0-9]{64}$/u);
});

test("rejects a changed create_v2 discriminator", () => {
  const { transaction } = buildPumpLaunchTransaction({
    creatorWallet: creator.publicKey.toBase58(),
    mintAddress: mint.publicKey.toBase58(),
    name: "Silfable Test",
    symbol: "SLFB",
    metadataUri: "https://example.com/metadata.json",
    recentBlockhash: blockhash,
    priorityFeeLamports: BigInt(0),
  });
  transaction.message.compiledInstructions.at(-1)!.data[0] ^= 0xff;
  assert.throws(() => inspectPumpLaunchTransaction(transaction), /layout changed/u);
});
