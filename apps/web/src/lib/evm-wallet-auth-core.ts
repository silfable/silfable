import { getAddress } from "viem";

export function normalizeEvmAddress(value: string): `0x${string}` {
  return getAddress(value);
}

export function buildEvmWalletLinkMessage(input: {
  domain: string;
  uri: string;
  address: `0x${string}`;
  chainId: number;
  nonce: string;
  issuedAt: Date;
  expiresAt: Date;
  purpose?: "login" | "link";
}): string {
  return [
    `${input.domain} wants you to verify an EVM wallet for Silfable:`,
    input.address,
    "",
    input.purpose === "login"
      ? "Authenticate to Silfable restricted Mainnet. This signature does not authorize a transaction."
      : "Link this public wallet to the authenticated Silfable account. This signature does not authorize a transaction.",
    "",
    `URI: ${input.uri}`,
    "Version: 1",
    `Chain ID: ${input.chainId}`,
    `Nonce: ${input.nonce}`,
    `Issued At: ${input.issuedAt.toISOString()}`,
    `Expiration Time: ${input.expiresAt.toISOString()}`,
  ].join("\n");
}
