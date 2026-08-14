import { useState } from "react";
import { Connection } from "@solana/web3.js";
import Image from "next/image";
import Link from "next/link";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { WebSetupSettings } from "@/app/trade/page";

interface WebSetupWizardProps {
  publicAddress: string;
  setupCompleted: boolean;
  editingSetup: boolean;
  setupStep: number;
  setSetupStep: Dispatch<SetStateAction<number>>;
  settings: WebSetupSettings;
  setSettings: Dispatch<SetStateAction<WebSetupSettings>>;
  onPersistSettings: () => void;
  onSaveSettings: () => void;
  onReturnToWorkspace: () => void;
}

const steps = ["Networks & Routes", "Safety Limits", "AI Provider", "Review"];
const reviewStep = steps.length;
type OpenRouterModel = { id: string; name: string; contextLength: number | null };

export function WebSetupWizard(props: WebSetupWizardProps) {
  const {
    publicAddress,
    setupCompleted,
    editingSetup,
    setupStep,
    setSetupStep,
    settings,
    setSettings,
    onPersistSettings,
    onSaveSettings,
    onReturnToWorkspace,
  } = props;
  const [verifying, setVerifying] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<Record<string, { ok: boolean; message: string } | undefined>>({});
  const [openRouterModels, setOpenRouterModels] = useState<OpenRouterModel[]>([]);
  const [openRouterVerified, setOpenRouterVerified] = useState(false);
  const [savedStatus, setSavedStatus] = useState(() => ({
    rpc: Boolean(settings.customRpcUrl.trim()),
    evmRpc: Boolean(settings.evmRpcUrl.trim()),
    jupiter: Boolean(settings.jupiterApiKey.trim()),
    uniswap: Boolean(settings.uniswapApiKey.trim()),
  }));

  const activeStep = Math.min(Math.max(setupStep, 1), reviewStep);
  const isReview = activeStep === reviewStep;

  function updateSettings(patch: Partial<WebSetupSettings>) {
    setSettings({ ...settings, ...patch });
  }

  function saveInline() {
    onPersistSettings();
  }

  function errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error && error.message ? error.message : fallback;
  }

  async function verifyAndSaveRpc() {
    const url = settings.customRpcUrl.trim();
    if (!url) {
      saveInline();
      setSavedStatus((previous) => ({ ...previous, rpc: false }));
      setVerifyResult((previous) => ({ ...previous, rpc: { ok: true, message: "Saved. Using the default public RPC." } }));
      return;
    }

    setVerifying("rpc");
    setVerifyResult((previous) => ({ ...previous, rpc: undefined }));
    try {
      const connection = new Connection(url, "confirmed");
      const blockhash = await connection.getLatestBlockhash("confirmed");
      if (!blockhash.blockhash) throw new Error("RPC returned an empty blockhash.");
      saveInline();
      setSavedStatus((previous) => ({ ...previous, rpc: true }));
      setVerifyResult((previous) => ({ ...previous, rpc: { ok: true, message: "RPC verified and saved." } }));
    } catch (error) {
      setVerifyResult((previous) => ({ ...previous, rpc: { ok: false, message: errorMessage(error, "Could not query this RPC endpoint.") } }));
    } finally {
      setVerifying(null);
    }
  }

  async function verifyAndSaveEvmRpc() {
    const rawUrl = settings.evmRpcUrl.trim();
    if (!rawUrl) {
      saveInline();
      setSavedStatus((previous) => ({ ...previous, evmRpc: false }));
      setVerifyResult((previous) => ({ ...previous, evmRpc: { ok: true, message: "Saved. Using the default Robinhood RPC." } }));
      return;
    }

    setVerifying("evm-rpc");
    setVerifyResult((previous) => ({ ...previous, evmRpc: undefined }));
    try {
      const url = new URL(rawUrl);
      if (url.protocol !== "https:" || url.username || url.password) {
        throw new Error("RPC must be a valid HTTPS URL without embedded credentials.");
      }
      const response = await fetch(url.toString(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: "silfable-robinhood-rpc-check", method: "eth_chainId", params: [] }),
      });
      const payload = await response.json().catch(() => null) as { result?: unknown; error?: { message?: unknown } } | null;
      if (!response.ok || payload?.error || typeof payload?.result !== "string") {
        const message = typeof payload?.error?.message === "string" ? payload.error.message : `HTTP ${response.status}`;
        throw new Error(`RPC request failed: ${message}`);
      }
      const chainId = Number.parseInt(payload.result, 16);
      if (chainId !== 4_663) throw new Error(`RPC is connected to chain ${chainId}, not Robinhood Chain (4663).`);
      const blockResponse = await fetch(url.toString(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: "silfable-robinhood-rpc-block-check", method: "eth_getBlockByNumber", params: ["latest", false] }),
      });
      const blockPayload = await blockResponse.json().catch(() => null) as { result?: { number?: unknown }; error?: { message?: unknown } } | null;
      if (!blockResponse.ok || blockPayload?.error || !blockPayload?.result?.number) {
        const message = typeof blockPayload?.error?.message === "string" ? blockPayload.error.message : `HTTP ${blockResponse.status}`;
        throw new Error(`RPC cannot read Robinhood blocks: ${message}`);
      }
      saveInline();
      setSavedStatus((previous) => ({ ...previous, evmRpc: true }));
      setVerifyResult((previous) => ({ ...previous, evmRpc: { ok: true, message: "Robinhood RPC verified for chain ID and latest-block reads, then saved." } }));
    } catch (error) {
      setVerifyResult((previous) => ({ ...previous, evmRpc: { ok: false, message: errorMessage(error, "Could not query this RPC endpoint.") } }));
    } finally {
      setVerifying(null);
    }
  }

  function saveJupiter() {
    saveInline();
    setSavedStatus((previous) => ({ ...previous, jupiter: Boolean(settings.jupiterApiKey.trim()) }));
    setVerifyResult((previous) => ({
      ...previous,
      jupiter: { ok: true, message: settings.jupiterApiKey.trim() ? "Jupiter key saved." : "Saved. Public Jupiter access will be used." },
    }));
  }

  function saveUniswap() {
    saveInline();
    setSavedStatus((previous) => ({ ...previous, uniswap: Boolean(settings.uniswapApiKey.trim()) }));
    setVerifyResult((previous) => ({
      ...previous,
      uniswap: settings.uniswapApiKey.trim()
        ? { ok: true, message: "Uniswap key saved for this browser session." }
        : { ok: false, message: "A Uniswap Trading API key is required for Robinhood swap quotes." },
    }));
  }

  async function loadOpenRouterModels() {
    const apiKey = settings.openRouterApiKey.trim();
    if (!apiKey) {
      setVerifyResult((previous) => ({ ...previous, openrouter: { ok: false, message: "Save an OpenRouter key before loading models." } }));
      return;
    }
    setVerifying("openrouter-models");
    try {
      const response = await fetch("/api/ai/models", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ walletAddress: publicAddress, apiKey }),
      });
      const payload = await response.json() as { models?: OpenRouterModel[]; error?: string };
      if (!response.ok || !Array.isArray(payload.models)) throw new Error(payload.error || "OpenRouter did not return a model catalog.");
      const models = payload.models;
      setOpenRouterModels(models);
      setOpenRouterVerified(true);
      const selectedStillAvailable = models.some((model) => model.id === settings.aiModel);
      if (!selectedStillAvailable && models[0]) updateSettings({ aiModel: models[0].id });
      saveInline();
      setVerifyResult((previous) => ({ ...previous, openrouter: { ok: true, message: `Key verified. ${models.length} models are available to choose from.` } }));
    } catch (error) {
      setOpenRouterVerified(false);
      setOpenRouterModels([]);
      setVerifyResult((previous) => ({ ...previous, openrouter: { ok: false, message: errorMessage(error, "Could not load OpenRouter models.") } }));
    } finally {
      setVerifying(null);
    }
  }

  function continueFromStep() {
    if (activeStep === 3 && (!openRouterVerified || openRouterModels.length === 0)) {
      setVerifyResult((previous) => ({ ...previous, openrouter: { ok: false, message: "Verify the OpenRouter key and choose a model before continuing." } }));
      return;
    }
    if (editingSetup) {
      onSaveSettings();
      return;
    }
    setSetupStep(Math.min(reviewStep, activeStep + 1));
  }

  return (
    <div className="tradeDesktopShell setupScreenLayout">
      <header className="tradeHeader">
        <div className="tradeBrand">
          <Link href="/" className="brandLink">
            <span className="brandMark"><Image src="/logo.png" alt="Silfable Logo" width={20} height={20} className="logoImg" /></span>
            <strong>SILFABLE</strong>
          </Link>
          <span className="setupModeBadge">{editingSetup ? "WEB SETTINGS" : "WEB SETUP"}</span>
        </div>
        <div className="headerActions">
          <div className="networkBadge"><span className="statusDot" /><span>MAINNET · {shortAddress(publicAddress)}</span></div>
          {setupCompleted && <button type="button" onClick={onReturnToWorkspace} className="modeButton">Back to Sessions</button>}
        </div>
      </header>

      <main className="setupContainer">
        <nav className="setupProgress" aria-label="Setup progress">
          {steps.map((label, index) => {
            const step = index + 1;
            return <button type="button" key={label} className={`setupProgressItem ${activeStep === step ? "active" : ""} ${activeStep > step ? "complete" : ""}`} disabled aria-current={activeStep === step ? "step" : undefined}><span className="setupRouteNode">{activeStep > step ? "✓" : String(step).padStart(2, "0")}</span><span className="setupRouteLabel">{label}</span></button>;
          })}
        </nav>

        {editingSetup && !isReview && <div className="editingBar"><span>EDITING · {steps[activeStep - 1]?.toUpperCase()}</span><button type="button" onClick={() => setSetupStep(reviewStep)}>Return to Review</button></div>}

        <section className="setupCard setupRouteCanvas">
          <header className="setupChapterHeader">
            <div className="setupIcon">{isReview ? "OK" : String(activeStep).padStart(2, "0")}</div>
            <div className="setupChapterCopy">
              <span className="setupChapterKicker">Route chapter / {String(activeStep).padStart(2, "0")}</span>
              <h1>{isReview ? (editingSetup ? "EDIT WEB SETTINGS" : "REVIEW WEB WORKSPACE") : steps[activeStep - 1]?.toUpperCase()}</h1>
              <p>{isReview ? "Review the settings used by this browser wallet." : "Web uses the connected browser wallet only. Every Mainnet transaction is approved in that wallet."}</p>
            </div>
          </header>

          <div className="setupBody">
            {activeStep === 1 && <div className="setupStepContent setupNetworkStack">
              <IntegrationCard title="Solana RPC" eyebrow="Primary network" tone="aqua" badge={savedStatus.rpc ? "CUSTOM" : "DEFAULT"} ok={savedStatus.rpc}>
                <p>Use a custom HTTPS RPC only when the default endpoint is slow or rate limited.</p>
                <div className="field"><span>Custom RPC endpoint URL</span><div className="inlineInputAction"><input type="url" value={settings.customRpcUrl} onChange={(event) => updateSettings({ customRpcUrl: event.target.value })} placeholder="https://mainnet.helius-rpc.com/?api-key=..." /><button type="button" className="setupVerifyButton" onClick={verifyAndSaveRpc} disabled={verifying === "rpc"}>{verifying === "rpc" ? "VERIFYING..." : "VERIFY"}</button></div><Result value={verifyResult.rpc} /><small>Leave blank to use the default public RPC.</small></div>
              </IntegrationCard>
              <IntegrationCard title="Robinhood EVM RPC" eyebrow="Connected network" tone="lilac" badge={savedStatus.evmRpc ? "CUSTOM" : "DEFAULT"} ok={savedStatus.evmRpc}>
                <p>Optional HTTPS RPC for Robinhood Chain portfolio reads. Signing still happens only in MetaMask, Rabby, or another connected EVM wallet.</p>
                <div className="field"><span>Custom EVM RPC endpoint URL</span><div className="inlineInputAction"><input type="url" value={settings.evmRpcUrl} onChange={(event) => updateSettings({ evmRpcUrl: event.target.value })} placeholder="https://your-robinhood-rpc.example" /><button type="button" className="setupVerifyButton" onClick={verifyAndSaveEvmRpc} disabled={verifying === "evm-rpc"}>{verifying === "evm-rpc" ? "VERIFYING..." : "VERIFY"}</button></div><Result value={verifyResult.evmRpc} /><small>Endpoint must report chain ID 4663. Also set this same endpoint in MetaMask/Rabby for an existing Robinhood network; wallet extensions keep their own RPC configuration.</small></div>
              </IntegrationCard>
              <IntegrationCard title="Jupiter routing" eyebrow="Primary route" tone="aqua" badge={savedStatus.jupiter ? "CONFIGURED" : "DEFAULT"} ok={savedStatus.jupiter}>
                <p>Used for Solana swap quotes and transaction preparation. A key is optional.</p>
                <div className="field"><span>Jupiter API key</span><div className="inlineInputAction"><input type="password" value={settings.jupiterApiKey} onChange={(event) => updateSettings({ jupiterApiKey: event.target.value })} placeholder={settings.jupiterApiKey ? "Replace saved key" : "Optional Jupiter API key"} autoComplete="off" /><button type="button" className="setupVerifyButton" onClick={saveJupiter}>VERIFY</button></div><Result value={verifyResult.jupiter} /><small>The key is stored only in this browser.</small></div>
              </IntegrationCard>
              <IntegrationCard title="Uniswap Trading API" eyebrow="Connected EVM route" tone="coral" badge={savedStatus.uniswap ? "CONFIGURED" : "REQUIRED FOR EVM SWAPS"} ok={savedStatus.uniswap}>
                <p>Required for USDG ↔ ETH Robinhood Chain quotes. This key stays in this browser session and is sent only to the quote endpoint.</p>
                <div className="field"><span>Uniswap API key</span><div className="inlineInputAction"><input type="password" value={settings.uniswapApiKey} onChange={(event) => updateSettings({ uniswapApiKey: event.target.value })} placeholder={settings.uniswapApiKey ? "Replace saved key" : "Official Uniswap Trading API key"} autoComplete="off" /><button type="button" className="setupVerifyButton" onClick={saveUniswap}>VERIFY</button></div><Result value={verifyResult.uniswap} /><small>Create the key in your Uniswap developer account; web will never place it in a server environment file.</small></div>
              </IntegrationCard>
            </div>}

            {activeStep === 2 && <div className="setupStepContent">
              
              <div className="fieldGrid">
                <NumberField label="Max output tokens" value={settings.outputLimit} onChange={(value) => updateSettings({ outputLimit: value })} />
                <NumberField label="Temperature" value={settings.temperature} step="0.1" onChange={(value) => updateSettings({ temperature: value })} />
                <NumberField label="Max slippage (BPS)" value={settings.maxSlippageBps} onChange={(value) => updateSettings({ maxSlippageBps: value })} />
              </div>
              <small className="securityBoundary">These values affect AI responses and swap quotes only; they never grant signing access.</small>
            </div>}

            {activeStep === 3 && <div className="setupStepContent">
              <IntegrationCard title="OpenRouter provider" badge={openRouterVerified ? "VERIFIED" : "SETUP REQUIRED"} ok={openRouterVerified}>
                <div className="providerStepRows">
                  <div className="field">
                    <span>OpenRouter API key</span>
                    <div className="inlineInputAction">
                      <input
                        type="password"
                        value={settings.openRouterApiKey}
                        onChange={(event) => {
                          updateSettings({ openRouterApiKey: event.target.value });
                          setOpenRouterVerified(false);
                          setOpenRouterModels([]);
                          setVerifyResult((previous) => ({ ...previous, openrouter: undefined }));
                        }}
                        placeholder={settings.openRouterApiKey ? "••••••••••••••••••••••••" : "sk-or-..."}
                        autoComplete="off"
                      />
                      <button
                        type="button"
                        className="setupVerifyButton"
                        onClick={() => void loadOpenRouterModels()}
                        disabled={verifying === "openrouter-models"}
                      >
                        {verifying === "openrouter-models" ? "VERIFYING..." : "VERIFY"}
                      </button>
                    </div>
                    <Result value={verifyResult.openrouter} />
                  </div>
                  <div className="field">
                    <span>AI model</span>
                    <select
                      value={settings.aiModel}
                      onChange={(event) => {
                        updateSettings({ aiModel: event.target.value });
                      }}
                      disabled={!openRouterVerified || openRouterModels.length === 0}
                    >
                      <option value={settings.aiModel}>
                        {openRouterVerified ? settings.aiModel : "Verify key first"}
                      </option>
                      {openRouterModels
                        .filter((model) => model.id !== settings.aiModel)
                        .map((model) => (
                          <option key={model.id} value={model.id}>
                            {model.name} · {model.id}
                          </option>
                        ))}
                    </select>
                    <small>
                      {openRouterVerified
                        ? "Choose a verified OpenRouter model, then click Save and Return to Review below."
                        : "Model selection remains locked until key verification succeeds."}
                    </small>
                  </div>
                </div>
              </IntegrationCard>
            </div>}

            {isReview && <div className="reviewList">
              <ReviewRow title="Connected wallet" detail={`${shortAddress(publicAddress)} · browser wallet only. Disconnect or switch your wallet extension to use another address.`} status="CONNECTED" ok />
              <ReviewRow title="Network" detail={`RPC ${settings.customRpcUrl ? "custom" : "default"} · Jupiter ${settings.jupiterApiKey ? "configured" : "public access"}`} status={settings.customRpcUrl || settings.jupiterApiKey ? "CONFIGURED" : "DEFAULTS"} ok onEdit={() => setSetupStep(1)} />
              <ReviewRow title="Agent" detail={`${settings.outputLimit} max output · temperature ${settings.temperature} · slippage ${settings.maxSlippageBps} bps`} status="SAVED" ok onEdit={() => setSetupStep(2)} />
              <ReviewRow title="Inference provider" detail={settings.openRouterApiKey ? settings.aiModel : "OpenRouter is not configured"} status={settings.openRouterApiKey ? "CONFIGURED" : "REQUIRED FOR AI"} ok={Boolean(settings.openRouterApiKey)} onEdit={() => setSetupStep(3)} />
            </div>}

            <footer className="setupActionsRow">
              {activeStep > 1 && activeStep < reviewStep && !editingSetup && <button type="button" onClick={() => setSetupStep(activeStep - 1)} className="railBtn">Back</button>}
              {activeStep < reviewStep ? <button type="button" onClick={continueFromStep} className="primaryButton">{editingSetup ? "Save and Return to Review" : `Continue to Step ${activeStep + 1}`}</button> : <button type="button" onClick={onSaveSettings} className="primaryButton">{setupCompleted ? "Back to Sessions" : "Finalize Setup"}</button>}
            </footer>
          </div>
        </section>
      </main>
    </div>
  );
}

function IntegrationCard(props: { title: string; eyebrow?: string; tone?: "lilac" | "coral" | "aqua"; badge: string; ok?: boolean; children: ReactNode }) {
  return <section className={`integrationCard setupTone-${props.tone ?? "lilac"}`}><div className="integrationCardHeader"><div>{props.eyebrow && <span className="integrationEyebrow">{props.eyebrow}</span>}<h2>{props.title}</h2></div><span className={`setupStatus ${props.ok ? "ok" : ""}`}>{props.badge}</span></div>{props.children}</section>;
}

function NumberField(props: { label: string; value: string; step?: string; onChange: (value: string) => void }) {
  return <div className="field"><span>{props.label}</span><input type="number" step={props.step} value={props.value} onChange={(event) => props.onChange(event.target.value)} /></div>;
}

function Result(props: { value: { ok: boolean; message: string } | undefined }) {
  if (!props.value) return null;
  return <div className={`setupResult ${props.value.ok ? "ok" : "error"}`}>{props.value.message}</div>;
}

function ReviewRow(props: { title: string; detail: string; status: string; ok: boolean; onEdit?: () => void }) {
  return <div className="reviewRow"><span className={`reviewDot ${props.ok ? "ok" : "warn"}`} /><div className="reviewCopy"><strong>{props.title}</strong><small>{props.detail}</small></div><span className={`setupStatus ${props.ok ? "ok" : "warn"}`}>{props.status}</span>{props.onEdit && <button type="button" className="reviewEdit" onClick={props.onEdit}>Edit</button>}</div>;
}

function shortAddress(address: string) {
  return `${address.slice(0, 5)}...${address.slice(-5)}`;
}
