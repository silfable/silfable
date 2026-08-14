import "server-only";

export const DEFAULT_SOLANA_RPC = process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

export function selectSolanaRpc(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return DEFAULT_SOLANA_RPC;
  const url = new URL(value.trim());
  const hostname = url.hostname.toLowerCase();
  const allowed = [".helius-rpc.com", ".quiknode.pro", ".alchemy.com", ".triton.one", ".ankr.com"];
  if (url.protocol !== "https:" || url.username || url.password || url.port || !allowed.some((suffix) => hostname.endsWith(suffix))) {
    throw new Error("Custom Solana RPC must be a supported HTTPS provider endpoint.");
  }
  return url.toString();
}
