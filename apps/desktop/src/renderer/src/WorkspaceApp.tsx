// @ts-nocheck
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowUp,
  Bot,
  Brain,
  CirclePlus,
  Settings,
  ShieldCheck,
  Target,
} from "lucide-react";
import logoUrl from "../../assets/logo.png";
import { Button, Modal } from "./components/ui";
import { AutomationPanel } from "./components/ui/AutomationPanel";
import {
  BootstrapScreen,
  UnlockScreen,
  SecurityStep,
  LeftSidebar,
  TopHeader,
  HomeComposer,
  UnifiedPortfolioRail,
  SetupCard,
  SetupActions,
  Field,
  ProviderCard,
  Notice,
  StatusPill,
  Brand,
  BrandMark,
  CornerFooter,
  RailSection,
  ChangePasswordStep,
  SetupFlow,
  PumpTradePreviewCard,
  PumpExecutionCard,
  EvmBridgeWorkspace,
  BridgeProposalCard,
  Conversation,
  SimulationApprovalModal,
  EvmBridgeExecutionApprovalModal,
  ExecutionApprovalModal,
  PumpExecutionApprovalModal,
  SessionModal,
  RightRail,
  PortfolioAssetRow,
  MissionsView,
  UtilityView,
  Composer,
  EmergencyStopPanel,
  EvmSwapProposalCard,
  LimitOrderPreviewCard,
  PumpSimulationCard,
  PumpLaunchDraftCard,
  MissionPreviewCard,
  SimulationResult,
  ExecutionResult,
  PumpLaunchDraftForm,
  LimitOrderSimulationApprovalModal,
  LimitOrderCancelSimulationModal,
  LimitOrderFinalModal,
  EvmExecutionApprovalModal,
  BridgeExecutionApprovalModal
} from "./components";
import {
  formatEvmTokenAmount,
  formatWeiToGweiOrEth,
  formatRuntimeTokens,
  formatPortfolioUsd,
  portfolioAssetUsd,
  formatPortfolioAmount,
  formatPumpMetric,
  formatPumpPercent,
  formatPumpBps,
  formatPumpRawAmount
} from "./lib/formatters";
import { cleanErrorMessage } from "./lib/utils";

import type {
  BridgePreflightEvidence,
  BridgeProposal,
  BridgeReceipt,
  BridgeDestinationChain,
  EmergencyStopStatus,
  EvmBridgeContract,
  EvmBridgePreflight,
  EvmBridgeQuote,
  EvmBridgeReceipt,
  EvmChainKey,
  EvmPortfolioSnapshot,
  EvmSessionExecutionReceipt,
  EvmSwapPreflightEvidence,
  EvmSwapProposal,
  LimitOrderCancelSimulation,
  LimitOrderContractPreview,
  LimitOrderExecutionReceipt,
  LimitOrderSimulationPreview,
  LegacyPumpLaunchMetadataPackage,
  MissionContractPreview,
  MissionExecutionReceipt,
  MissionSimulationPreview,
  OpenRouterModelView,
  PortfolioSnapshot,
  PumpExecutionRecord,
  PumpFinalRevalidation,
  PumpLaunchDraft,
  PumpLaunchDraftInput,
  PumpLaunchMetadata,
  PumpLaunchPreflight,
  PumpLaunchFinalRevalidation,
  PumpLaunchExecutionRecord,
  PumpRiskSettings,
  PumpSimulationArtifact,
  PumpTokenIntelligence,
  PumpTradeContractPreview,
  RuntimeStatus,
  SessionRecord,
  TransactionSettings,
  WalletActivitySnapshot,
} from "@silfable/contracts";
import {
  BRIDGE_ROBINHOOD_CHAIN_ID,
  BRIDGE_ROBINHOOD_USDG_ADDRESS,
  BRIDGE_SOLANA_CHAIN_ID,
  BRIDGE_SOLANA_USDC_MINT,
} from "@silfable/contracts";

const BRIDGE_DESTINATIONS: Partial<Record<BridgeDestinationChain, {
  label: string;
  chainId: BridgeProposal["contract"]["destinationChainId"];
  assetAddress: string;
  symbol: "USDC" | "USDG";
  confirmation: "BRIDGE USDC TO ROBINHOOD";
}>> = {
  robinhood: { label: "Robinhood", chainId: BRIDGE_ROBINHOOD_CHAIN_ID, assetAddress: BRIDGE_ROBINHOOD_USDG_ADDRESS, symbol: "USDG", confirmation: "BRIDGE USDC TO ROBINHOOD" },
};

const CONTROLLED_BRIDGE_ACCEPTANCE_CONFIRMATION = "RUN CONTROLLED BRIDGE ACCEPTANCE" as const;

function isControlledBridgeAcceptance(proposal: BridgeProposal): boolean {
  return (proposal.quote.provider === "relay" || proposal.quote.provider === "debridge-dln")
    && BigInt(proposal.contract.amountIn) <= 10_000_000n
    && proposal.contract.maximumTotalFeeUsd <= 10.0
    && proposal.quote.fee.totalFeeUsd <= 10.0
    && BigInt(proposal.contract.minimumDestinationAmount) > 0n;
}

type EvmBridgeChainKey = "robinhood";

const EVM_BRIDGE_ASSETS: Record<EvmBridgeChainKey, {
  label: string;
  chainId: number;
  address: `0x${string}`;
  symbol: "USDC" | "USDG";
}> = {
  robinhood: { label: "Robinhood Chain", chainId: BRIDGE_ROBINHOOD_CHAIN_ID, address: BRIDGE_ROBINHOOD_USDG_ADDRESS, symbol: "USDG" },
};

const EVM_PORTFOLIO_CHAINS: ReadonlyArray<{
  key: EvmChainKey;
  label: string;
  token?: { address: `0x${string}`; symbol: "USDC" | "USDG"; decimals: 6 };
}> = [
  { key: "robinhood", label: "Robinhood", token: { address: BRIDGE_ROBINHOOD_USDG_ADDRESS, symbol: "USDG", decimals: 6 } },
];

function bridgeDestination(chainId: BridgeProposal["contract"]["destinationChainId"]) {
  return Object.values(BRIDGE_DESTINATIONS).find((candidate) => candidate?.chainId === chainId) ?? BRIDGE_DESTINATIONS.robinhood!;
}

type SetupState = {
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

type SessionMode = SessionRecord["mode"];
type Permission = SessionRecord["permission"];
type SessionWorkspace = NonNullable<SessionRecord["workspace"]>;
type PumpSessionConfig = NonNullable<SessionRecord["pumpConfig"]>;
type SessionWalletScope = NonNullable<SessionRecord["walletScope"]>;
type SessionFilter = "all" | SessionMode | "pump";
type WalletSummary = { address: string; primary: boolean };
type ChatMessage = SessionRecord["messages"][number];
type SessionItem = SessionRecord;

const STORAGE_KEY = "silfable.mainnet-setup.v2";
const SOLANA_ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/u;
const DEFAULT_SETUP: SetupState = {
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

const SETUP_STEPS = [
  "Security",
  "Wallets",
  "Integrations",
  "Agent core",
  "Provider",
  "Review",
];

function sessionIntentLabel(session: SessionRecord): string {
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

export function WorkspaceApp() {
  const [setup, setSetup] = useState<SetupState>(() => readSetup());
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [bootReady, setBootReady] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [bootPassed, setBootPassed] = useState(false);

  useEffect(() => {
    window.silfable
      .getRuntimeStatus()
      .then((value) => {
        setRuntime(value);
        setBootReady(true);
      })
      .catch(() =>
        setBootError("The local runtime did not return a trusted status."),
      );
  }, []);


  function saveSetup(next: SetupState): void {
    setSetup(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  if (!bootPassed) {
    return (
      <BootstrapScreen
        runtime={runtime}
        ready={bootReady}
        error={bootError}
        onContinue={() => {
          if (!setup.complete && setup.step === 0)
            saveSetup({ ...setup, step: 1 });
          setBootPassed(true);
        }}
      />
    );
  }
 if (
    runtime?.masterPassword === "configured" &&
    runtime.keystore === "locked"
  ) {
    return (
      <UnlockScreen
        onUnlocked={async () => {
          setRuntime({ ...runtime, keystore: "unlocked" });
          if (!setup.passwordConfigured)
            saveSetup({
              ...setup,
              passwordConfigured: true,
              step: Math.max(2, setup.step),
            });
        }}
      />
    );
  }
   if (setup.complete && runtime?.masterPassword === "missing") {
    return (
      <main className="setupPage">
        <Brand compact />
        <div className="migrationSecurity">
          <SecurityStep
            runtime={runtime}
            onConfigured={(nextRuntime) => {
              setRuntime(nextRuntime);
              saveSetup({ ...setup, passwordConfigured: true });
            }}
            migration
          />
        </div>
        <CornerFooter />
      </main>
    );
  }
  if (!setup.complete) {
    return (
      <SetupFlow
        setup={setup}
        runtime={runtime}
        save={saveSetup}
        setRuntime={setRuntime}
      />
    );
  }
  return (
    <MainWorkspace
      setup={setup}
      runtime={runtime}
      saveSetup={saveSetup}
      setRuntime={setRuntime}
    />
  );
}









type TuningValues = Pick<
  SetupState,
  | "contextLimit"
  | "outputLimit"
  | "temperature"
  | "subagentMaxConcurrent"
  | "subagentContextLimit"
  | "subagentOutputLimit"
  | "subagentTemperature"
  | "subagentMaxIterations"
  | "subagentTimeoutMs"
  | "maxToolCallsPerTurn"
  | "missionMaxSteps"
  | "retryLimit"
  | "maxNetworkFeeLamports"
  | "maxFeePercent"
  | "defaultSlippageBps"
  | "maxSlippageBps"
  | "defaultDeadlineMinutes"
  | "transactionPriority"
>;




function MainWorkspace({
  setup,
  runtime,
  saveSetup,
  setRuntime,
}: {
  setup: SetupState;
  runtime: RuntimeStatus | null;
  saveSetup: (next: SetupState) => void;
  setRuntime: (runtime: RuntimeStatus) => void;
}) {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [sessionsState, setSessionsState] = useState<"loading" | "ready" | "error">("loading");
  const [sessionToDelete, setSessionToDelete] = useState<SessionItem | null>(null);
  const [deletingSession, setDeletingSession] = useState(false);
  const [wallets, setWallets] = useState<WalletSummary[]>([]);

  const [evmWallets, setEvmWallets] = useState<WalletSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sessionFilter, setSessionFilter] = useState<SessionFilter>("all");
  const [thinkingIds, setThinkingIds] = useState<string[]>([]);
  const [animatedMessageIds, setAnimatedMessageIds] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState("");
  const [nav, setNav] = useState<"sessions" | "missions" | "automation">(
    "sessions",
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Enrollment surface is retained for the upcoming session-lifecycle handoff;
  // it is no longer exposed as a separate navigation item.
  const [fullAccessEnrollmentOpen, setFullAccessEnrollmentOpen] = useState(false);
  const [fullAccessPassword, setFullAccessPassword] = useState("");
  const [fullAccessConfirmation, setFullAccessConfirmation] = useState("");
  const [fullAccessBusy, setFullAccessBusy] = useState(false);
  const [fullAccessError, setFullAccessError] = useState<string | null>(null);
  const [simulationApproval, setSimulationApproval] = useState<{
    sessionId: string;
    messageId: string;
    preview: MissionContractPreview;
  } | null>(null);
  const [simulatingMissionIds, setSimulatingMissionIds] = useState<string[]>(
    [],
  );
  const [simulatingPumpIds, setSimulatingPumpIds] = useState<string[]>([]);
  const [revalidatingPumpIds, setRevalidatingPumpIds] = useState<string[]>([]);
 const [pumpExecutionApproval, setPumpExecutionApproval] = useState<{
    sessionId: string;
    messageId: string;
    preview: PumpTradeContractPreview;
    simulation: PumpSimulationArtifact;
    revalidation: PumpFinalRevalidation;
  } | null>(null);
  const [executingPumpIds, setExecutingPumpIds] = useState<string[]>([]);
  const [verifyingPumpExecutionIds, setVerifyingPumpExecutionIds] = useState<string[]>([]);
  const [executionApproval, setExecutionApproval] = useState<{
    sessionId: string;
    messageId: string;
    preview: MissionContractPreview;
    simulation: MissionSimulationPreview;
  } | null>(null);
  const [evmExecutionApproval, setEvmExecutionApproval] = useState<{
    sessionId: string;
    messageId: string;
    proposal: EvmSwapProposal;
    preflight: EvmSwapPreflightEvidence;
    action: "approval" | "swap";
  } | null>(null);
  const [preparingEvmIds, setPreparingEvmIds] = useState<string[]>([]);
  const [executingEvmIds, setExecutingEvmIds] = useState<string[]>([]);
  const [dispatchingEvmBridgeIds, setDispatchingEvmBridgeIds] = useState<string[]>([]);
  const fullAccessEvmInFlightRef = useRef(new Set<string>());
  const [evmExecutionEnabled, setEvmExecutionEnabled] = useState(false);
  const [evmExecutionMissing, setEvmExecutionMissing] = useState<string[]>([]);
  const [executingMissionIds, setExecutingMissionIds] = useState<string[]>([]);
  const [verifyingReceiptIds, setVerifyingReceiptIds] = useState<string[]>([]);
  const [limitSimulationApproval, setLimitSimulationApproval] = useState<{
    sessionId: string;
    messageId: string;
    preview: LimitOrderContractPreview;
  } | null>(null);
  const [simulatingLimitIds, setSimulatingLimitIds] = useState<string[]>([]);
  const [limitExecutionApproval, setLimitExecutionApproval] = useState<{
    sessionId: string;
    messageId: string;
    preview: LimitOrderContractPreview;
    simulation: LimitOrderSimulationPreview;
  } | null>(null);
  const [executingLimitIds, setExecutingLimitIds] = useState<string[]>([]);
  const [verifyingLimitExecutionIds, setVerifyingLimitExecutionIds] = useState<
    string[]
  >([]);
  const [verifyingLimitCancelIds, setVerifyingLimitCancelIds] = useState<
    string[]
  >([]);
  const [limitCancelApproval, setLimitCancelApproval] = useState<{
    sessionId: string;
    messageId: string;
    walletAddress: string;
    orderId: string;
  } | null>(null);
  const [limitCancelExecutionApproval, setLimitCancelExecutionApproval] =
    useState<{
      sessionId: string;
      messageId: string;
      walletAddress: string;
      orderId: string;
      simulation: LimitOrderCancelSimulation;
    } | null>(null);
  const [cancellingLimitIds, setCancellingLimitIds] = useState<string[]>([]);
  const [portfolioRefresh, setPortfolioRefresh] = useState(0);
 const [preparingBridgeIds, setPreparingBridgeIds] = useState<string[]>([]);
  const [reconcilingBridgeIds, setReconcilingBridgeIds] = useState<string[]>([]);
  const [bridgeExecutionApproval, setBridgeExecutionApproval] = useState<{
    sessionId: string;
    proposal: BridgeProposal;
    preflight: BridgePreflightEvidence;
  } | null>(null);
  const [walletRefresh, setWalletRefresh] = useState(0);
  const active = sessions.find((session) => session.id === activeId) ?? null;
  const filteredSessions = sessions.filter((session) =>
    sessionFilter === "all"
      ? true
      : sessionFilter === "pump"
        ? session.workspace === "pump"
        : session.mode === sessionFilter && session.workspace !== "pump",
  );
  const missionPreviews = sessions.flatMap((session) =>
    session.messages.flatMap((message) =>
      message.missionPreview
        ? [
            {
              sessionId: session.id,
              sessionTitle: session.title,
              preview: message.missionPreview,
            },
          ]
        : [],
    ),
  );
  const activeSolanaMissions = active?.walletScope === "solana"
    ? active.messages.flatMap((message) => message.missionPreview?.status === "ready-for-review"
      ? [{ messageId: message.id, preview: message.missionPreview }]
      : [])
    : [];
   useEffect(() => {
    if (runtime?.keystore !== "unlocked") {
      return;
    }
    let activeRequest = true;
    window.silfable
      .listWallets()
      .then((response) => {
        if (activeRequest) setWallets(response.wallets);
      })
      .catch(() => undefined);
    window.silfable
      .getEvmWallets()
      .then((response: any) => {
        if (activeRequest) setEvmWallets(response.wallets);
      })
      .catch(() => undefined);
    window.silfable
      .getEvmSettings()
      .then((response: any) => {
        if (activeRequest) {
          setEvmExecutionEnabled(response.executionEnabled);
          setEvmExecutionMissing(response.executionMissing);
        }
      })
      .catch(() => undefined);


    window.silfable
      .listSessions()
      .then((response) => {
        if (activeRequest) {
          setSessions(response.sessions);
          setSessionsState("ready");
        }
      })
      .catch(() => {
        if (activeRequest) setSessionsState("error");
      });
    return () => {
      activeRequest = false;
    };
  }, [runtime?.keystore, runtime?.wallet, walletRefresh]);
  function persistSession(session: SessionItem): Promise<unknown> {
    return window.silfable.upsertSession({
      schemaVersion: 1,
      requestId: crypto.randomUUID(),
      session,
    });
  }
  async function refreshEncryptedSessions(preferredId?: string): Promise<void> {
    setSessionsState("loading");
    try {
      const response = await window.silfable.listSessions();
      setSessions(response.sessions);
      setSessionsState("ready");
      if (preferredId && response.sessions.some((session) => session.id === preferredId)) {
        setActiveId(preferredId);
      }
    } catch (error) {
      setSessionsState("error");
      throw error;
    }
  }
  async function prepareBridge(
    target: SessionItem,
    input: { destinationChain: BridgeDestinationChain; destinationRecipient: string; amountIn: string; minimumDestinationAmount: string; maximumTotalFeeUsd: number },
  ): Promise<void> {
    if (target.walletScope !== "solana" || target.walletAddress === null) {
      throw new Error("A Solana wallet-scoped session is required.");
    }
    if (input.destinationChain !== "robinhood") {
      throw new Error("Desktop bridges currently support Robinhood Chain only.");
    }
    const contractId = crypto.randomUUID();
    setPreparingBridgeIds((current) => [...current, contractId]);
    try {
      const createdAt = new Date();
      const destination = BRIDGE_DESTINATIONS.robinhood;
      await window.silfable.prepareBridge({
        schemaVersion: 1,
        requestId: crypto.randomUUID(),
        sessionId: target.id,
        acknowledgedQuoteOnly: true,
        contract: {
          id: contractId,
          provider: "auto",
          sourceChainId: BRIDGE_SOLANA_CHAIN_ID,
          destinationChainId: destination.chainId,
          sourceAsset: { address: BRIDGE_SOLANA_USDC_MINT, symbol: "USDC", decimals: 6 },
          destinationAsset: { address: destination.assetAddress, symbol: destination.symbol, decimals: 6 },
          sourceWallet: target.walletAddress,
          destinationRecipient: input.destinationRecipient,
          amountIn: input.amountIn,
          minimumDestinationAmount: input.minimumDestinationAmount,
          maximumTotalFeeUsd: input.maximumTotalFeeUsd,
          deadline: new Date(createdAt.getTime() + 30 * 60_000).toISOString(),
          timeoutSeconds: 3_600,
          refundPolicy: "provider-cancel-only",
          createdAt: createdAt.toISOString(),
        },
      });
      await refreshEncryptedSessions(target.id);
    } finally {
      setPreparingBridgeIds((current) => current.filter((id) => id !== contractId));
    }
  }
  async function executeBridge(
    input: NonNullable<typeof bridgeExecutionApproval>,
    masterPassword: string,
  ): Promise<void> {
    await window.silfable.executeBridge({
      schemaVersion: 1,
      requestId: crypto.randomUUID(),
      sessionId: input.sessionId,
      contractId: input.proposal.contract.id,
      preflightId: input.preflight.id,
      masterPassword,
      confirmation: isControlledBridgeAcceptance(input.proposal)
        ? CONTROLLED_BRIDGE_ACCEPTANCE_CONFIRMATION
        : bridgeDestination(input.proposal.contract.destinationChainId).confirmation,
      acknowledgedOneAttemptBroadcast: true,
    });
    setBridgeExecutionApproval(null);
    await refreshEncryptedSessions(input.sessionId);
    setPortfolioRefresh((current) => current + 1);
  }
  async function executeFullAccessBridge(
    sessionId: string,
    proposal: BridgeProposal,
    preflight: BridgePreflightEvidence,
  ): Promise<void> {
    await window.silfable.executeBridge({
      schemaVersion: 1,
      requestId: crypto.randomUUID(),
      sessionId,
      contractId: proposal.contract.id,
      preflightId: preflight.id,
      // The main process ignores this value for a Full Access session and
      // requires its in-memory local signing session instead.
      masterPassword: "full-access-local-session",
      confirmation: isControlledBridgeAcceptance(proposal)
        ? CONTROLLED_BRIDGE_ACCEPTANCE_CONFIRMATION
        : bridgeDestination(proposal.contract.destinationChainId).confirmation,
      acknowledgedOneAttemptBroadcast: true,
    });
    await refreshEncryptedSessions(sessionId);
    setPortfolioRefresh((current) => current + 1);
  }
  async function reconcileBridge(target: SessionItem, receipt: BridgeReceipt): Promise<void> {
    setReconcilingBridgeIds((current) => [...new Set([...current, receipt.id])]);
    try {
      await window.silfable.reconcileBridge({
        schemaVersion: 1,
        requestId: crypto.randomUUID(),
        sessionId: target.id,
        receiptId: receipt.id,
      });
      await refreshEncryptedSessions(target.id);
      setPortfolioRefresh((current) => current + 1);
    } finally {
      setReconcilingBridgeIds((current) => current.filter((id) => id !== receipt.id));
    }
  }

  const activeSessionRef = useRef(active);
  useEffect(() => {
    activeSessionRef.current = active;
  }, [active]);
  
  const reconcileBridgeRef = useRef(reconcileBridge);
  useEffect(() => {
    reconcileBridgeRef.current = reconcileBridge;
  }, [reconcileBridge]);

  const reconcilingBridgeIdsRef = useRef(reconcilingBridgeIds);
  useEffect(() => {
    reconcilingBridgeIdsRef.current = reconcilingBridgeIds;
  }, [reconcilingBridgeIds]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const currentActive = activeSessionRef.current;
      if (!currentActive) return;

      const pendingReceipts = currentActive.history
        .map((item) => item.payload)
        .filter((p): p is BridgeReceipt => p.type === "bridge-receipt")
         .filter((receipt) =>
          [
            "source-submitted",
            "broadcast-unknown",
            "relay-pending",
            "refund-pending",
            "relay-fulfilled-unverified",
          ].includes(receipt.state),
        );

      for (const receipt of pendingReceipts) {
        if (!reconcilingBridgeIdsRef.current.includes(receipt.id)) {
          void reconcileBridgeRef.current(currentActive, receipt);
        }
      }
    }, 5000);
    return () => window.clearInterval(interval);
  }, []);
   async function confirmDeleteSession(): Promise<void> {
    if (!sessionToDelete) return;
    setDeletingSession(true);
    try {
      await window.silfable.deleteSession(sessionToDelete.id);
      setSessions((prev) => prev.filter((s) => s.id !== sessionToDelete.id));
      if (activeId === sessionToDelete.id) {
        setActiveId(null);
      }
      setSessionToDelete(null);
    } catch (error) {
      console.error("Failed to delete session:", error);
    } finally {
      setDeletingSession(false);
    }
  }
  function chooseFilter(filter: SessionFilter): void {
    setSessionFilter(filter);
    if (active && filter !== "all") {
      const visible = active.mode === filter && active.workspace !== "pump";
      if (!visible) setActiveId(null);
    }
    setNav("sessions");
  }

  async function requestSession(prompt = ""): Promise<void> {
    setPendingPrompt(prompt);
    setModalOpen(true);
    try {
      const latestRuntime = await window.silfable.getRuntimeStatus();
      setRuntime(latestRuntime);
      if (latestRuntime.keystore !== "unlocked") {
        setModalOpen(false);
        return;
      }
      const [solanaResponse, evmResponse] = await Promise.all([
        window.silfable.listWallets(),
        window.silfable.getRobinhoodWallet().catch(() => null),
      ]);
      setWallets(solanaResponse.wallets);
      if (evmResponse) setEvmWallets(evmResponse.wallets);
    } catch {
      // Keep the last trusted wallet list. A concurrent vault lock is handled
      // by the root runtime gate instead of flashing an empty workspace.
    }
  }
  async function createSession(input: {
    title: string;
    mode: SessionMode;
    permission: Permission;
    workspace: SessionWorkspace;
    walletScope?: SessionWalletScope;
    walletAddress: string | null;
    prompt: string;
  }): Promise<void> {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const session: SessionItem = {
      id,
      title: input.title,
      mode: input.mode,
      permission: input.permission,
      workspace: input.workspace,
      ...(input.walletScope ? { walletScope: input.walletScope } : {}),
      ...(input.walletScope === "evm" ? { evmChainKey: "robinhood" as const } : {}),
      walletAddress: input.walletAddress,
      startedAt: now,
      usage: { input: 0, output: 0, total: 0, cost: null },
      messages: [],
    };
    setSessions((current) => [session, ...current]);
    setActiveId(id);
    setModalOpen(false);
    setNav("sessions");
    await persistSession(session);
    if (input.prompt.trim()) await sendMessage(session, input.prompt.trim());
  }
  async function sendMessage(
    target: SessionItem,
    text: string,
    options: { recordUserMessage?: boolean } = {},
  ): Promise<void> {
    if (!text.trim() || thinkingIds.includes(target.id)) return;
    const recordUserMessage = options.recordUserMessage !== false;
    const userMessage: ChatMessage | null = recordUserMessage
      ? {
          id: crypto.randomUUID(),
          role: "user",
          text,
          at: new Date().toISOString(),
        }
      : null;
    const sessionWithUser = {
      ...target,
      messages: userMessage ? [...target.messages, userMessage] : target.messages,
    };
    setSessions((current) =>
      current.map((item) => {
        if (item.id !== target.id) return item;
        return sessionWithUser;
      }),
    );
    setThinkingIds((current) => [...new Set([...current, target.id])]);
    setDraft("");
    try {
      await persistSession(sessionWithUser);
      const response = await window.silfable.chatWithAi({
        schemaVersion: 1,
        requestId: crypto.randomUUID(),
        sessionId: target.id,
        prompt: text,
        mode: target.mode,
        permission: target.permission,
        walletAddress: target.walletAddress,
        acknowledgedExternalProcessing: true,
      });
      const assistant: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        text: response.text,
        at: new Date().toISOString(),
        toolsUsed: response.toolsUsed,
        ...(response.missionPreview
          ? { missionPreview: response.missionPreview }
          : {}),
        ...(response.pumpTradePreview
          ? { pumpTradePreview: response.pumpTradePreview }
          : {}),
        ...(response.pumpTokenIntelligence
          ? { pumpTokenIntelligence: response.pumpTokenIntelligence }
          : {}),
        ...(response.pumpDiscoverySnapshot
          ? { pumpDiscoverySnapshot: response.pumpDiscoverySnapshot }
          : {}),
        ...(response.limitOrderPreview
          ? { limitOrderPreview: response.limitOrderPreview }
          : {}),
        ...(response.evmSwapProposal
          ? { evmSwapProposal: response.evmSwapProposal }
          : {}),
        ...((response as any).evmBridgePreparation
          ? { evmBridgePreparation: (response as any).evmBridgePreparation }
          : {}),
        ...((response as any).evmAssetAuthorizationReview
          ? { evmAssetAuthorizationReview: (response as any).evmAssetAuthorizationReview }
          : {}),
        ...(response.bridgeProposal && response.bridgePreflight
          ? {
              bridgeProposal: response.bridgeProposal,
              bridgePreflight: response.bridgePreflight,
            }
          : {}),
      };
      setAnimatedMessageIds((current) => [...current, assistant.id]);
      const sessionWithAssistant = {
        ...sessionWithUser,
        messages: [...sessionWithUser.messages, assistant],
        usage: {
          input: response.usage.inputTokens,
          output: response.usage.outputTokens,
          total: response.usage.totalTokens,
          cost: response.usage.costUsd,
        },
      };
      await persistSession(sessionWithAssistant);
      setSessions((current) =>
        current.map((item) => {
          if (item.id !== target.id) return item;
          return sessionWithAssistant;
        }),
      );
      if (target.permission === "full" && response.missionPreview) {
        await runSimulation({ sessionId: target.id, messageId: assistant.id, preview: response.missionPreview, sessionSnapshot: sessionWithAssistant });
      }
      if (
        target.permission === "full"
        && target.walletScope === "evm"
        && target.evmChainKey === "robinhood"
        && response.evmSwapProposal
      ) {
        void runFullAccessEvmSwap({
          sessionId: target.id,
          messageId: assistant.id,
          proposal: response.evmSwapProposal,
        });
      }
      if (
        target.permission === "full"
        && target.walletScope === "evm"
        && target.evmChainKey === "robinhood"
        && (response as any).evmBridgePreparation
      ) {
        void dispatchFullAccessEvmBridge({
          sessionId: target.id,
          messageId: assistant.id,
          preparation: (response as any).evmBridgePreparation,
        });
      }
    } catch (error) {
      const assistant: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        text: inferenceFailureMessage(error),
        at: new Date().toISOString(),
      };
      setAnimatedMessageIds((current) => [...current, assistant.id]);
      setSessions((current) =>
        current.map((item) => {
          if (item.id !== target.id) return item;
          const next = { ...item, messages: [...item.messages, assistant] };
          persistSession(next);
          return next;
        }),
      );
    } finally {
      setThinkingIds((current) => current.filter((id) => id !== target.id));
    }
  }
  async function prepareEvmSwap(input: {
    sessionId: string;
    messageId: string;
    proposal: EvmSwapProposal;
  }): Promise<EvmSwapPreflightEvidence | null> {
    setPreparingEvmIds((current) => [...new Set([...current, input.proposal.id])]);
    try {
      const chainKey = input.proposal.chainKey;
      if (!chainKey) throw new Error("This EVM quote has no locked chain scope.");
      const result = await window.silfable.prepareEvmKyberSwap({
        schemaVersion: 1,
        requestId: crypto.randomUUID(),
        sessionId: input.sessionId,
        chainKey,
        quoteId: input.proposal.quoteId,
        walletAddress: input.proposal.walletAddress,
        slippageBps: input.proposal.slippageBps,
        acknowledgedSimulationOnly: true,
      });
      const preflight: EvmSwapPreflightEvidence = {
        ...result.preflight,
        maxGasCostWei: result.preflight.maximumNetworkFeeWei,
        expectedBuyAmount: result.preflight.expectedAmountOut,
        minimumBuyAmount: result.preflight.minimumAmountOut,
      };
      setSessions((current) =>
        current.map((session) => {
          if (session.id !== input.sessionId) return session;
          const next = {
            ...session,
            messages: session.messages.map((message) =>
              message.id === input.messageId
                ? { ...message, evmSwapPreflight: preflight }
                : message,
            ),
          };
          void persistSession(next);
          return next;
        }),
      );
      return preflight;
    } catch (cause) {
      const errMsg = cause instanceof Error ? cause.message : "The EVM trade review could not be prepared safely. Verify the saved RPC, 0x key, official token contracts, liquidity, allowance, and gas policy.";
      setSessions((current) =>
        current.map((session) => {
          if (session.id !== input.sessionId) return session;
          const next = {
            ...session,
            messages: session.messages.map((message) => {
              if (message.id !== input.messageId) return message;
              if (message.text.includes(errMsg)) return message;
              return {
                ...message,
                text: `${message.text.slice(0, 11_400)}\n\n${errMsg}`.slice(0, 12_000),
              };
            }),
          };
          void persistSession(next);
          return next;
        }),
      );
      return null;
    } finally {
      setPreparingEvmIds((current) => current.filter((id) => id !== input.proposal.id));
    }
  }

  async function authorizeFullAccessEvmAsset(target: SessionItem, reviewId: string): Promise<void> {
    await sendMessage(
      target,
      `AUTHORIZE FULL ACCESS ASSET ${reviewId}`,
      { recordUserMessage: false },
    );
  }
  async function executeEvmAction(
    approval: NonNullable<typeof evmExecutionApproval>,
    credentials: { masterPassword: string; confirmation: string },
  ): Promise<void> {
    const expectedConfirmation = approval.action === "approval"
      ? "APPROVE EVM MAINNET"
      : "EXECUTE EVM MAINNET SWAP";
    if (credentials.confirmation.trim().toUpperCase() !== expectedConfirmation) return;
    setEvmExecutionApproval(null);
    setExecutingEvmIds((current) => [...new Set([...current, approval.proposal.id])]);
    try {
      const base = {
        schemaVersion: 1 as const,
        requestId: crypto.randomUUID(),
        sessionId: approval.sessionId,
        chainKey: approval.proposal.chainKey,
        walletAddress: approval.proposal.walletAddress,
        preflightId: approval.preflight.id,
        action: approval.action,
        masterPassword: credentials.masterPassword,
        confirmation: expectedConfirmation as "APPROVE EVM MAINNET" | "EXECUTE EVM MAINNET SWAP",
        acknowledgedIrreversible: true as const,
      };
      const result = await window.silfable.executeEvmKyberSwap(base);
      setSessions((current) =>
        current.map((session) => {
          if (session.id !== approval.sessionId) return session;
          const next = {
            ...session,
            messages: session.messages.map((message) => {
              if (message.id !== approval.messageId) return message;
              const { evmSwapPreflight: _consumed, ...rest } = message;
              return {
                ...rest,
                evmExecutionReceipts: [
                  ...(message.evmExecutionReceipts ?? []),
                  result.receipt,
                ].slice(-4),
              };
            }),
          };
          void persistSession(next);
          return next;
        }),
      );
    } catch {
      setSessions((current) =>
        current.map((session) => {
          if (session.id !== approval.sessionId) return session;
          const next = {
            ...session,
            messages: session.messages.map((message) =>
              message.id === approval.messageId
                ? {
                    ...message,
                    text: `${message.text.slice(0, 11_400)}\n\nThe ${approval.action} was not submitted. No success is assumed. Verify the release gate, password, preflight expiry, emergency stop, and gas policy.`.slice(0, 12_000),
                  }
                : message,
            ),
          };
          void persistSession(next);
          return next;
        }),
      );
    } finally {
    setExecutingEvmIds((current) => current.filter((id) => id !== approval.proposal.id));
    }
  }
  async function executeFullAccessEvmAction(input: {
    sessionId: string;
    messageId: string;
    proposal: EvmSwapProposal;
    preflight: EvmSwapPreflightEvidence;
  }): Promise<EvmSessionExecutionReceipt | null> {
    setExecutingEvmIds((current) => [...new Set([...current, input.proposal.id])]);
    try {
      const result = await (window as any).silfable.executeFullAccessEvmKyberSwap({
        schemaVersion: 1,
        requestId: crypto.randomUUID(),
        sessionId: input.sessionId,
        chainKey: "robinhood",
        walletAddress: input.proposal.walletAddress,
        preflightId: input.preflight.id,
        action: input.preflight.allowanceRequired ? "approval" : "swap",
        acknowledgedLocalSession: true,
      });
      setSessions((current) => current.map((session) => {
        if (session.id !== input.sessionId) return session;
        const next = {
          ...session,
          messages: session.messages.map((message) => {
            if (message.id !== input.messageId) return message;
            const { evmSwapPreflight: _consumed, ...rest } = message;
            return { ...rest, evmExecutionReceipts: [...(message.evmExecutionReceipts ?? []), result.receipt].slice(-4) };
          }),
        };
        void persistSession(next);
        return next;
      }));
      return result.receipt as EvmSessionExecutionReceipt;
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : "Full Access Robinhood execution was blocked safely.";
      setSessions((current) => current.map((session) => {
        if (session.id !== input.sessionId) return session;
        const next = { ...session, messages: session.messages.map((message) => message.id === input.messageId
          ? { ...message, text: `${message.text.slice(0, 11_400)}\n\nFull Access Robinhood execution was blocked safely: ${detail}`.slice(0, 12_000) }
          : message) };
        void persistSession(next);
        return next;
      }));
      return null;
    } finally {
      setExecutingEvmIds((current) => current.filter((id) => id !== input.proposal.id));
    }
  }
  async function runFullAccessEvmSwap(input: {
    sessionId: string;
    messageId: string;
    proposal: EvmSwapProposal;
  }): Promise<void> {
    if (fullAccessEvmInFlightRef.current.has(input.proposal.id)) return;
    fullAccessEvmInFlightRef.current.add(input.proposal.id);
    try {
      const preflight = await prepareEvmSwap(input);
      if (!preflight) return;
      const initialReceipt = await executeFullAccessEvmAction({ ...input, preflight });
      if (initialReceipt?.status !== "confirmed" || !preflight.allowanceRequired) return;

      // ERC-20 approval and swap are distinct transactions. Build a fresh
      // preflight only after the exact approval is independently confirmed.
      const swapPreflight = await prepareEvmSwap(input);
      if (!swapPreflight || swapPreflight.allowanceRequired) return;
      await executeFullAccessEvmAction({ ...input, preflight: swapPreflight });
    } finally {
      fullAccessEvmInFlightRef.current.delete(input.proposal.id);
    }
  }
  async function dispatchFullAccessEvmBridge(input: {
    sessionId: string;
    messageId: string;
    preparation: { quote: EvmBridgeQuote; preflight: EvmBridgePreflight; contract?: EvmBridgeContract };
  }): Promise<void> {
    if (dispatchingEvmBridgeIds.includes(input.messageId)) return;
    const contract = input.preparation.contract;
    if (!contract || !input.preparation.preflight.id || !input.preparation.preflight.action) return;
    setDispatchingEvmBridgeIds((current) => [...new Set([...current, input.messageId])]);
    try {
      let preparation = input.preparation;
      const receipts: EvmBridgeReceipt[] = [];
      for (let step = 0; step < 2; step += 1) {
        const result = await window.silfable.executeEvmBridge({
          schemaVersion: 1,
          requestId: crypto.randomUUID(),
          sessionId: input.sessionId,
          preflightId: preparation.preflight.id!,
          action: preparation.preflight.action as "approval" | "deposit",
          masterPassword: "full-access-local-session",
          confirmation: "EXECUTE EVM BRIDGE",
          acknowledgedIrreversible: true,
        });
        receipts.push(result.receipt);
        // Relay separates an exact allowance from the bridge deposit. Never
        // reuse the consumed preflight after approval: fetch a fresh route and
        // simulate the deposit against the now-confirmed allowance.
        if (preparation.preflight.action !== "approval" || result.receipt.status !== "source-confirmed") break;
        const refreshed = await window.silfable.prepareEvmBridge({
          schemaVersion: 1,
          requestId: crypto.randomUUID(),
          sessionId: input.sessionId,
          contract,
          acknowledgedSimulationOnly: true,
        });
        preparation = { ...refreshed, contract };
      }
      setSessions((current) => current.map((session) => {
        if (session.id !== input.sessionId) return session;
        const next = {
          ...session,
          messages: session.messages.map((message) => message.id === input.messageId
            ? {
                ...message,
                evmBridgePreparation: preparation,
                evmBridgeReceipts: [...((message as any).evmBridgeReceipts ?? []), ...receipts].slice(-4),
                text: `${message.text}\n\n${receipts.at(-1)?.status === "source-confirmed" ? "Robinhood source transaction confirmed. Solana settlement is pending independent verification." : "Robinhood bridge source step was submitted; do not retry an unknown broadcast."}`.slice(0, 12_000),
              }
            : message),
        };
        void persistSession(next);
        return next;
      }));
    } catch (cause) {
      const detail = cleanErrorMessage(cause, "Robinhood Full Access bridge was blocked safely.");
      setSessions((current) => current.map((session) => {
        if (session.id !== input.sessionId) return session;
        const next = {
          ...session,
          messages: session.messages.map((message) => message.id === input.messageId
            ? { ...message, text: `${message.text}\n\nFull Access Robinhood bridge was blocked safely: ${detail}`.slice(0, 12_000) }
            : message),
        };
        void persistSession(next);
        return next;
      }));
    } finally {
      setDispatchingEvmBridgeIds((current) => current.filter((id) => id !== input.messageId));
    }
  }
  async function runSimulation(input: {
    sessionId: string;
    messageId: string;
    preview: MissionContractPreview;
    sessionSnapshot?: SessionItem;
  }): Promise<void> {
    setSimulationApproval(null);   
     setSimulatingMissionIds((current) => [
      ...new Set([...current, input.preview.id]),
    ]);
    try {
      const response = await window.silfable.simulateMission({
        schemaVersion: 1,
        requestId: crypto.randomUUID(),
        sessionId: input.sessionId,
        missionId: input.preview.id,
        acknowledgedSimulationOnly: true,
      });
      const currentSession = input.sessionSnapshot ?? sessions.find(
        (session) => session.id === input.sessionId,
      );
      if (currentSession === undefined)
        throw new Error("Session is unavailable");
      const next = {
        ...currentSession,
        messages: currentSession.messages.map((message) =>
          message.id === input.messageId
            ? { ...message, missionSimulation: response.simulation }
            : message,
        ),
      };
      await persistSession(next);
      setSessions((current) =>
        current.map((session) =>
          session.id === input.sessionId ? next : session,
        ),
      );
      if (currentSession.permission === "full" && response.simulation.status === "passed") {
        await runFullAccessExecution({ ...input, simulation: response.simulation });
      }
    } finally {
      setSimulatingMissionIds((current) =>
        current.filter((id) => id !== input.preview.id),
      );
    }
  }
  async function runFullAccessExecution(input: {
    sessionId: string;
    messageId: string;
    preview: MissionContractPreview;
    simulation: MissionSimulationPreview;
  }): Promise<void> {
    setExecutingMissionIds((current) => [...new Set([...current, input.preview.id])]);
    try {
      const response = await window.silfable.executeFullAccessMission({
        schemaVersion: 1,
        requestId: crypto.randomUUID(),
        sessionId: input.sessionId,
        missionId: input.preview.id,
        simulationId: input.simulation.id,
      });
      setSessions((current) => current.map((session) => {
        if (session.id !== input.sessionId) return session;
        const next = {
          ...session,
          messages: session.messages.map((message) => message.id === input.messageId ? { ...message, missionExecution: response.receipt } : message),
        };
        void persistSession(next);
        return next;
      }));
      setPortfolioRefresh((value) => value + 1);
    } catch (cause) {
      setSessions((current) => current.map((session) => {
        if (session.id !== input.sessionId) return session;
        const next = {
          ...session,
          messages: session.messages.map((message) => message.id === input.messageId
            ? { ...message, text: `${message.text}\n\nFull Access execution was blocked safely: ${cleanErrorMessage(cause instanceof Error ? cause.message : "execution unavailable")}`.slice(0, 12_000) }
            : message),
        };
        void persistSession(next);
        return next;
      }));
    } finally {
      setExecutingMissionIds((current) => current.filter((id) => id !== input.preview.id));
    }
  }
  async function runPumpSimulation(input: {
    sessionId: string;
    messageId: string;
    preview: PumpTradeContractPreview;
  }): Promise<void> {
    setSimulatingPumpIds((current) => [...new Set([...current, input.preview.id])]);
    try {
      const response = await window.silfable.simulatePumpTrade({
        schemaVersion: 1,
        requestId: crypto.randomUUID(),
        sessionId: input.sessionId,
        previewId: input.preview.id,
        acknowledgedSimulationOnly: true,
      });
      setSessions((current) => current.map((session) => session.id !== input.sessionId
        ? session
        : {
            ...session,
            messages: session.messages.map((message) => message.id === input.messageId
              ? { ...message, pumpSimulation: response.simulation }
              : message),
          }));
    } finally {
      setSimulatingPumpIds((current) => current.filter((id) => id !== input.preview.id));
    }
  }
  async function runPumpFinalRevalidation(input: {
    sessionId: string;
    messageId: string;
    preview: PumpTradeContractPreview;
  }): Promise<void> {
    setRevalidatingPumpIds((current) => [...new Set([...current, input.preview.id])]);
    try {
      const response = await window.silfable.finalRevalidatePumpTrade({
        schemaVersion: 1,
        requestId: crypto.randomUUID(),
        sessionId: input.sessionId,
        previewId: input.preview.id,
        acknowledgedNoExecution: true,
      });
      setSessions((current) => current.map((session) => session.id !== input.sessionId
        ? session
        : {
            ...session,
            messages: session.messages.map((message) => message.id === input.messageId
              ? { ...message, pumpSimulation: response.simulation }
              : message),
          }));
    } finally {
      setRevalidatingPumpIds((current) => current.filter((id) => id !== input.preview.id));
    }
  }
  async function createPumpLaunchDraft(
    target: SessionItem,
    input: PumpLaunchDraftInput,
  ): Promise<void> {
    const response = await window.silfable.createPumpLaunchDraft({
      schemaVersion: 1,
      requestId: crypto.randomUUID(),
      sessionId: target.id,
      input,
    });
    let automaticPreflight: PumpLaunchPreflight | undefined;
    let automaticPreflightError: string | null = null;
    try {
      const preflightResponse = await window.silfable.preflightPumpLaunch({
        schemaVersion: 1,
        requestId: crypto.randomUUID(),
        sessionId: target.id,
        draftId: response.draft.id,
        acknowledgedNoExecution: true,
      });
      automaticPreflight = preflightResponse.preflight;
    } catch (reason) {
      automaticPreflightError = reason instanceof Error
        ? reason.message
        : "The automatic unsigned preflight could not be completed.";
    }
    const current = sessions.find((item) => item.id === target.id);
    if (current === undefined) throw new Error("Session is unavailable");
    const message: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      at: new Date().toISOString(),
      text: automaticPreflight
        ? "Token Launch draft and unsigned Mainnet preflight are ready for review. No transaction was signed or broadcast."
        : `Token Launch draft was saved, but its automatic unsigned preflight could not complete. You can retry safely from the draft card. Details: ${automaticPreflightError}`,
      pumpLaunchDraft: response.draft,
      pumpLaunchPreflight: automaticPreflight,
    };
    const next = { ...current, messages: [...current.messages, message] };
    setSessions((items) => items.map((item) => item.id === next.id ? next : item));
    await persistSession(next);
  }
  async function preflightPumpLaunch(target: SessionItem, launchDraft: PumpLaunchDraft): Promise<void> {
    const response = await window.silfable.preflightPumpLaunch({
      schemaVersion: 1,
      requestId: crypto.randomUUID(),
      sessionId: target.id,
      draftId: launchDraft.id,
      acknowledgedNoExecution: true,
    });
    const current = sessions.find((item) => item.id === target.id);
    if (current === undefined) throw new Error("Session is unavailable");
    const next = {
      ...current,
      messages: current.messages.map((message) => message.pumpLaunchDraft?.id === launchDraft.id
        ? { ...message, pumpLaunchPreflight: response.preflight }
        : message),
    };
    setSessions((items) => items.map((item) => item.id === next.id ? next : item));
    await persistSession(next);
  }
  async function finalRevalidatePumpLaunch(
    target: SessionItem,
    launchDraft: PumpLaunchDraft,
    preflight: PumpLaunchPreflight,
  ): Promise<void> {
    const response = await window.silfable.finalRevalidatePumpLaunch({
      schemaVersion: 1,
      requestId: crypto.randomUUID(),
      sessionId: target.id,
      draftId: launchDraft.id,
      preflightId: preflight.id,
      acknowledgedNoExecution: true,
    });
    const current = sessions.find((item) => item.id === target.id);
    if (current === undefined) throw new Error("Session is unavailable");
    const next = {
      ...current,
      messages: current.messages.map((message) => message.pumpLaunchDraft?.id === launchDraft.id
        ? { ...message, pumpLaunchFinalRevalidation: response.revalidation }
        : message),
    };
    setSessions((items) => items.map((item) => item.id === next.id ? next : item));
    await persistSession(next);
  }
  async function executePumpLaunch(
    target: SessionItem,
    launchDraft: PumpLaunchDraft,
    preflight: PumpLaunchPreflight,
    revalidation: PumpLaunchFinalRevalidation,
    credentials: { masterPassword: string },
  ): Promise<void> {
    const response = await window.silfable.executePumpLaunch({
      schemaVersion: 1,
      requestId: crypto.randomUUID(),
      sessionId: target.id,
      draftId: launchDraft.id,
      preflightId: preflight.id,
      revalidationId: revalidation.id,
      masterPassword: credentials.masterPassword,
      confirmation: "LAUNCH TOKEN MAINNET",
      acknowledgedIrreversibleLaunch: true,
    });
    const current = sessions.find((item) => item.id === target.id);
    if (current === undefined) throw new Error("Session is unavailable");
    const next = {
      ...current,
      messages: current.messages.map((message) => message.pumpLaunchDraft?.id === launchDraft.id
        ? { ...message, pumpLaunchExecution: response.execution }
        : message),
    };
    setSessions((items) => items.map((item) => item.id === next.id ? next : item));
    await persistSession(next);
    setPortfolioRefresh((value) => value + 1);
  }
  async function verifyPumpLaunchExecution(
    target: SessionItem,
    launchDraft: PumpLaunchDraft,
    execution: PumpLaunchExecutionRecord,
  ): Promise<void> {
    const response = await window.silfable.verifyPumpLaunchExecution({
      schemaVersion: 1,
      requestId: crypto.randomUUID(),
      sessionId: target.id,
      draftId: launchDraft.id,
      executionId: execution.id,
    });
    const current = sessions.find((item) => item.id === target.id);
    if (current === undefined) throw new Error("Session is unavailable");
    const next = {
      ...current,
      messages: current.messages.map((message) => message.pumpLaunchDraft?.id === launchDraft.id
        ? { ...message, pumpLaunchExecution: response.execution }
        : message),
    };
    setSessions((items) => items.map((item) => item.id === next.id ? next : item));
    await persistSession(next);
    if (response.execution.status === "finalized") {
      setPortfolioRefresh((value) => value + 1);
    }
  }

  async function runPumpExecution(
    input: NonNullable<typeof pumpExecutionApproval>,
    credentials: { masterPassword: string; confirmation: string },
  ): Promise<void> {
    setExecutingPumpIds((current) => [...new Set([...current, input.preview.id])]);
    try {
      const response = await window.silfable.executePumpTrade({
        schemaVersion: 1,
        requestId: crypto.randomUUID(),
        sessionId: input.sessionId,
        previewId: input.preview.id,
        masterPassword: credentials.masterPassword,
        confirmation: "EXECUTE PUMP MAINNET",
        acknowledgedIrreversibleExecution: true,
      });
      setSessions((current) => current.map((session) => session.id !== input.sessionId
        ? session
        : {
            ...session,
            messages: session.messages.map((message) => message.id === input.messageId
              ? { ...message, pumpExecution: response.execution }
              : message),
          }));
      setPumpExecutionApproval(null);
      setPortfolioRefresh((current) => current + 1);
    } finally {
      setExecutingPumpIds((current) => current.filter((id) => id !== input.preview.id));
    }
  }

  async function verifyPumpExecution(input: {
    sessionId: string;
    messageId: string;
    preview: PumpTradeContractPreview;
    execution: PumpExecutionRecord;
  }): Promise<void> {
    setVerifyingPumpExecutionIds((current) => [...new Set([...current, input.execution.id])]);
    try {
      const response = await window.silfable.verifyPumpExecution({
        schemaVersion: 1,
        requestId: crypto.randomUUID(),
        sessionId: input.sessionId,
        previewId: input.preview.id,
        executionId: input.execution.id,
      });
      setSessions((current) => current.map((session) => session.id !== input.sessionId
        ? session
        : {
            ...session,
            messages: session.messages.map((message) => message.id === input.messageId
              ? { ...message, pumpExecution: response.execution }
              : message),
          }));
      if (response.execution.status === "finalized") {
        setPortfolioRefresh((current) => current + 1);
      }
    } finally {
      setVerifyingPumpExecutionIds((current) => current.filter((id) => id !== input.execution.id));
    }
  }

  async function runLimitOrderSimulation(input: {
    sessionId: string;
    messageId: string;
    preview: LimitOrderContractPreview;
  }): Promise<void> {
    setLimitSimulationApproval(null);
    setSimulatingLimitIds((current) => [
      ...new Set([...current, input.preview.id]),
    ]);
    try {
      const response = await window.silfable.simulateLimitOrder({
        schemaVersion: 1,
        requestId: crypto.randomUUID(),
        sessionId: input.sessionId,
        previewId: input.preview.id,
        acknowledgedVaultRegistration: true,
        acknowledgedSimulationOnly: true,
      });
      const currentSession = sessions.find(
        (session) => session.id === input.sessionId,
      );
      if (!currentSession) throw new Error("Session is unavailable");
      const next = {
        ...currentSession,
        messages: currentSession.messages.map((message) =>
          message.id === input.messageId
            ? { ...message, limitOrderSimulation: response.simulation }
            : message,
        ),
      };
      await persistSession(next);
      setSessions((current) =>
        current.map((session) =>
          session.id === input.sessionId ? next : session,
        ),
      );
    } finally {
      setSimulatingLimitIds((current) =>
        current.filter((id) => id !== input.preview.id),
      );
    }
  }
  async function runLimitOrderExecution(
    input: {
      sessionId: string;
      messageId: string;
      preview: LimitOrderContractPreview;
      simulation: LimitOrderSimulationPreview;
    },
    masterPassword: string,
  ): Promise<void> {
    setExecutingLimitIds((current) => [
      ...new Set([...current, input.preview.id]),
    ]);
    try {
      const response = await window.silfable.executeLimitOrder({
        schemaVersion: 1,
        requestId: crypto.randomUUID(),
        sessionId: input.sessionId,
        previewId: input.preview.id,
        simulationId: input.simulation.id,
        masterPassword,
        confirmation: "CREATE LIMIT ORDER",
        acknowledgedCustodialVaultDeposit: true,
      });
      const currentSession = sessions.find(
        (session) => session.id === input.sessionId,
      );
      if (!currentSession) throw new Error("Session is unavailable");
      const next = {
        ...currentSession,
        messages: currentSession.messages.map((message) =>
          message.id === input.messageId
            ? { ...message, limitOrderExecution: response.receipt }
            : message,
        ),
      };
      await persistSession(next);
      setSessions((current) =>
        current.map((session) =>
          session.id === input.sessionId ? next : session,
        ),
      );
      setLimitExecutionApproval(null);
      setPortfolioRefresh((value) => value + 1);
    } finally {
      setExecutingLimitIds((current) =>
        current.filter((id) => id !== input.preview.id),
      );
    }
  }
  async function runLimitCancelSimulation(input: {
    sessionId: string;
    messageId: string;
    walletAddress: string;
    orderId: string;
  }): Promise<void> {
    setLimitCancelApproval(null);
    setCancellingLimitIds((current) => [
      ...new Set([...current, input.orderId]),
    ]);
    try {
      const response = await window.silfable.simulateLimitOrderCancel({
        schemaVersion: 1,
        requestId: crypto.randomUUID(),
        walletAddress: input.walletAddress,
        orderId: input.orderId,
        acknowledgedWithdrawalSimulationOnly: true,
      });
      const currentSession = sessions.find(
        (session) => session.id === input.sessionId,
      );
      if (!currentSession) throw new Error("Session is unavailable");
      const next = {
        ...currentSession,
        messages: currentSession.messages.map((message) =>
          message.id === input.messageId
            ? { ...message, limitOrderCancelSimulation: response.simulation }
            : message,
        ),
      };
      await persistSession(next);
      setSessions((current) =>
        current.map((session) =>
          session.id === input.sessionId ? next : session,
        ),
      );
    } finally {
      setCancellingLimitIds((current) =>
        current.filter((id) => id !== input.orderId),
      );
    }
  }
  async function runLimitCancelExecution(
    input: {
      sessionId: string;
      messageId: string;
      walletAddress: string;
      orderId: string;
      simulation: LimitOrderCancelSimulation;
    },
    masterPassword: string,
  ): Promise<void> {
    setCancellingLimitIds((current) => [
      ...new Set([...current, input.orderId]),
    ]);
    try {
      const response = await window.silfable.executeLimitOrderCancel({
        schemaVersion: 1,
        requestId: crypto.randomUUID(),
        sessionId: input.sessionId,
        walletAddress: input.walletAddress,
        orderId: input.orderId,
        simulationId: input.simulation.id,
        masterPassword,
        confirmation: "CANCEL LIMIT ORDER",
        acknowledgedVaultWithdrawal: true,
      });
      const currentSession = sessions.find(
        (session) => session.id === input.sessionId,
      );
      if (!currentSession) throw new Error("Session is unavailable");
      const next = {
        ...currentSession,
        messages: currentSession.messages.map((message) =>
          message.id === input.messageId
            ? { ...message, limitOrderCancelReceipt: response.receipt }
            : message,
        ),
      };
      await persistSession(next);
      setSessions((current) =>
        current.map((session) =>
          session.id === input.sessionId ? next : session,
        ),
      );
      setLimitCancelExecutionApproval(null);
      setPortfolioRefresh((value) => value + 1);
    } finally {
      setCancellingLimitIds((current) =>
        current.filter((id) => id !== input.orderId),
      );
    }
  }
  async function verifyLimitOrderExecution(input: {
    sessionId: string;
    messageId: string;
    preview: LimitOrderContractPreview;
    receipt: LimitOrderExecutionReceipt;
  }): Promise<void> {
    setVerifyingLimitExecutionIds((current) => [
      ...new Set([...current, input.receipt.id]),
    ]);
    try {
      const response = await window.silfable.verifyLimitOrderExecution({
        schemaVersion: 1,
        requestId: crypto.randomUUID(),
        sessionId: input.sessionId,
        previewId: input.preview.id,
        receiptId: input.receipt.id,
      });
      setSessions((current) =>
        current.map((session) =>
          session.id !== input.sessionId
            ? session
            : {
                ...session,
                messages: session.messages.map((message) =>
                  message.id === input.messageId
                    ? { ...message, limitOrderExecution: response.receipt }
                    : message,
                ),
              },
        ),
      );
      if (response.receipt.status === "active") {
        setPortfolioRefresh((value) => value + 1);
      }
    } finally {
      setVerifyingLimitExecutionIds((current) =>
        current.filter((id) => id !== input.receipt.id),
      );
    }
  }
  async function verifyLimitOrderCancel(input: {
    sessionId: string;
    messageId: string;
    receipt: NonNullable<
      SessionRecord["messages"][number]["limitOrderCancelReceipt"]
    >;
  }): Promise<void> {
    setVerifyingLimitCancelIds((current) => [
      ...new Set([...current, input.receipt.id]),
    ]);
    try {
      const response = await window.silfable.verifyLimitOrderCancel({
        schemaVersion: 1,
        requestId: crypto.randomUUID(),
        sessionId: input.sessionId,
        orderId: input.receipt.orderId,
        receiptId: input.receipt.id,
      });
      setSessions((current) =>
        current.map((session) =>
          session.id !== input.sessionId
            ? session
            : {
                ...session,
                messages: session.messages.map((message) =>
                  message.id === input.messageId
                    ? {
                        ...message,
                        limitOrderCancelReceipt: response.receipt,
                      }
                    : message,
                ),
              },
        ),
      );
      if (response.receipt.status === "cancelled") {
        setPortfolioRefresh((value) => value + 1);
      }
    } finally {
      setVerifyingLimitCancelIds((current) =>
        current.filter((id) => id !== input.receipt.id),
      );
    }
  }
  async function runExecution(
    input: {
      sessionId: string;
      messageId: string;
      preview: MissionContractPreview;
      simulation: MissionSimulationPreview;
    },
    credentials: { masterPassword: string; confirmation: string },
  ): Promise<void> {
    setExecutingMissionIds((current) => [
      ...new Set([...current, input.preview.id]),
    ]);
    try {
      const response = await window.silfable.executeMission({
        schemaVersion: 1,
        requestId: crypto.randomUUID(),
        sessionId: input.sessionId,
        missionId: input.preview.id,
        simulationId: input.simulation.id,
        masterPassword: credentials.masterPassword,
        confirmation: "EXECUTE MAINNET",
        acknowledgedIrreversibleMainnetExecution: true,
      });
      setSessions((current) =>
        current.map((session) =>
          session.id !== input.sessionId
            ? session
            : {
                ...session,
                messages: session.messages.map((message) =>
                  message.id === input.messageId
                    ? { ...message, missionExecution: response.receipt }
                    : message,
                ),
              },
        ),
      );
      setExecutionApproval(null);
      setPortfolioRefresh((value) => value + 1);
    } finally {
      setExecutingMissionIds((current) =>
        current.filter((id) => id !== input.preview.id),
      );
    }
  }
  async function verifyExecution(input: {
    sessionId: string;
    messageId: string;
    preview: MissionContractPreview;
    receipt: MissionExecutionReceipt;
  }): Promise<void> {
    setVerifyingReceiptIds((current) => [
      ...new Set([...current, input.receipt.id]),
    ]);
    try {
      const response = await window.silfable.verifyMissionExecution({
        schemaVersion: 1,
        requestId: crypto.randomUUID(),
        sessionId: input.sessionId,
        missionId: input.preview.id,
        receiptId: input.receipt.id,
      });
      setSessions((current) =>
        current.map((session) =>
          session.id !== input.sessionId
            ? session
            : {
                ...session,
                messages: session.messages.map((message) =>
                  message.id === input.messageId
                    ? { ...message, missionExecution: response.receipt }
                    : message,
                ),
              },
        ),
      );
      if (response.receipt.status === "confirmed")
        setPortfolioRefresh((value) => value + 1);
    } finally {
      setVerifyingReceiptIds((current) =>
        current.filter((id) => id !== input.receipt.id),
      );
    }
  }
  if (settingsOpen)
    return (
      <SetupFlow
        setup={setup}
        runtime={runtime}
        save={saveSetup}
        setRuntime={setRuntime}
        editing
        onExit={() => {
          saveSetup({ ...setup, step: 6 });
          setSettingsOpen(false);
          setNav("sessions");
          setWalletRefresh((value) => value + 1);
          setPortfolioRefresh((value) => value + 1);
        }}
      />
    );
  return (
   <main className="workspace" data-theme="dark">
      <aside className="leftRail">
        <button
          className="railBrand"
          type="button"
          aria-label="Return to Silfable home"
          title="Return to home"
          onClick={() => {
            setActiveId(null);
            setNav("sessions");
          }}
        >
          <BrandMark />
          <span>Silfable</span>
        </button>
        <Button
          className="newSession"
          size="lg"
          fullWidth
          icon={<CirclePlus className="size-4" />}
          onClick={() => void requestSession()}
        >
          New session
        </Button>
        <div className="sessionFilters">
          <Button
            variant="ghost"
            size="sm"
            className={sessionFilter === "all" ? "active" : ""}
            onClick={() => chooseFilter("all")}
          >
            All
          </Button>
           <Button
            variant="ghost"
            size="sm"
            className={sessionFilter === "agent" ? "active" : ""}
            onClick={() => chooseFilter("agent")}
          >
            Agent
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={sessionFilter === "mission" ? "active" : ""}
            onClick={() => chooseFilter("mission")}
          >
            Mission
          </Button>
        </div>
        <div className="sessionList">
          <p>Sessions</p>
          {sessionsState === "error" ? (
            <div className="emptySessions sessionLoadError" role="status">
              <strong>Session history is unavailable</strong>
              <span>Your encrypted records were not deleted.</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void refreshEncryptedSessions().catch(() => undefined)}
              >
                Retry
              </Button>
            </div>
            ) : sessionsState === "loading" ? (
            <div className="emptySessions">Loading encrypted sessions…</div>
          ) : filteredSessions.length === 0 ? (
            <div className="emptySessions">
              No {sessionFilter === "all" ? "" : `${sessionFilter} `}sessions
              yet.
            </div>
          ) : (
            filteredSessions.map((session) => (
              <div
                className="sessionItemWrapper"
                key={session.id}
              >
                <button
                  className={`sessionButton ${session.id === activeId ? "active" : ""}`}
                  onClick={() => {
                    setActiveId(session.id);
                    setNav("sessions");
                  }}
                >
                  <span>
                    {session.workspace === "pump"
                      ? "P"
                      : session.mode === "mission"
                        ? "◎"
                        : "◌"}
                  </span>
                  <div>
                    <strong>{session.title}</strong>
                    <small>
                      {sessionIntentLabel(session)} ·{" "}
                      {session.permission}
                    </small>
                  </div>
                </button>
                <button
                  className="deleteSessionButton"
                  title="Delete session"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSessionToDelete(session);
                  }}
                >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
                </button>
              </div>
            ))
          )}
        </div>

        <nav className="bottomNav">
          <Button
            variant="ghost"
            icon={<Target className="size-4" />}
            className={nav === "missions" ? "active" : ""}
            onClick={() => setNav("missions")}
          >
            Missions
          </Button>
          <Button
            variant="ghost"
            icon={<Bot className="size-4" />}
            className={nav === "automation" ? "active" : ""}
            onClick={() => setNav("automation")}
          >
            Automation
          </Button>
          <Button
            variant="ghost"
            icon={<Settings className="size-4" />}
            onClick={() => {
              saveSetup({ ...setup, step: 6 });
              setSettingsOpen(true);
            }}
          >
            Settings
          </Button>
        </nav>
        <div className="runtimeBadge">
          <span /> Mainnet guarded · {runtime ? "ready" : "checking"}
        </div>
      </aside>
     <section className="centerStage">
        {nav === "automation" ? (
          <AutomationPanel
            sessionId={active?.id}
            fullAccessSessionIds={sessions.filter((session) => session.permission === "full").map((session) => session.id)}
            onReloadSessions={() => refreshEncryptedSessions(active?.id)}
            onSelectSession={(sessionId) => {
              setActiveId(sessionId);
              setNav("sessions");
            }}
          />
        ) : nav === "missions" ? (
          <MissionsView
            items={missionPreviews}
            onOpen={(sessionId) => {
              setActiveId(sessionId);
              setNav("sessions");
            }}
          />
        ) : active ? (
          <Conversation
            session={active}
            draft={draft}
            setDraft={setDraft}
            onSend={() =>
              draft.trim() && void sendMessage(active, draft.trim())
            }
            onCreatePumpLaunchDraft={(input) => createPumpLaunchDraft(active, input)}
            onPreflightPumpLaunch={(launchDraft) => preflightPumpLaunch(active, launchDraft)}
            onFinalRevalidatePumpLaunch={(launchDraft, preflight) => finalRevalidatePumpLaunch(active, launchDraft, preflight)}
            onExecutePumpLaunch={(launchDraft, preflight, revalidation, credentials) => executePumpLaunch(active, launchDraft, preflight, revalidation, credentials)}
            onVerifyPumpLaunchExecution={(launchDraft, execution) => verifyPumpLaunchExecution(active, launchDraft, execution)}
            onPrepareBridge={(input) => prepareBridge(active, input)}
            preparingBridge={preparingBridgeIds.length > 0}
            reconcilingBridgeIds={reconcilingBridgeIds}
            onRequestBridgeExecution={(proposal, preflight) => {
              if (active.permission === "full" && active.walletScope === "solana") {
                void executeFullAccessBridge(active.id, proposal, preflight);
                return;
              }
              setBridgeExecutionApproval({
                sessionId: active.id,
                proposal,
                preflight,
              });
            }}
            onReconcileBridge={(receipt) => void reconcileBridge(active, receipt)}
            dispatchingEvmBridgeIds={dispatchingEvmBridgeIds}
            onDispatchEvmBridge={(messageId, preparation) => {
              if (active.permission !== "full" || active.walletScope !== "evm" || active.evmChainKey !== "robinhood") return;
              void dispatchFullAccessEvmBridge({ sessionId: active.id, messageId, preparation });
            }}
            thinking={thinkingIds.includes(active.id)}
            animatedMessageIds={animatedMessageIds}
            onAnimationComplete={(id) =>
              setAnimatedMessageIds((current) =>
                current.filter((value) => value !== id),
              )
            }
            simulatingMissionIds={simulatingMissionIds}
            simulatingPumpIds={simulatingPumpIds}
            revalidatingPumpIds={revalidatingPumpIds}
            executingPumpIds={executingPumpIds}
            verifyingPumpExecutionIds={verifyingPumpExecutionIds}
            executingMissionIds={executingMissionIds}
            verifyingReceiptIds={verifyingReceiptIds}
            simulatingLimitIds={simulatingLimitIds}
            executingLimitIds={executingLimitIds}
            cancellingLimitIds={cancellingLimitIds}
            verifyingLimitExecutionIds={verifyingLimitExecutionIds}
            verifyingLimitCancelIds={verifyingLimitCancelIds}
            preparingEvmIds={preparingEvmIds}
            executingEvmIds={executingEvmIds}
            evmExecutionEnabled={evmExecutionEnabled}
            evmExecutionMissing={evmExecutionMissing}
            fullAccessEvm={active.permission === "full" && active.walletScope === "evm" && active.evmChainKey === "robinhood"}
            onPrepareEvmSwap={(messageId, proposal) =>
              void prepareEvmSwap({
                sessionId: active.id,
                messageId,
                proposal,
              })
            }
            onRequestEvmExecution={(messageId, proposal, preflight) => {
              if (active.permission === "full" && active.walletScope === "evm" && active.evmChainKey === "robinhood") {
                void executeFullAccessEvmAction({ sessionId: active.id, messageId, proposal, preflight });
                return;
              }
              setEvmExecutionApproval({
                sessionId: active.id,
                messageId,
                proposal,
                preflight,
                action: preflight.allowanceRequired ? "approval" : "swap",
              });
            }}
            onAuthorizeFullAccessEvmAsset={(reviewId) =>
              authorizeFullAccessEvmAsset(active, reviewId)
            }
            onRequestLimitSimulation={(messageId, preview) =>
              setLimitSimulationApproval({
                sessionId: active.id,
                messageId,
                preview,
              })
            }
            onRequestLimitExecution={(messageId, preview, simulation) =>
              setLimitExecutionApproval({
                sessionId: active.id,
                messageId,
                preview,
                simulation,
              })
            }
            onRequestLimitCancel={(messageId, walletAddress, orderId) =>
              setLimitCancelApproval({
                sessionId: active.id,
                messageId,
                walletAddress,
                orderId,
              })
            }
            onRequestLimitCancelExecution={(
              messageId,
              walletAddress,
              orderId,
              simulation,
            ) =>
              setLimitCancelExecutionApproval({
                sessionId: active.id,
                messageId,
                walletAddress,
                orderId,
                simulation,
              })
            }
            onVerifyLimitExecution={(messageId, preview, receipt) =>
              void verifyLimitOrderExecution({
                sessionId: active.id,
                messageId,
                preview,
                receipt,
              })
            }
            onVerifyLimitCancel={(messageId, receipt) =>
              void verifyLimitOrderCancel({
                sessionId: active.id,
                messageId,
                receipt,
              })
            }
            onRequestSimulation={(messageId, preview) =>
              setSimulationApproval({
                sessionId: active.id,
                messageId,
                preview,
              })
            }
            onRequestPumpSimulation={(messageId, preview) =>
              void runPumpSimulation({
                sessionId: active.id,
                messageId,
                preview,
              })
            }
            onRequestPumpFinalRevalidation={(messageId, preview) =>
              void runPumpFinalRevalidation({
                sessionId: active.id,
                messageId,
                preview,
              })
            }
            onRequestPumpExecution={(messageId, preview, simulation, revalidation) =>
              setPumpExecutionApproval({
                sessionId: active.id,
                messageId,
                preview,
                simulation,
                revalidation,
              })
            }
            onVerifyPumpExecution={(messageId, preview, execution) =>
              void verifyPumpExecution({
                sessionId: active.id,
                messageId,
                preview,
                execution,
              })
            }
            onRequestExecution={(messageId, preview, simulation) =>
              setExecutionApproval({
                sessionId: active.id,
                messageId,
                preview,
                simulation,
              })
            }
            onVerifyExecution={(messageId, preview, receipt) =>
              void verifyExecution({
                sessionId: active.id,
                messageId,
                preview,
                receipt,
              })
            }
          />
        ) : (
          <HomeComposer
            draft={draft}
            setDraft={setDraft}
            onSubmit={() => {
              if (draft.trim()) void requestSession(draft.trim());
            }}
          />
        )}
      </section>
       <RightRail
        session={active}
        runtime={runtime}
        model={setup.providerModel}
        contextLimit={setup.contextLimit}
        outputLimit={setup.outputLimit}
        wallets={wallets}
        evmWallets={evmWallets}
        refreshToken={portfolioRefresh}
        onAnalyzePump={active?.workspace === "pump"
          ? (mint) => {
              const allowed = active.pumpConfig?.scope === "exact-mint"
                ? active.pumpConfig.tokenMint === mint
                : active.pumpConfig?.scope === "watchlist" && active.pumpConfig.watchlistMints?.includes(mint);
              if (allowed) void sendMessage(active, `Analyze the exact Pump.fun mint ${mint} with a reference buy size of ${active.pumpConfig!.analysisBuyLamports ?? "1000000"} lamports. Use finalized on-chain Pump/PumpSwap evidence, include the reserve-only buy and sell-back path, and do not prepare or execute a transaction.`);
            }
          : undefined}
        onScanPump={active?.workspace === "pump" && active.pumpConfig?.scope === "discovery"
          ? () => void sendMessage(active, `Scan up to 10 recent finalized transactions touching the official Pump program and return at most 5 independently verified candidates using a reference buy size of ${active.pumpConfig!.analysisBuyLamports ?? "1000000"} lamports. Do not rank candidates that fail deterministic research eligibility, and do not prepare or execute a transaction.`)
          : undefined}
        onReloadSessions={() => refreshEncryptedSessions(active?.id)}
      />
     {modalOpen && (
        <SessionModal
          prompt={pendingPrompt}
          wallets={wallets}
          evmWallets={evmWallets}
          onCancel={() => setModalOpen(false)}
          onCreate={(value) => void createSession(value)}
        />
      )}
      {fullAccessEnrollmentOpen && (
        <Modal
          isOpen={true}
          onClose={() => !fullAccessBusy && setFullAccessEnrollmentOpen(false)}
          title="Enroll Full Access"
          subtitle="Desktop-only · 24-hour local-vault grant · generic approval gate bypass for one pinned Solana swap"
        >
          {activeSolanaMissions.length === 0 || active === null ? (
            <Notice tone="warning" title="Exact Solana mission required">
              Create a Solana swap mission in this Full Access session first. The exact token pair, amount, and policy are pinned before enrollment.
            </Notice>
          ) : (
            <>
              <Notice tone="warning" title="Irreversible local authority">
                This grant skips the generic approval modal only for the pinned job. Quote, balance, fee, slippage, simulation, allowlist, and emergency-stop checks remain mandatory.
              </Notice>
              <div className="space-y-3 text-sm">
                <div className="rounded-xl border border-emerald-200/20 bg-black/20 p-3">
                  <strong>Pinned Solana swap</strong>
                  <p className="mt-1 text-xs text-muted-foreground">{activeSolanaMissions[0]!.preview.goal}</p>
                  <p className="mt-1 font-mono text-[11px] text-emerald-200">{activeSolanaMissions[0]!.preview.inputMint} → {activeSolanaMissions[0]!.preview.outputMint}</p>
                </div>
                <label className="grid gap-1"><span className="text-xs font-semibold">Master password</span><input type="password" value={fullAccessPassword} onChange={(event) => setFullAccessPassword(event.target.value)} /></label>
                <label className="grid gap-1"><span className="text-xs font-semibold">Type ENABLE FULL ACCESS FOR 24 HOURS</span><input value={fullAccessConfirmation} onChange={(event) => setFullAccessConfirmation(event.target.value)} /></label>
                {fullAccessError && <p className="text-sm text-rose-300">{fullAccessError}</p>}
              </div>
              <div className="modalFooterActions">
                <Button variant="ghost" disabled={fullAccessBusy} onClick={() => setFullAccessEnrollmentOpen(false)}>Cancel</Button>
                <Button
                  loading={fullAccessBusy}
                  disabled={fullAccessConfirmation !== "ENABLE FULL ACCESS FOR 24 HOURS" || fullAccessPassword.length === 0}
                  onClick={async () => {
                    try {
                      if (active === null) return;
                      setFullAccessBusy(true); setFullAccessError(null);
                      const preview = activeSolanaMissions[0]!.preview;
                      const jobResponse = await window.silfable.createFullAccessSolanaSwapJob({ schemaVersion: 1, requestId: crypto.randomUUID(), sessionId: active.id, missionId: preview.id });
                      await window.silfable.createFullAccessExecutionGrant({
                        schemaVersion: 1, requestId: crypto.randomUUID(), sessionId: active.id, runtimeId: crypto.randomUUID(),
                        capabilities: ["SOLANA_SWAP"], pinnedJobIds: [jobResponse.job.id], allowedSolanaMints: [preview.inputMint, preview.outputMint], allowedEvmTokens: [],
                        limits: { maxActionsPerWake: 1, maxActionsTotal: 1, maxSingleActionUsd: 5, maxTotalAllocationUsd: 5, maxNetworkFeeUsd: 1, maxFeePercentage: 1, maxSlippageBps: preview.maxSlippageBps },
                        expiresAt: new Date(Date.now() + 23 * 60 * 60 * 1_000 + 59 * 60 * 1_000).toISOString(), masterPassword: fullAccessPassword,
                        confirmation: "ENABLE FULL ACCESS FOR 24 HOURS", acknowledgedRisk: true,
                      });
                      setFullAccessEnrollmentOpen(false);
                    } catch (error) { setFullAccessError(error instanceof Error ? error.message : "Full Access enrollment failed safely"); }
                    finally { setFullAccessBusy(false); }
                  }}
                >Enable Full Access</Button>
              </div>
            </>
          )}
        </Modal>
      )}
       {sessionToDelete && (
        <Modal
          isOpen={true}
          onClose={() => setSessionToDelete(null)}
          title="Delete session"
        >
          <div className="deleteSessionModalContent">
            <p>
              Are you sure you want to delete <strong>"{sessionToDelete.title}"</strong>?
            </p>
            <p className="deleteSessionWarning">
              All messages and history associated with this session will be permanently removed.
            </p>
            <div className="modalFooterActions">
              <Button
                variant="ghost"
                onClick={() => setSessionToDelete(null)}
                disabled={deletingSession}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                loading={deletingSession}
                onClick={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  await confirmDeleteSession();
                }}
              >
                Delete session
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {simulationApproval && (
        <SimulationApprovalModal
          preview={simulationApproval.preview}
          onCancel={() => setSimulationApproval(null)}
          onConfirm={() => void runSimulation(simulationApproval)}
        />
      )}
      {executionApproval && (
        <ExecutionApprovalModal
          preview={executionApproval.preview}
          simulation={executionApproval.simulation}
          onCancel={() => setExecutionApproval(null)}
          onConfirm={(credentials) =>
            runExecution(executionApproval, credentials)
          }
        />
      )}
      {evmExecutionApproval && (
        <EvmExecutionApprovalModal
          action={evmExecutionApproval.action}
          proposal={evmExecutionApproval.proposal}
          preflight={evmExecutionApproval.preflight}
          onCancel={() => setEvmExecutionApproval(null)}
          onConfirm={(credentials) =>
            executeEvmAction(evmExecutionApproval, credentials)
          }
        />
      )}
       {bridgeExecutionApproval && (
        <BridgeExecutionApprovalModal
          proposal={bridgeExecutionApproval.proposal}
          preflight={bridgeExecutionApproval.preflight}
          onCancel={() => setBridgeExecutionApproval(null)}
          onConfirm={(password) => executeBridge(bridgeExecutionApproval, password)}
        />
      )}
      {pumpExecutionApproval && (
        <PumpExecutionApprovalModal
          preview={pumpExecutionApproval.preview}
          simulation={pumpExecutionApproval.simulation}
          revalidation={pumpExecutionApproval.revalidation}
          onCancel={() => setPumpExecutionApproval(null)}
          onConfirm={(credentials) =>
            runPumpExecution(pumpExecutionApproval, credentials)
          }
        />
      )}
      {limitSimulationApproval && (
        <LimitOrderSimulationApprovalModal
          preview={limitSimulationApproval.preview}
          onCancel={() => setLimitSimulationApproval(null)}
          onConfirm={() =>
            void runLimitOrderSimulation(limitSimulationApproval)
          }
        />
      )}
      {limitExecutionApproval && (
        <LimitOrderFinalModal
          kind="create"
          preview={limitExecutionApproval.preview}
          onCancel={() => setLimitExecutionApproval(null)}
          onConfirm={(password) =>
            runLimitOrderExecution(limitExecutionApproval, password)
          }
        />
      )}
      {limitCancelApproval && (
        <LimitOrderCancelSimulationModal
          orderId={limitCancelApproval.orderId}
          onCancel={() => setLimitCancelApproval(null)}
          onConfirm={() => void runLimitCancelSimulation(limitCancelApproval)}
        />
      )}
      {limitCancelExecutionApproval && (
        <LimitOrderFinalModal
          kind="cancel"
          orderId={limitCancelExecutionApproval.orderId}
          onCancel={() => setLimitCancelExecutionApproval(null)}
          onConfirm={(password) =>
            runLimitCancelExecution(limitCancelExecutionApproval, password)
          }
        />
      )}
    </main>
  );
}



type EvmBridgeDestinationSelection = "solana" | EvmBridgeChainKey;












function calculateActualSlippageBps(expectedOutput: string, actualOutput: string): number | null {
  const expected = BigInt(expectedOutput);
  const actual = BigInt(actualOutput);
  if (expected <= 0n) return null;
  if (actual >= expected) return 0;
  return Number(((expected - actual) * 10_000n) / expected);
}


















     




type SolanaPortfolioView = { wallet: WalletSummary; snapshot: PortfolioSnapshot };
type EvmPortfolioView = { wallet: WalletSummary; snapshot: EvmPortfolioSnapshot };
type PortfolioLoadState = "idle" | "loading" | "ready" | "partial" | "error";
type PortfolioFamilyFilter = "all" | "solana" | "evm";

async function settleTaskPool<T>(tasks: ReadonlyArray<() => Promise<T>>, concurrency: number): Promise<Array<PromiseSettledResult<T>>> {
  const results = new Array<PromiseSettledResult<T>>(tasks.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, concurrency), tasks.length) }, async () => {
    while (cursor < tasks.length) {
      const index = cursor;
      cursor += 1;
      const task = tasks[index];
      if (!task) continue;
      try {
        results[index] = { status: "fulfilled", value: await task() };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  });
  await Promise.all(workers);
  return results;
}







function shorten(value: string): string {
  return value.length > 14 ? `${value.slice(0, 6)}…${value.slice(-6)}` : value;
}
async function copyWalletAddress(address: string): Promise<void> {
  await window.silfable.copyWalletAddress({
    schemaVersion: 1,
    requestId: crypto.randomUUID(),
    address,
  });
}
function readSetup(): SetupState {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? "null",
    ) as Partial<SetupState> | null;
    return parsed ? { ...DEFAULT_SETUP, ...parsed } : DEFAULT_SETUP;
  } catch {
    return DEFAULT_SETUP;
  }
}

function AutomationSetupDcaCard({
  setup,
  onApprove,
}: {
  setup: import("@silfable/contracts").AutomationSetupDcaRequest;
  onApprove: (payload: any) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [approved, setApproved] = useState(false);
  const approve = async () => {
    setBusy(true);
    try {
      await onApprove({ type: "DCA", payload: setup });
      setApproved(true);
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="tradePreviewCard">
      <header className="previewHeader">
        <span className="venueBadge">?? Automation</span>
        <strong>DCA Strategy Setup</strong>
      </header>
      <div className="previewBody">
        <div className="orderRow">
          <span>Target Token</span>
          <span className="font-mono">{setup.outputMint.slice(0,6)}...{setup.outputMint.slice(-4)}</span>
        </div>
        <div className="orderRow">
          <span>Amount per Execution (USDC)</span>
          <span>{Number(setup.orderAmountRaw) / 1000000}</span>
        </div>
        <div className="orderRow">
          <span>Total Executions</span>
          <span>{setup.maximumExecutions}</span>
        </div>
        <div className="orderRow">
          <span>Interval</span>
          <span>{setup.intervalSeconds / 60} Minutes</span>
        </div>
      </div>
      <footer className="previewFooter">
        {approved ? (
          <span className="text-green-400 font-bold" style={{color:"#4ade80"}}>? Approved & Active</span>
        ) : (
          <button className="executeButton" disabled={busy} onClick={approve}>
            {busy ? "Approving..." : "Confirm & Setup"}
          </button>
        )}
      </footer>
    </div>
  );
}

function AutomationSetupExitCard({
  setup,
  onApprove,
}: {
  setup: import("@silfable/contracts").AutomationSetupExitRequest;
  onApprove: (payload: any) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [approved, setApproved] = useState(false);
  const approve = async () => {
    setBusy(true);
    try {
      await onApprove({ type: "EXIT", payload: setup });
      setApproved(true);
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="tradePreviewCard">
      <header className="previewHeader">
        <span className="venueBadge">??? Automation</span>
        <strong>Take Profit / Stop Loss Setup</strong>
      </header>
      <div className="previewBody">
        <div className="orderRow">
          <span>Asset</span>
          <span className="font-mono">{setup.inputMint.slice(0,6)}...{setup.inputMint.slice(-4)}</span>
        </div>
        <div className="orderRow">
          <span>Entry Price (USD)</span>
          <span>${setup.entryPriceUsd}</span>
        </div>
        {setup.takeProfitPriceUsd && (
          <div className="orderRow">
            <span style={{color:"#4ade80"}}>Take Profit (USD)</span>
            <span style={{color:"#4ade80", fontWeight: "bold"}}>${setup.takeProfitPriceUsd}</span>
          </div>
        )}
        {setup.stopLossPriceUsd && (
          <div className="orderRow">
            <span style={{color:"#f87171"}}>Stop Loss (USD)</span>
            <span style={{color:"#f87171", fontWeight: "bold"}}>${setup.stopLossPriceUsd}</span>
          </div>
        )}
      </div>
      <footer className="previewFooter">
        {approved ? (
          <span className="text-green-400 font-bold" style={{color:"#4ade80"}}>? Approved & Active</span>
        ) : (
          <button className="executeButton" disabled={busy} onClick={approve}>
            {busy ? "Approving..." : "Confirm & Setup"}
          </button>
        )}
      </footer>
    </div>
  );
}


