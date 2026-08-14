// @ts-nocheck
import type {
  BridgeDestinationChain,
  BridgeProposal,
  EvmChainKey,
  RuntimeStatus,
  SessionRecord,
  TransactionSettings,
} from "@silfable/contracts";
import {
  BRIDGE_ROBINHOOD_CHAIN_ID,
  BRIDGE_ROBINHOOD_USDG_ADDRESS,
} from "@silfable/contracts";

export const BRIDGE_DESTINATIONS: Partial<Record<BridgeDestinationChain, {
  label: string;
  chainId: BridgeProposal["contract"]["destinationChainId"];
  assetAddress: string;
  symbol: "USDC" | "USDG";
  confirmation: "BRIDGE USDC TO ROBINHOOD";
}>> = {
  robinhood: { label: "Robinhood", chainId: BRIDGE_ROBINHOOD_CHAIN_ID, assetAddress: BRIDGE_ROBINHOOD_USDG_ADDRESS, symbol: "USDG", confirmation: "BRIDGE USDC TO ROBINHOOD" },
};

export const CONTROLLED_BRIDGE_ACCEPTANCE_CONFIRMATION = "RUN CONTROLLED BRIDGE ACCEPTANCE" as const;

export function isControlledBridgeAcceptance(proposal: BridgeProposal): boolean {
  return (proposal.quote.provider === "relay" || proposal.quote.provider === "debridge-dln")
    && BigInt(proposal.contract.amountIn) <= 10_000_000n
    && proposal.contract.maximumTotalFeeUsd <= 10.0
    && proposal.quote.fee.totalFeeUsd <= 10.0
    && BigInt(proposal.contract.minimumDestinationAmount) > 0n;
}

export type EvmBridgeChainKey = "robinhood";

export const EVM_BRIDGE_ASSETS: Record<EvmBridgeChainKey, {
  label: string;
  chainId: number;
  address: `0x${string}`;
  symbol: "USDC" | "USDG";
}> = {
  robinhood: { label: "Robinhood Chain", chainId: BRIDGE_ROBINHOOD_CHAIN_ID, address: BRIDGE_ROBINHOOD_USDG_ADDRESS, symbol: "USDG" },
};

export const EVM_PORTFOLIO_CHAINS: ReadonlyArray<{
  key: EvmChainKey;
  label: string;
  tokens: ReadonlyArray<{ address: `0x${string}`; symbol: string; decimals: number }>;
}> = [
  {
    key: "robinhood",
    label: "Robinhood",
    tokens: [
      { address: BRIDGE_ROBINHOOD_USDG_ADDRESS, symbol: "USDG", decimals: 6 },
      { address: "0x0bd7d308f8e1639fab988df18a8011f41eacad73", symbol: "WETH", decimals: 18 },
    ],
  },
];

export function bridgeDestination(chainId: BridgeProposal["contract"]["destinationChainId"]) {
  return Object.values(BRIDGE_DESTINATIONS).find((candidate) => candidate?.chainId === chainId) ?? BRIDGE_DESTINATIONS.robinhood!;
}

export type SetupState = {
  step: number;
  complete: boolean;
  passwordConfigured: boolean;
  walletSkipped: boolean;
  jupiterConfigured: boolean;
  tavilyConfigured: boolean;
  tuningConfigured: boolean;
  providerConfigured: boolean;
  providerModel: string;
  contextLimit: number;
  outputLimit: number;
  temperature: string;
  subagentMaxConcurrent: number;
  subagentContextLimit: number;
  subagentOutputLimit: string;
  subagentTemperature: string;
  subagentMaxIterations: number;
  subagentTimeoutMs: number;
  maxToolCallsPerTurn: number;
  missionMaxSteps: number;
  retryLimit: number;
  maxNetworkFeeLamports: number;
  maxFeePercent: number;
  defaultSlippageBps: number;
  maxSlippageBps: number;
  defaultDeadlineMinutes: number;
  transactionPriority: TransactionSettings["priority"];
};

export type SessionMode = SessionRecord["mode"];
export type Permission = SessionRecord["permission"];
export type SessionWorkspace = NonNullable<SessionRecord["workspace"]>;
export type PumpSessionConfig = NonNullable<SessionRecord["pumpConfig"]>;
export type SessionWalletScope = NonNullable<SessionRecord["walletScope"]>;
export type SessionFilter = "all" | SessionMode | "pump";
export type WalletSummary = { address: string; primary: boolean };
export type ChatMessage = SessionRecord["messages"][number];
export type SessionItem = SessionRecord;

export const STORAGE_KEY = "silfable.mainnet-setup.v2";
export const SOLANA_ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/u;

export const DEFAULT_SETUP: SetupState = {
  step: 0,
  complete: false,
  passwordConfigured: false,
  walletSkipped: false,
  jupiterConfigured: false,
  tavilyConfigured: false,
  tuningConfigured: false,
  providerConfigured: false,
  providerModel: "",
  contextLimit: 128_000,
  outputLimit: 8_192,
  temperature: "",
  subagentMaxConcurrent: 5,
  subagentContextLimit: 16_384,
  subagentOutputLimit: "",
  subagentTemperature: "",
  subagentMaxIterations: 25,
  subagentTimeoutMs: 300_000,
  maxToolCallsPerTurn: 12,
  missionMaxSteps: 24,
  retryLimit: 2,
  maxNetworkFeeLamports: 200_000,
  maxFeePercent: 5,
  defaultSlippageBps: 50,
  maxSlippageBps: 300,
  defaultDeadlineMinutes: 30,
  transactionPriority: "standard",
};

export const SETUP_STEPS = [
  "Security",
  "Wallets",
  "Integrations",
  "Agent core",
  "Provider",
  "Review",
];

export function sessionIntentLabel(session: SessionRecord): string {
  if (session.workspace === "pump") return "Legacy Pump pilot";
  if (session.walletScope === "solana") return "Solana workspace";
  if (session.walletScope === "evm") return "EVM workspace";
  switch (session.intent) {
    case "token-launch": return "Token launch";
    case "solana-swap": return "Solana swap";
    case "evm-swap": return "EVM swap";
    case "bridge": return "Bridge";
    case "research": return "Research";
    default: return session.mode === "mission" ? "Mission" : "Agent";
  }
}

export function readSetup(): SetupState {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? "null",
    ) as Partial<SetupState> | null;
    return parsed ? { ...DEFAULT_SETUP, ...parsed } : DEFAULT_SETUP;
  } catch {
    return DEFAULT_SETUP;
  }
}
