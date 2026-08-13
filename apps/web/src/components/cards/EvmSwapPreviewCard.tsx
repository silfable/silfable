"use client";

import type { WebProposal } from "@/lib/db";
import { SwapRouteCard } from "./SwapRouteCard";

function formatRaw(value: string | undefined, decimals: number): string {
  if (!value || !/^\d+$/u.test(value)) return "—";
  const raw = BigInt(value);
  const scale = BigInt(10) ** BigInt(decimals);
  const whole = raw / scale;
  const fraction = (raw % scale).toString().padStart(decimals, "0").replace(/0+$/u, "").slice(0, 8);
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function EvmSwapPreviewCard({ proposal, onPrepare, busy }: { proposal: WebProposal; onPrepare: () => void; busy: boolean }) {
  const hasQuote = Boolean(proposal.quoteResponse && proposal.buyAmount);
  const confirmed = proposal.status === "confirmed";
  const final = ["signing", "submitted", "confirmed", "unknown"].includes(proposal.status);
  const outputDecimals = proposal.buyTokenDecimals ?? (proposal.buyToken === "ETH" ? 18 : 6);
  const routeLabel = proposal.quoteRouting === "WRAP" ? "Canonical wrap" : proposal.quoteRouting === "UNWRAP" ? "Canonical unwrap" : "Uniswap · Robinhood";
  const networkFee = proposal.quoteRouting === "WRAP" || proposal.quoteRouting === "UNWRAP"
    ? "Network gas only"
    : proposal.estimatedNetworkFeeUsd
      ? `≈ $${Number(proposal.estimatedNetworkFeeUsd).toFixed(4)}`
      : "Calculated at wallet review";
  return <SwapRouteCard
    network="robinhood"
    venue="Uniswap"
    inputSymbol={proposal.sellToken ?? "Asset"}
    outputSymbol={proposal.buyToken ?? "Asset"}
    statusLabel={confirmed ? "Confirmed" : hasQuote ? "Quote ready" : busy ? "Finding route" : "Quote unavailable"}
    statusTone={confirmed ? "confirmed" : hasQuote ? "ready" : "pending"}
    details={[
      { label: "Input", value: `${proposal.sellAmount ?? "—"} ${proposal.sellToken ?? ""}` },
      { label: "Expected output", value: hasQuote ? `${formatRaw(proposal.buyAmount, outputDecimals)} ${proposal.buyToken}` : "Loading quote…" },
      { label: "Minimum output", value: hasQuote ? `${formatRaw(proposal.minimumBuyAmount, outputDecimals)} ${proposal.buyToken}` : "—" },
      { label: "Network fee", value: hasQuote ? networkFee : "—" },
      { label: "Maximum slippage", value: proposal.quoteRouting === "WRAP" || proposal.quoteRouting === "UNWRAP" ? "Not applicable · 1:1" : `${proposal.slippageBps ?? "100"} bps` },
      { label: "Silfable fee", value: "None" },
      { label: "Route", value: routeLabel },
      ...(proposal.buyTokenAddress && proposal.buyTokenAddress !== "0x0000000000000000000000000000000000000000" ? [{ label: "Output contract", value: `${proposal.buyTokenAddress.slice(0, 8)}…${proposal.buyTokenAddress.slice(-6)}` }] : []),
    ]}
    checks={(proposal.checks ?? []).map(({ code, message }) => ({ code, message }))}
    helperText={hasQuote ? "Review the live route before the wallet opens. Token approval may be requested separately." : busy ? "Silfable is loading a live quote. Your wallet will not open automatically." : "The previous quote attempt failed. Retry the route request; this does not open your wallet."}
    actionLabel={busy && !hasQuote ? "Loading Quote…" : busy ? "Preparing Review…" : hasQuote ? "Review in Wallet" : "Retry Quote"}
    actionDisabled={busy || final}
    explorerUrl={proposal.transactionHash ? `https://robinhoodchain.blockscout.com/tx/${proposal.transactionHash}` : null}
    onAction={onPrepare}
  />;
}
