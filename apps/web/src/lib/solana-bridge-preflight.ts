import { Connection, PublicKey } from "@solana/web3.js";

export const SOLANA_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const BRIDGE_FEE_RESERVE_LAMPORTS = BigInt(100_000);

function formatUsdc(amount: bigint): string {
  const whole = amount / BigInt(1_000_000);
  const fraction = (amount % BigInt(1_000_000)).toString().padStart(6, "0").replace(/0+$/u, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function formatSol(lamports: bigint): string {
  const whole = lamports / BigInt(1_000_000_000);
  const fraction = (lamports % BigInt(1_000_000_000)).toString().padStart(9, "0").replace(/0+$/u, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export type SolanaBridgeBalancePreflight = {
  availableUsdc: string;
  availableSol: string;
  feeReserveSol: string;
};

export async function assertSolanaBridgeBalance(connection: Connection, walletAddress: string, requiredUsdc: bigint): Promise<SolanaBridgeBalancePreflight> {
  const owner = new PublicKey(walletAddress);
  const mint = new PublicKey(SOLANA_USDC_MINT);
  const [lamports, accounts] = await Promise.all([
    connection.getBalance(owner, "confirmed"),
    connection.getParsedTokenAccountsByOwner(owner, { mint }, "confirmed"),
  ]);
  const availableUsdc = accounts.value.reduce((total, account) => {
    const amount = account.account.data.parsed.info.tokenAmount.amount;
    return total + BigInt(typeof amount === "string" ? amount : "0");
  }, BigInt(0));
  if (availableUsdc < requiredUsdc) {
    throw new Error(`Insufficient USDC: bridge requires ${formatUsdc(requiredUsdc)} USDC, but this wallet has ${formatUsdc(availableUsdc)} USDC.`);
  }
  if (BigInt(lamports) < BRIDGE_FEE_RESERVE_LAMPORTS) {
    throw new Error(`Insufficient SOL for network fees: keep at least ${formatSol(BRIDGE_FEE_RESERVE_LAMPORTS)} SOL available, but this wallet has ${formatSol(BigInt(lamports))} SOL.`);
  }
  return {
    availableUsdc: formatUsdc(availableUsdc),
    availableSol: formatSol(BigInt(lamports)),
    feeReserveSol: formatSol(BRIDGE_FEE_RESERVE_LAMPORTS),
  };
}
