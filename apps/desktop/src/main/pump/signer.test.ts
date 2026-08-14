import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { Keypair, TransactionMessage, VersionedTransaction } from "@solana/web3.js";

import { PumpMainnetRpc } from "./rpc.js";
import { broadcastPumpTransaction, signPumpVersionedTransaction, verifyDigestMatchesTransaction } from "./signer.js";

test("verifyDigestMatchesTransaction succeeds only for exact expected SHA256 digest", () => {
  const bytes = new Uint8Array([1, 2, 3, 4, 5]);
  const validDigest = createHash("sha256").update(bytes).digest("hex");

  assert.doesNotThrow(() => verifyDigestMatchesTransaction(bytes, validDigest));
  assert.throws(() => verifyDigestMatchesTransaction(bytes, "0".repeat(64)), /digest mismatch/u);
});

test("signPumpVersionedTransaction attaches signature to transaction", () => {
  const keypair = Keypair.generate();
  const message = new TransactionMessage({
    payerKey: keypair.publicKey,
    recentBlockhash: keypair.publicKey.toBase58(),
    instructions: [],
  }).compileToV0Message();
  const tx = new VersionedTransaction(message);
  assert.equal(tx.signatures[0]?.some((b) => b !== 0), false);

  const signed = signPumpVersionedTransaction(tx, keypair);
  assert.equal(signed.signatures[0]?.some((b) => b !== 0), true);
});

test("broadcastPumpTransaction sends base64 serialized transaction via RPC", async () => {
  const keypair = Keypair.generate();
  const message = new TransactionMessage({
    payerKey: keypair.publicKey,
    recentBlockhash: keypair.publicKey.toBase58(),
    instructions: [],
  }).compileToV0Message();
  const tx = signPumpVersionedTransaction(new VersionedTransaction(message), keypair);

  const dummySig = "1".repeat(64);
  const rpc = new PumpMainnetRpc({
    rpcUrl: "https://rpc.example.test",
    fetch: async () => new Response(JSON.stringify({ jsonrpc: "2.0", id: "1", result: dummySig })),
  });

  const res = await broadcastPumpTransaction({ signedTransaction: tx, rpc });
  assert.equal(res.signature, dummySig);
});
