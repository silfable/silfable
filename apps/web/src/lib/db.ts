// Backend API helper for Web App Chat History & Sessions (backed by MongoDB)

import type { PumpTokenIntelligence } from "@silfable/contracts";

export interface SessionItem {
  id: string;
  title: string;
  filter: "all" | "agent" | "mission" | "pump" | "active" | "limit" | "custom";
  createdAt: number;
  updatedAt: number;
  workspace: "solana" | "evm";
  chainKey?: string;
  sessionWalletAddress?: string;
}

export interface WebProposal {
  id: string;
  type: "jupiter_swap" | "pump_fun_buy" | "pump_analysis" | "limit_order" | "solana_bridge" | "evm_bridge" | "evm_swap" | "token_launch";
  mint: string;
  solAmount: string;
  estimatedTokens: string;
  status: "ready_for_user_signature" | "preview_only" | "approval_confirmed" | "signing" | "submitted" | "source_confirmed" | "confirmed" | "reverted" | "unknown" | "signed" | "failed";
  mode: string;
  explanation: string;
  checks?: Array<{ code: string; status: "pass" | "block"; message: string }>;
  inputAmount?: string;
  outputAmount?: string;
  minimumOutputAmount?: string;
  inputMint?: string;
  outputMint?: string;
  outputSymbol?: string;
  inputSymbol?: string;
  inputDecimals?: number;
  outputDecimals?: number;
  venue?: string;
  quoteResponse?: unknown;
  quoteRouting?: "CLASSIC" | "WRAP" | "UNWRAP";
  priceImpactPct?: string;
  slippageBps?: string;
  estimatedNetworkFeeUsd?: string;
  destination?: "robinhood" | "solana";
  destinationRecipient?: string;
  amountUsdc?: string;
  amountUsdg?: string;
  bridgeRequestId?: string;
  bridgeTransaction?: string;
  bridgeBlockhash?: string;
  bridgeLastValidBlockHeight?: number;
  bridgeQuoteExpiresAt?: number;
  bridgeEstimatedSeconds?: number;
  bridgeAction?: "approval" | "deposit";
  bridgeTotalFeeUsd?: number;
  bridgeApprovalTxHash?: string;
  bridgeStatusMessage?: string;
  bridgeError?: string;
  sourceUsdcBalance?: string;
  sourceSolBalance?: string;
  feeReserveSol?: string;
  sourceTxHash?: string;
  destinationTxHash?: string;
  sellToken?: string;
  buyToken?: string;
  sellTokenAddress?: string;
  buyTokenAddress?: string;
  sellTokenDecimals?: number;
  buyTokenDecimals?: number;
  sellAmount?: string;
  buyAmount?: string;
  minimumBuyAmount?: string;
  quoteExpiresAt?: number;
  transactionHash?: string;
  transactionSignature?: string;
  launchName?: string;
  launchSymbol?: string;
  launchDescription?: string;
  launchImageUri?: string;
  launchMetadataUri?: string;
  launchMetadataGatewayUrl?: string;
  launchMetadataSha256?: string;
  launchCreatorWallet?: string;
  launchMintAddress?: string;
  launchStage?: "draft" | "preflight" | "final-review" | "submitted" | "confirmed" | "failed" | "unknown";
  launchTransactionBase64?: string;
  launchTransactionDigest?: string;
  launchSimulationSlot?: number;
  launchComputeUnitsConsumed?: number | null;
  launchNetworkFeeLamports?: string;
  launchPriorityFeeLamports?: string;
  launchRentLamports?: string;
  launchTotalEstimatedOutflowLamports?: string;
  launchLastValidBlockHeight?: number;
  launchExpiresAt?: number;
  launchSignature?: string;
  launchExplorerUrl?: string;
  launchError?: string;
  maxCreatorOutflowLamports?: string;
  maxPriorityFeeLamports?: string;
  pumpIntelligence?: PumpTokenIntelligence;
  automationProposalId?: string;
  automationReason?: "DCA_DUE" | "TAKE_PROFIT" | "STOP_LOSS";
}

export interface WebMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  proposal?: WebProposal;
  usage?: WebUsage;
  createdAt: number;
}

export interface WebUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number | null;
  model: string;
}

export async function getAllSessions(walletAddress: string): Promise<SessionItem[]> {
  try {
    if (!walletAddress) return [];
    const res = await fetch(`/api/chat/session?walletAddress=${encodeURIComponent(walletAddress)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.sessions || [];
  } catch (err) {
    console.error("Backend getAllSessions error:", err);
    return [];
  }
}

export async function saveSession(walletAddress: string, session: SessionItem): Promise<SessionItem | null> {
  try {
    if (!walletAddress) return null;
    const res = await fetch("/api/chat/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress, session }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.session || null;
  } catch (err) {
    console.error("Backend saveSession error:", err);
    return null;
  }
}

export async function deleteSession(walletAddress: string, sessionId: string): Promise<void> {
  try {
    if (!walletAddress || !sessionId) return;
    await fetch("/api/chat/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress, action: "delete", sessionId }),
    });
  } catch (err) {
    console.error("Backend deleteSession error:", err);
  }
}

export async function deleteAllSessions(walletAddress: string): Promise<void> {
  try {
    if (!walletAddress) return;
    await fetch("/api/chat/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress, action: "delete_all" }),
    });
  } catch (err) {
    console.error("Backend deleteAllSessions error:", err);
  }
}

export async function getSessionMessages(walletAddress: string, sessionId: string): Promise<WebMessage[]> {
  try {
    if (!sessionId) return [];
    const res = await fetch(`/api/chat/message?sessionId=${encodeURIComponent(sessionId)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.messages || [];
  } catch (err) {
    console.error("Backend getSessionMessages error:", err);
    return [];
  }
}

export async function saveMessage(walletAddress: string, msg: WebMessage): Promise<WebMessage | null> {
  try {
    if (!msg || !msg.sessionId) return null;
    const res = await fetch("/api/chat/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: msg }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.message || null;
  } catch (err) {
    console.error("Backend saveMessage error:", err);
    return null;
  }
}
