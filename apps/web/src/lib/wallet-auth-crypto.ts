import { createHash, randomBytes } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";

export function normalizeWalletAddress(value: unknown): string {
  if (typeof value !== "string") throw new Error("A valid Solana wallet address is required.");
  return new PublicKey(value).toBase58();
}

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function createOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function buildWalletAuthMessage(input: {
  domain: string;
  uri: string;
  walletAddress: string;
  nonce: string;
  issuedAt: Date;
  expiresAt: Date;
  purpose?: "login" | "link";
}): string {
  return [
    `${input.domain} wants you to sign in with your Solana account:`,
    input.walletAddress,
    "",
    input.purpose === "link"
      ? "Link this public wallet to the authenticated Silfable account. This signature does not authorize a transaction."
      : "Authenticate to Silfable restricted Mainnet. This signature does not authorize a transaction.",
    "",
    `URI: ${input.uri}`,
    "Version: 1",
    "Chain ID: solana:mainnet",
    `Nonce: ${input.nonce}`,
    `Issued At: ${input.issuedAt.toISOString()}`,
    `Expiration Time: ${input.expiresAt.toISOString()}`,
  ].join("\n");
}

export function verifyWalletSignature(input: {
  walletAddress: string;
  message: string;
  signature: string;
}): boolean {
  try {
    const signature = bs58.decode(input.signature);
    if (signature.length !== nacl.sign.signatureLength) return false;
    const publicKey = new PublicKey(input.walletAddress).toBytes();
    return nacl.sign.detached.verify(
      new TextEncoder().encode(input.message),
      signature,
      publicKey,
    );
  } catch {
    return false;
  }
}
