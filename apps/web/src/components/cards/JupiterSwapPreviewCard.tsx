"use client";

import type { WebProposal } from "@/lib/db";
import { SwapRouteCard } from "./SwapRouteCard";

interface Props { proposal: WebProposal; status: WebProposal["status"]; maxSlippageBps?: string; onExecute: () => void; }

function formatRaw(raw: string | undefined, decimals: number): string {
  if (!raw) return "0";
  const padded = raw.padStart(decimals + 1, "0");
  const whole = decimals ? padded.slice(0, -decimals) : padded;
  const fraction = decimals ? padded.slice(-decimals).replace(/0+$/u, "") : "";
  return fraction ? `${whole}.${fraction}` : whole;
}

export function JupiterSwapPreviewCard({ proposal, status, maxSlippageBps = "100", onExecute }: Props) {
  const inputSymbol = proposal.inputSymbol ?? "SOL";
  const outputSymbol = proposal.outputSymbol ?? "USDC";
  const inputDisplay = proposal.inputAmount ? formatRaw(proposal.inputAmount, proposal.inputDecimals ?? 9) : proposal.solAmount;
  const outputDisplay = formatRaw(proposal.outputAmount, proposal.outputDecimals ?? 6);
  const minimumDisplay = formatRaw(proposal.minimumOutputAmount, proposal.outputDecimals ?? 6);
  const confirmed = status === "confirmed" || status === "signed";
  const pending = status === "signing" || status === "submitted";
  const disabled = ["signed", "signing", "submitted", "confirmed", "reverted", "unknown"].includes(status) || !proposal.quoteResponse;
  return <SwapRouteCard
    network="solana"
    venue={proposal.venue ?? "Jupiter"}
    inputSymbol={inputSymbol}
    outputSymbol={outputSymbol}
    statusLabel={confirmed ? "Confirmed" : status === "unknown" ? "Verify transaction" : pending ? "Processing" : "Quote ready"}
    statusTone={confirmed ? "confirmed" : status === "unknown" || status === "reverted" ? "warning" : pending ? "pending" : "ready"}
    details={[
      { label: "Input", value: `${inputDisplay} ${inputSymbol}` },
      { label: "Expected output", value: `${outputDisplay} ${outputSymbol}` },
      { label: "Minimum output", value: `${minimumDisplay} ${outputSymbol}` },
      { label: "Price impact", value: `${proposal.priceImpactPct ?? "0"}%` },
      { label: "Network fee", value: "Calculated at wallet review" },
      { label: "Maximum slippage", value: `${proposal.slippageBps ?? maxSlippageBps} bps` },
      { label: "Silfable fee", value: "None" },
      { label: "Route", value: `${proposal.venue ?? "Jupiter"} · Solana` },
    ]}
    checks={(proposal.checks ?? []).map(({ code, message }) => ({ code, message }))}
    helperText={proposal.explanation || "Review the live route before the wallet opens."}
    actionLabel={pending ? "Processing…" : status === "unknown" ? "Verify Transaction" : "Review in Wallet"}
    actionDisabled={disabled}
    explorerUrl={proposal.transactionSignature ? `https://solscan.io/tx/${proposal.transactionSignature}` : null}
    onAction={onExecute}
  />;
}
