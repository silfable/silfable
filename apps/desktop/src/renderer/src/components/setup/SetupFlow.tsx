// @ts-nocheck
import React, { useState, useEffect, useRef } from "react";
import { shorten } from "../../lib/utils";
import {
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
} from "./SetupHelpers";
import { ChangePasswordStep, SecurityStep } from "./SecurityStep";
import {
  ACTIVITY_LEVELS,
  INTEGRATION_CATEGORIES,
  SETUP_STEPS,
  STORAGE_KEY,
} from "../types";
import { Button, Modal } from "../ui";
import robinhoodLogoUrl from "../../../../assets/robinhood.png";
import solanaLogoUrl from "../../../../assets/solana.svg";
export function SetupFlow({
  setup,
  runtime,
  save,
  setRuntime,
  editing = false,
  onExit,
}: {
  setup: SetupState;
  runtime: RuntimeStatus | null;
  save: (next: SetupState) => void;
  setRuntime: (runtime: RuntimeStatus) => void;
  editing?: boolean;
  onExit?: (() => void) | undefined;
}) {
  const index = Math.max(0, setup.step - 1);
  function next(patch: Partial<SetupState> = {}): void {
    save({
      ...setup,
      ...patch,
      step: editing ? 6 : Math.min(6, setup.step + 1),
    });
  }
  function back(): void {
    save({ ...setup, step: editing ? 6 : Math.max(1, setup.step - 1) });
  }
  function edit(step: number): void {
    save({ ...setup, step });
  }
  const editingLabel = SETUP_STEPS[setup.step - 1] ?? "Setup";
  return (
    <main className="setupPage">
      <header className="setupTopbar">
        <div className="setupTopbarBrand">
          <Brand compact />
          <span className="setupModeBadge">
            {editing ? "Desktop settings" : "Desktop setup"}
          </span>
        </div>
        {editing && onExit && (
          <button className="setupBackLink" onClick={onExit}>
            Back to sessions
          </button>
        )}
      </header>
      <SetupStepper current={index} />

      {setup.step === 1 &&
        (runtime?.masterPassword === "configured" ? (
          <ChangePasswordStep
            onContinue={() => next({ passwordConfigured: true })}
          />
        ) : (
          <SecurityStep
            runtime={runtime}
            onConfigured={(nextRuntime) => {
              setRuntime(nextRuntime);
              next({ passwordConfigured: true });
            }}
          />
        ))}
      {setup.step === 2 && (
        <WalletStep
          runtime={runtime}
          setRuntime={setRuntime}
          onBack={back}
          onContinue={(skipped) => next({ walletSkipped: skipped })}
        />
      )}
      {setup.step === 3 && (
        <IntegrationStep
          setup={setup}
          onBack={back}
          onContinue={(values) => next(values)}
        />
      )}
      {setup.step === 4 && (
        <TuningStep
          setup={setup}
          onBack={back}
          onContinue={(values) => next({ ...values, tuningConfigured: true })}
        />
      )}
      {setup.step === 5 && (
        <ProviderStep
          setup={setup}
          onBack={back}
          onContinue={(model) =>
            next({ providerConfigured: true, providerModel: model })
          }
        />
      )}
      {setup.step === 6 && (
        <ReviewStep
          setup={setup}
          runtime={runtime}
          edit={edit}
          onBack={back}
          onFinalize={() => save({ ...setup, complete: true })}
          editing={editing}
          onExit={onExit}
        />
      )}
      <CornerFooter />
    </main>
  );
}
export function SetupStepper({ current }: { current: number }) {
  return (
    <nav className="setupStepper" aria-label="Setup progress">
      {SETUP_STEPS.map((label, index) => (
        <div
          className={
            index === current ? "active" : index < current ? "done" : ""
          }
          key={label}
        >
          <span>
            {index < current ? "✓" : String(index + 1).padStart(2, "0")}
          </span>
          <small>{label}</small>
        </div>
      ))}
    </nav>
  );
}
export function WalletStep({
  runtime,
  setRuntime,
  onBack,
  onContinue,
}: {
  runtime: RuntimeStatus | null;
  setRuntime: (runtime: RuntimeStatus) => void;
  onBack: () => void;
  onContinue: (skipped: boolean) => void;
}) {
  const [mode, setMode] = useState<"generate" | "mnemonic" | "private">(
    "generate",
  );
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<string | null>(null);
  const [wallets, setWallets] = useState<
    Array<{ address: string; primary: boolean }>
  >([]);
  const [evmMnemonic, setEvmMnemonic] = useState("");
  const [evmPrivateKey, setEvmPrivateKey] = useState("");
  const [evmAddress, setEvmAddress] = useState<string | null>(null);
  const [evmWallets, setEvmWallets] = useState<
    Array<{ address: string; primary: boolean }>
  >([]);
  const [evmRecovery, setEvmRecovery] = useState<string | null>(null);
  const [evmMessage, setEvmMessage] = useState<string | null>(null);
  const [evmMode, setEvmMode] = useState<"generate" | "mnemonic" | "private">(
    "generate",
  );
  const [walletTab, setWalletTab] = useState<"solana" | "evm">("solana");
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const configured = runtime?.wallet === "configured";

  async function handleCopy(address: string): Promise<void> {
    try {
      if (window.silfable?.copyWalletAddress) {
        await window.silfable.copyWalletAddress({
          schemaVersion: 1,
          requestId: crypto.randomUUID(),
          address,
        });
      } else {
        await navigator.clipboard.writeText(address);
      }
      setCopiedAddress(address);
      setTimeout(() => setCopiedAddress(null), 1500);
    } catch (err) {
      console.error("Failed to copy address:", err);
    }
  }

  useEffect(() => {
    if (!configured) return;
    window.silfable
      .listWallets()
      .then((response) => setWallets(response.wallets))
      .catch(() =>
        setMessage("Wallet list could not be opened from the encrypted vault."),
      );
  }, [configured]);

  useEffect(() => {
    window.silfable
      .getEvmWallets()
      .then((result: any) => {
        setEvmAddress(result.address);
        setEvmWallets(result.wallets);
      })
      .catch(() => undefined);
  }, []);

  async function refreshEvmWallets(): Promise<void> {
    const result = await window.silfable.getEvmWallets();
    setEvmAddress(result.address);
    setEvmWallets(result.wallets);
  }

  async function onboard(): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      const base = {
        schemaVersion: 1 as const,
        requestId: crypto.randomUUID(),
        acknowledgedHotWalletRisk: true as const,
      };
      if (mode === "generate") {
        const result = await window.silfable.createWallet(base);
        setRecovery(result.recoveryMnemonic);
        setMessage(
          `Solana address ${shorten(result.address)} created. Mainnet execution requires mission policy, simulation, and final approval.`,
        );
      } else if (mode === "mnemonic") {
        const result = await window.silfable.importWalletMnemonic({
          ...base,
          mnemonic: secret,
        });
        setMessage(`Solana address ${shorten(result.address)} imported.`);
      } else {
        const result = await window.silfable.importWalletPrivateKey({
          ...base,
          privateKey: secret,
        });
        setMessage(`Solana address ${shorten(result.address)} imported.`);
      }
      setSecret("");
      setRuntime(await window.silfable.getRuntimeStatus());
      setWallets((await window.silfable.listWallets()).wallets);
    } catch (error) {
      setSecret("");
      setMessage(
        error instanceof Error
          ? error.message
          : "Wallet operation was rejected safely.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function createEvmWallet(): Promise<void> {
    setBusy(true);
    setEvmMessage(null);
    setEvmRecovery(null);
    try {
      const result = await window.silfable.createRobinhoodWallet({
        schemaVersion: 1,
        requestId: crypto.randomUUID(),
        acknowledgedHotWalletRisk: true,
      });
      await refreshEvmWallets();
      setEvmRecovery(result.recoveryMnemonic);
      setEvmMessage(
        "Robinhood Chain EVM wallet created and encrypted locally.",
      );
    } catch {
      setEvmMessage(
        "EVM wallet could not be created. Check the vault and wallet limit.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function importEvmWallet(): Promise<void> {
    setBusy(true);
    setEvmMessage(null);
    setEvmRecovery(null);
    try {
      await window.silfable.importRobinhoodWalletMnemonic({
        schemaVersion: 1,
        requestId: crypto.randomUUID(),
        mnemonic: evmMnemonic,
        acknowledgedHotWalletRisk: true,
      });
      setEvmMnemonic("");
      await refreshEvmWallets();
      setEvmMessage(
        "Robinhood Chain EVM wallet imported and encrypted locally.",
      );
    } catch {
      setEvmMessage("EVM recovery phrase could not be imported.");
    } finally {
      setBusy(false);
    }
  }

  async function importEvmPrivateKey(): Promise<void> {
    setBusy(true);
    setEvmMessage(null);
    setEvmRecovery(null);
    try {
      await window.silfable.importRobinhoodWalletPrivateKey({
        schemaVersion: 1,
        requestId: crypto.randomUUID(),
        privateKey: evmPrivateKey,
        acknowledgedHotWalletRisk: true,
      });
      setEvmPrivateKey("");
      await refreshEvmWallets();
      setEvmMessage("EVM private key imported and encrypted locally.");
    } catch {
      setEvmMessage(
        "EVM private key could not be imported. Use a 32-byte hexadecimal key.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function clearAllWallets(family: "solana" | "evm"): Promise<void> {
    const label = family === "solana" ? "Solana" : "EVM";
    if (
      !window.confirm(
        `Remove every ${label} wallet from this encrypted vault? Sessions will remain, but they will no longer have a registered wallet.`,
      )
    )
      return;
    setBusy(true);
    try {
      if (family === "solana") {
        const result = await window.silfable.clearWallets({
          schemaVersion: 1,
          requestId: crypto.randomUUID(),
          confirmation: "CLEAR ALL SOLANA WALLETS",
        });
        setWallets([]);
        setRecovery(null);
        setMessage(
          `${result.removed} Solana wallet(s) removed from this device.`,
        );
        setRuntime(await window.silfable.getRuntimeStatus());
      } else {
        const result = await window.silfable.clearEvmWallets({
          schemaVersion: 1,
          requestId: crypto.randomUUID(),
          confirmation: "CLEAR ALL EVM WALLETS",
        });
        setEvmAddress(null);
        setEvmWallets([]);
        setEvmRecovery(null);
        setEvmMessage(
          `${result.removed} EVM wallet(s) removed from this device.`,
        );
      }
    } catch {
      const fallback = `${label} wallets could not be removed. Unlock the vault and try again.`;
      family === "solana" ? setMessage(fallback) : setEvmMessage(fallback);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SetupCard
      icon="◇"
      eyebrow="Route chapter / 02"
      className="desktopStepCanvas"
      title="Set up Mainnet wallets"
      subtitle="Select the wallets a future session may reference. Adding a wallet never authorizes a transaction."
    >
      <div className="chainTabs">
        <button
          className={walletTab === "solana" ? "active" : ""}
          onClick={() => setWalletTab("solana")}
        >
          <span className="walletNetworkIdentity">
            <span className="walletNetworkLogo walletNetworkLogoSolana"><img src={solanaLogoUrl} alt="" /></span>
            <span><strong>Solana</strong><small>Connected ecosystem</small></span>
          </span>
        </button>
        <button
          className={walletTab === "evm" ? "active" : ""}
          onClick={() => setWalletTab("evm")}
        >
          <span className="walletNetworkIdentity">
            <span className="walletNetworkLogo walletNetworkLogoRobinhood"><img src={robinhoodLogoUrl} alt="" /></span>
            <span><strong>Robinhood Chain</strong><small>EVM · Primary network</small></span>
          </span>
        </button>
      </div>
      <div className="walletWorkspace">
      {walletTab === "solana" && (
        <div className="walletNetworkPanel">
          {configured && (
            <div className="configuredReceipt">
              <span>✓</span>
              <div>
                <strong>
                  {wallets.length || 1} Solana wallet
                  {wallets.length === 1 ? "" : "s"} configured
                </strong>
                <small>
                  You can generate or import another wallet below. The first
                  wallet remains primary.
                </small>
              </div>
            </div>
          )}
          {wallets.length > 0 && (
            <div className="walletRegistryBlock">
              <div className="walletList">
                {wallets.map((wallet, index) => (
                  <div key={wallet.address}>
                    <span>0{index + 1}</span>
                    <strong>{shorten(wallet.address)}</strong>
                    {wallet.primary && (
                      <StatusPill tone="success">Primary</StatusPill>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopy(wallet.address)}
                    >
                      {copiedAddress === wallet.address ? "Copied" : "Copy"}
                    </Button>
                  </div>
                ))}
              </div>
              <div className="walletDangerRow">
              <span>Removes local wallet records from this vault.</span>
              <button
                className="secondaryButton dangerButton walletClearButton"
                disabled={busy}
                onClick={() => void clearAllWallets("solana")}
              >
                Clear all Solana wallets
              </button>
              </div>
            </div>
          )}
          <div className="walletMethodPanel">
          <span className="walletSectionLabel">Add wallet</span>
          <div className="segmented walletMethods">
            <button
              className={mode === "generate" ? "active" : ""}
              onClick={() => setMode("generate")}
            >
              Generate new
            </button>
            <button
              className={mode === "mnemonic" ? "active" : ""}
              onClick={() => setMode("mnemonic")}
            >
              Import phrase
            </button>
            <button
              className={mode === "private" ? "active" : ""}
              onClick={() => setMode("private")}
            >
              Import key
            </button>
          </div>
          {mode !== "generate" && (
            <Field
              label={mode === "mnemonic" ? "Recovery phrase" : "Private key"}
            >
              <textarea
                value={secret}
                onChange={(event) => setSecret(event.target.value)}
                rows={3}
                spellCheck={false}
                placeholder={
                  mode === "mnemonic"
                    ? "12 or 24 recovery words"
                    : "Base58 key or JSON byte array"
                }
              />
            </Field>
          )}
          <button
            className="secondaryButton walletPrimaryAction"
            disabled={
              busy ||
              wallets.length >= 3 ||
              (mode !== "generate" && secret.trim().length < 8)
            }
            onClick={() => void onboard()}
          >
            {busy
              ? "Securing wallet…"
              : configured
                ? mode === "generate"
                  ? "Add another wallet"
                  : "Import another wallet"
                : mode === "generate"
                  ? "Generate wallet"
                  : "Import wallet"}
          </button>
          </div>
          {recovery && (
            <Notice tone="danger" title="Write down this recovery phrase">
              {recovery}
            </Notice>
          )}
        </div>
      )}
      {walletTab === "evm" && (
        <section className="advanced transactionGuardSettings walletNetworkPanel walletEvmPanel">
          <strong>Robinhood Chain EVM wallets</strong>
          <small className="providerHint">
            Maximum 3 wallets. Creating or importing never authorizes a
            transaction.
          </small>
          {evmWallets.length > 0 && (
            <>
              <div className="walletList">
                {evmWallets.map((wallet, index) => (
                  <div key={wallet.address}>
                    <span>0{index + 1}</span>
                    <strong>{shorten(wallet.address)}</strong>
                    {wallet.primary && (
                      <StatusPill tone="success">Primary</StatusPill>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopy(wallet.address)}
                    >
                      {copiedAddress === wallet.address ? "Copied" : "Copy"}
                    </Button>
                  </div>
                ))}
              </div>
              <div className="walletDangerRow">
              <span>Removes local wallet records from this vault.</span>
              <button
                className="secondaryButton dangerButton walletClearButton"
                disabled={busy}
                onClick={() => void clearAllWallets("evm")}
              >
                Clear all EVM wallets
              </button>
              </div>
            </>
          )}
          <div className="walletMethodPanel">
          <span className="walletSectionLabel">Add wallet</span>
          <div className="segmented walletMethods">
            <button
              className={evmMode === "generate" ? "active" : ""}
              onClick={() => setEvmMode("generate")}
            >
              Generate new
            </button>
            <button
              className={evmMode === "mnemonic" ? "active" : ""}
              onClick={() => setEvmMode("mnemonic")}
            >
              Import phrase
            </button>
            <button
              className={evmMode === "private" ? "active" : ""}
              onClick={() => setEvmMode("private")}
            >
              Import key
            </button>
          </div>
          {evmMode === "mnemonic" && (
            <Field label="EVM recovery phrase">
              <textarea
                value={evmMnemonic}
                onChange={(event) => setEvmMnemonic(event.target.value)}
                rows={3}
                spellCheck={false}
                placeholder="12 or 24 recovery words"
              />
            </Field>
          )}
          {evmMode === "private" && (
            <Field label="EVM private key">
              <textarea
                value={evmPrivateKey}
                onChange={(event) => setEvmPrivateKey(event.target.value)}
                rows={3}
                spellCheck={false}
                placeholder="0x followed by 64 hexadecimal characters"
              />
            </Field>
          )}
          <button
            className="secondaryButton walletPrimaryAction"
            disabled={
              busy ||
              evmWallets.length >= 3 ||
              (evmMode === "mnemonic" && evmMnemonic.trim().length < 32) ||
              (evmMode === "private" && evmPrivateKey.trim().length < 64)
            }
            onClick={() =>
              void (evmMode === "generate"
                ? createEvmWallet()
                : evmMode === "mnemonic"
                  ? importEvmWallet()
                  : importEvmPrivateKey())
            }
          >
            {busy
              ? "Securing…"
              : evmMode === "generate"
                ? "Generate EVM wallet"
                : evmMode === "mnemonic"
                  ? "Import EVM phrase"
                  : "Import EVM private key"}
          </button>
          </div>
          {evmRecovery && (
            <Notice tone="danger" title="Write down this EVM recovery phrase">
              {evmRecovery}
            </Notice>
          )}
          {evmMessage && <p className="inlineMessage">{evmMessage}</p>}
        </section>
      )}
      </div>
      {false && walletTab === "evm" && (
        <section className="advanced transactionGuardSettings">
          <strong>Robinhood Chain EVM wallet</strong>
          <small className="providerHint">
            Maximum 3 wallets. Separate from Solana; adding one never authorizes
            a transaction.
          </small>
          {evmWallets.length > 0 && (
            <div className="walletList">
              {evmWallets.map((wallet, index) => (
                <div key={wallet.address}>
                  <span>0{index + 1}</span>
                  <strong>{shorten(wallet.address)}</strong>
                  {wallet.primary && (
                    <StatusPill tone="success">Primary</StatusPill>
                  )}
                  <button
                    onClick={() => void copyWalletAddress(wallet.address)}
                  >
                    Copy
                  </button>
                </div>
              ))}
            </div>
          )}
          {evmAddress ? (
            <div className="configuredReceipt">
              <span>âœ“</span>
              <div>
                <strong>EVM wallet configured</strong>
                <small>{evmAddress}</small>
              </div>
            </div>
          ) : (
            <>
              <Field label="Import EVM recovery phrase">
                <textarea
                  value={evmMnemonic}
                  onChange={(event) => setEvmMnemonic(event.target.value)}
                  rows={3}
                  spellCheck={false}
                  placeholder="12 or 24 recovery words"
                />
              </Field>
              <button
                className="secondaryButton"
                disabled={busy || evmMnemonic.trim().length < 32}
                onClick={() => void importEvmWallet()}
              >
                {busy ? "Importing…" : "Import EVM wallet"}
              </button>
              <button
                className="secondaryButton"
                disabled={busy}
                onClick={() => void createEvmWallet()}
              >
                {busy ? "Creating…" : "Create new EVM wallet"}
              </button>
            </>
          )}
          {evmAddress && (
            <>
              <Field label="Import another EVM recovery phrase">
                <textarea
                  value={evmMnemonic}
                  onChange={(event) => setEvmMnemonic(event.target.value)}
                  rows={3}
                  spellCheck={false}
                  placeholder="12 or 24 recovery words"
                />
              </Field>
              <button
                className="secondaryButton"
                disabled={busy || evmMnemonic.trim().length < 32}
                onClick={() => void importEvmWallet()}
              >
                {busy ? "Importing…" : "Import another EVM wallet"}
              </button>
              <button
                className="secondaryButton"
                disabled={busy}
                onClick={() => void createEvmWallet()}
              >
                {busy ? "Creating…" : "Generate another EVM wallet"}
              </button>
            </>
          )}
          <Field label="Import EVM private key">
            <textarea
              value={evmPrivateKey}
              onChange={(event) => setEvmPrivateKey(event.target.value)}
              rows={3}
              spellCheck={false}
              placeholder="0x followed by 64 hexadecimal characters"
            />
          </Field>
          <button
            className="secondaryButton"
            disabled={busy || evmPrivateKey.trim().length < 64}
            onClick={() => void importEvmPrivateKey()}
          >
            {busy ? "Importing…" : "Import EVM private key"}
          </button>
          {evmRecovery && (
            <Notice tone="danger" title="Write down this EVM recovery phrase">
              {evmRecovery}
            </Notice>
          )}
          {evmMessage && <p className="inlineMessage">{evmMessage}</p>}
        </section>
      )}
      {message && <p className="inlineMessage">{message}</p>}
      <SetupActions
        step={2}
        onBack={onBack}
        onContinue={() => onContinue(!configured)}
        secondaryLabel={!configured ? "Continue without wallet" : undefined}
      />
    </SetupCard>
  );
}
export function IntegrationStep({
  setup,
  onBack,
  onContinue,
}: {
  setup: SetupState;
  onBack: () => void;
  onContinue: (value: Pick<SetupState, "jupiterConfigured">) => void;
}) {
  const [jupiterKey, setJupiterKey] = useState("");
  const [jupiterConfigured, setJupiterConfigured] = useState(
    setup.jupiterConfigured,
  );
  const [uniswapKey, setUniswapKey] = useState("");
  const [uniswapConfigured, setUniswapConfigured] = useState(false);
  const [robinhoodRpcUrl, setRobinhoodRpcUrl] = useState("");
  const [robinhoodRpcConfigured, setRobinhoodRpcConfigured] = useState(false);
  const [busyAction, setBusyAction] = useState<
    "jupiter" | "uniswap" | "robinhood-rpc" | null
  >(null);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    window.silfable
      .getJupiterSettings()
      .then((jupiter) => {
        setJupiterConfigured(jupiter.configured);
      })
      .catch(() => undefined);
    window.silfable
      .getUniswapSettings()
      .then((uniswap) => setUniswapConfigured(uniswap.configured))
      .catch(() => undefined);
    window.silfable
      .getEvmSettings()
      .then((settings) =>
        setRobinhoodRpcConfigured(
          settings.chains.find((chain) => chain.chainKey === "robinhood")
            ?.rpcConfigured === true,
        ),
      )
      .catch(() => undefined);
  }, []);
  async function saveKey(): Promise<void> {
    setBusyAction("jupiter");
    setMessage(null);
    try {
      await window.silfable.saveJupiterKey({
        schemaVersion: 1,
        requestId: crypto.randomUUID(),
        apiKey: jupiterKey,
        acknowledgedMainnetMarketData: true,
      });
      setJupiterKey("");
      setJupiterConfigured(true);
      setMessage("Jupiter key encrypted in the local vault.");
    } catch {
      setMessage(
        "Jupiter key could not be stored. Unlock the vault and try again.",
      );
    } finally {
      setBusyAction(null);
    }
  }
  async function saveUniswapKey(): Promise<void> {
    setBusyAction("uniswap");
    setMessage(null);
    try {
      await window.silfable.saveUniswapKey({
        schemaVersion: 1,
        requestId: crypto.randomUUID(),
        apiKey: uniswapKey,
        acknowledgedExternalQuoteProvider: true,
      });
      await window.silfable.testUniswapKey({
        schemaVersion: 1,
        requestId: crypto.randomUUID(),
      });
      setUniswapKey("");
      setUniswapConfigured(true);
      setMessage("Uniswap API key verified and encrypted in the local vault.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? `Uniswap key could not be verified: ${error.message}`
          : "Uniswap key could not be verified. Unlock the vault and try again.",
      );
    } finally {
      setBusyAction(null);
    }
  }
  async function saveRobinhoodRpc(): Promise<void> {
    const rpcUrl = robinhoodRpcUrl.trim();
    if (!rpcUrl) return;
    setBusyAction("robinhood-rpc");
    setMessage(null);
    try {
      const request = {
        schemaVersion: 1 as const,
        requestId: crypto.randomUUID(),
        chainKey: "robinhood" as const,
        rpcUrl,
      };
      await window.silfable.testEvmRpc(request);
      await window.silfable.saveEvmRpcUrl(request);
      setRobinhoodRpcUrl("");
      setRobinhoodRpcConfigured(true);
      setMessage(
        "Robinhood Chain RPC verified and encrypted in the local vault.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? `Robinhood RPC could not be saved: ${error.message}`
          : "Robinhood RPC could not be saved. The default endpoint remains active.",
      );
    } finally {
      setBusyAction(null);
    }
  }
  return (
    <SetupCard
      icon="⌁"
      eyebrow="Route chapter / 03"
      className="desktopStepCanvas"
      title="Connect integrations"
      subtitle="Enable only the external services your sessions need."
    >
      <ProviderCard
        name="Jupiter"
        tag={jupiterConfigured ? "Configured" : "Optional"}
        description="Mainnet Solana quotes, swap routes, and portfolio routing metadata."
      >
        <Field label="Jupiter API key">
          <div className="inputWithAction integrationInputAction">
            <input
              type="password"
              value={jupiterKey}
              onChange={(event) => setJupiterKey(event.target.value)}
              placeholder={
                jupiterConfigured
                  ? "Replace saved key"
                  : "Enter Jupiter API key"
              }
              autoComplete="new-password"
            />
            <Button
              size="sm"
              variant="secondary"
              className="integrationSaveButton"
              loading={busyAction === "jupiter"}
              disabled={busyAction !== null || jupiterKey.trim().length < 8}
              onClick={() => void saveKey()}
            >
              Save
            </Button>
          </div>
        </Field>
        <small className="providerHint">
          Stored encrypted on this device. Leave blank to keep the current key.
        </small>
      </ProviderCard>
      <ProviderCard
        name="Uniswap · Robinhood Chain"
        tag={uniswapConfigured ? "Configured" : "Required for Robinhood swaps"}
        description="Official Uniswap Trading API with Classic routes only and the pinned Universal Router 2.1.1."
      >
        <Field label="Uniswap API key">
          <div className="inputWithAction integrationInputAction">
            <input
              type="password"
              value={uniswapKey}
              onChange={(event) => setUniswapKey(event.target.value)}
              placeholder={
                uniswapConfigured
                  ? "Replace saved key"
                  : "Enter Uniswap API key"
              }
              autoComplete="new-password"
            />
            <Button
              size="sm"
              variant="secondary"
              className="integrationSaveButton"
              loading={busyAction === "uniswap"}
              disabled={busyAction !== null || uniswapKey.trim().length < 8}
              onClick={() => void saveUniswapKey()}
            >
              Verify &amp; save
            </Button>
          </div>
        </Field>
        <small className="providerHint">
          Required only for Robinhood Chain EVM swaps. It is encrypted locally
          and never sent to the AI model.
        </small>
      </ProviderCard>
      <ProviderCard
        name="Robinhood Chain RPC"
        tag={robinhoodRpcConfigured ? "Custom endpoint" : "Default endpoint"}
        description="Optional HTTPS RPC for Robinhood balances, preflight, and transaction verification."
      >
        <Field label="Robinhood HTTPS RPC URL">
          <div className="inputWithAction integrationInputAction">
            <input
              type="url"
              value={robinhoodRpcUrl}
              onChange={(event) => setRobinhoodRpcUrl(event.target.value)}
              placeholder={
                robinhoodRpcConfigured
                  ? "Replace saved Robinhood RPC"
                  : "https://..."
              }
              autoComplete="off"
              spellCheck={false}
            />
            <Button
              size="sm"
              variant="secondary"
              className="integrationSaveButton"
              loading={busyAction === "robinhood-rpc"}
              disabled={
                busyAction !== null || robinhoodRpcUrl.trim().length < 12
              }
              onClick={() => void saveRobinhoodRpc()}
            >
              Verify &amp; save
            </Button>
          </div>
        </Field>
        <small className="providerHint">
          Optional. If no custom endpoint is saved, Silfable uses its verified
          Robinhood default and public fallback endpoints. A saved URL is
          encrypted on this device and is checked against Robinhood Chain ID
          4663 before use.
        </small>
      </ProviderCard>
      {message && <p className="inlineMessage">{message}</p>}
      <SetupActions
        step={3}
        onBack={onBack}
        onContinue={() => onContinue({ jupiterConfigured })}
        secondaryLabel={!jupiterConfigured ? "Skip optional" : undefined}
      />
    </SetupCard>
  );
}
export function TuningStep({
  setup,
  onBack,
  onContinue,
}: {
  setup: SetupState;
  onBack: () => void;
  onContinue: (value: TuningValues) => void;
}) {
  const [contextLimit, setContextLimit] = useState(String(setup.contextLimit));
  const [outputLimit, setOutputLimit] = useState(String(setup.outputLimit));
  const [temperature, setTemperature] = useState(setup.temperature);
  const [subagentMaxConcurrent, setSubagentMaxConcurrent] = useState(
    String(setup.subagentMaxConcurrent),
  );
  const [subagentContextLimit, setSubagentContextLimit] = useState(
    String(setup.subagentContextLimit),
  );
  const [subagentOutputLimit, setSubagentOutputLimit] = useState(
    setup.subagentOutputLimit,
  );
  const [subagentTemperature, setSubagentTemperature] = useState(
    setup.subagentTemperature,
  );
  const [subagentMaxIterations, setSubagentMaxIterations] = useState(
    String(setup.subagentMaxIterations),
  );
  const [subagentTimeoutMs, setSubagentTimeoutMs] = useState(
    String(setup.subagentTimeoutMs),
  );
  const [maxToolCallsPerTurn, setMaxToolCallsPerTurn] = useState(
    String(setup.maxToolCallsPerTurn),
  );
  const [missionMaxSteps, setMissionMaxSteps] = useState(
    String(setup.missionMaxSteps),
  );
  const [retryLimit, setRetryLimit] = useState(String(setup.retryLimit));
  const [maxNetworkFeeLamports, setMaxNetworkFeeLamports] = useState(
    String(setup.maxNetworkFeeLamports),
  );
  const [maxNetworkFeeUnit, setMaxNetworkFeeUnit] = useState<
    "lamports" | "sol" | "usd"
  >("lamports");
  const [solPriceUsd, setSolPriceUsd] = useState<number | null>(null);
  const [maxFeePercent, setMaxFeePercent] = useState(
    String(setup.maxFeePercent),
  );
  const [defaultSlippageBps, setDefaultSlippageBps] = useState(
    String(setup.defaultSlippageBps),
  );
  const [maxSlippageBps, setMaxSlippageBps] = useState(
    String(setup.maxSlippageBps),
  );
  const [defaultDeadlineMinutes, setDefaultDeadlineMinutes] = useState(
    String(setup.defaultDeadlineMinutes),
  );
  const [transactionPriority, setTransactionPriority] = useState<
    TransactionSettings["priority"]
  >(setup.transactionPriority);
  const [pumpRisk, setPumpRisk] = useState({
    maxTradingFeeBps: "500",
    maxSlippageBps: "300",
    maxSpendPerTradeLamports: "50000000",
    maxDailySpendLamports: "200000000",
    maxPerTokenExposureLamports: "100000000",
    maxTotalExposureLamports: "500000000",
    maxOpenPositions: "5",
    maxTransactionsPerHour: "10",
    minSolReserveLamports: "20000000",
  });
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  useEffect(() => {
    window.silfable
      .getTransactionSettings()
      .then(({ settings }) => {
        setMaxNetworkFeeLamports(String(settings.maxNetworkFeeLamports));
        setMaxFeePercent(String(settings.maxFeePercent));
        setDefaultSlippageBps(String(settings.defaultSlippageBps));
        setMaxSlippageBps(String(settings.maxSlippageBps));
        setDefaultDeadlineMinutes(String(settings.defaultDeadlineMinutes));
        setTransactionPriority(settings.priority);
      })
      .catch(() => undefined);
    window.silfable
      .getPumpRiskSettings()
      .then(({ settings }) => {
        setPumpRisk(
          Object.fromEntries(
            Object.entries(settings).map(([key, value]) => [
              key,
              String(value),
            ]),
          ) as typeof pumpRisk,
        );
      })
      .catch(() => undefined);
    window.silfable
      .listWallets()
      .then((res) => {
        const first = res.wallets[0];
        if (first) {
          window.silfable
            .getPortfolio({
              schemaVersion: 1,
              requestId: crypto.randomUUID(),
              address: first.address,
            })
            .then((p) => {
              if (p.snapshot.solUsdPrice)
                setSolPriceUsd(p.snapshot.solUsdPrice);
            })
            .catch(() => undefined);
        }
      })
      .catch(() => undefined);
  }, []);
  const context = Number(contextLimit);
  const output = Number(outputLimit);
  const numeric = {
    subagentMaxConcurrent: Number(subagentMaxConcurrent),
    subagentContextLimit: Number(subagentContextLimit),
    subagentMaxIterations: Number(subagentMaxIterations),
    subagentTimeoutMs: Number(subagentTimeoutMs),
    maxToolCallsPerTurn: Number(maxToolCallsPerTurn),
    missionMaxSteps: Number(missionMaxSteps),
    retryLimit: Number(retryLimit),
    maxNetworkFeeLamports: Number(maxNetworkFeeLamports),
    maxFeePercent: Number(maxFeePercent),
    defaultSlippageBps: Number(defaultSlippageBps),
    maxSlippageBps: Number(maxSlippageBps),
    defaultDeadlineMinutes: Number(defaultDeadlineMinutes),
  };
  const valid =
    Number.isInteger(context) &&
    context >= 1_000 &&
    context <= 2_000_000 &&
    Number.isInteger(output) &&
    output >= 256 &&
    output <= context &&
    (!temperature || (Number(temperature) >= 0 && Number(temperature) <= 2)) &&
    Number.isInteger(numeric.subagentMaxConcurrent) &&
    numeric.subagentMaxConcurrent >= 1 &&
    numeric.subagentMaxConcurrent <= 20 &&
    Number.isInteger(numeric.subagentContextLimit) &&
    numeric.subagentContextLimit >= 1_000 &&
    numeric.subagentContextLimit <= 2_000_000 &&
    (!subagentOutputLimit ||
      (Number.isInteger(Number(subagentOutputLimit)) &&
        Number(subagentOutputLimit) >= 256 &&
        Number(subagentOutputLimit) <= numeric.subagentContextLimit)) &&
    (!subagentTemperature ||
      (Number(subagentTemperature) >= 0 && Number(subagentTemperature) <= 2)) &&
    Number.isInteger(numeric.subagentMaxIterations) &&
    numeric.subagentMaxIterations >= 1 &&
    numeric.subagentMaxIterations <= 200 &&
    Number.isInteger(numeric.subagentTimeoutMs) &&
    numeric.subagentTimeoutMs >= 10_000 &&
    numeric.subagentTimeoutMs <= 1_800_000 &&
    Number.isInteger(numeric.maxToolCallsPerTurn) &&
    numeric.maxToolCallsPerTurn >= 1 &&
    numeric.maxToolCallsPerTurn <= 100 &&
    Number.isInteger(numeric.missionMaxSteps) &&
    numeric.missionMaxSteps >= 1 &&
    numeric.missionMaxSteps <= 500 &&
    Number.isInteger(numeric.retryLimit) &&
    numeric.retryLimit >= 0 &&
    numeric.retryLimit <= 10;
  const transactionValid =
    Number.isInteger(numeric.maxNetworkFeeLamports) &&
    numeric.maxNetworkFeeLamports >= 5_000 &&
    numeric.maxNetworkFeeLamports <= 10_000_000 &&
    Number.isFinite(numeric.maxFeePercent) &&
    numeric.maxFeePercent >= 0.1 &&
    numeric.maxFeePercent <= 100 &&
    Number.isInteger(numeric.defaultSlippageBps) &&
    numeric.defaultSlippageBps >= 0 &&
    numeric.defaultSlippageBps <= 300 &&
    Number.isInteger(numeric.maxSlippageBps) &&
    numeric.maxSlippageBps >= numeric.defaultSlippageBps &&
    numeric.maxSlippageBps <= 300 &&
    Number.isInteger(numeric.defaultDeadlineMinutes) &&
    numeric.defaultDeadlineMinutes >= 5 &&
    numeric.defaultDeadlineMinutes <= 43_200;
  const pumpSettings: PumpRiskSettings = {
    maxTradingFeeBps: Number(pumpRisk.maxTradingFeeBps),
    maxSlippageBps: Number(pumpRisk.maxSlippageBps),
    maxSpendPerTradeLamports: pumpRisk.maxSpendPerTradeLamports,
    maxDailySpendLamports: pumpRisk.maxDailySpendLamports,
    maxPerTokenExposureLamports: pumpRisk.maxPerTokenExposureLamports,
    maxTotalExposureLamports: pumpRisk.maxTotalExposureLamports,
    maxOpenPositions: Number(pumpRisk.maxOpenPositions),
    maxTransactionsPerHour: Number(pumpRisk.maxTransactionsPerHour),
    minSolReserveLamports: pumpRisk.minSolReserveLamports,
  };
  const rawLimitsValid =
    [
      pumpSettings.maxSpendPerTradeLamports,
      pumpSettings.maxDailySpendLamports,
      pumpSettings.maxPerTokenExposureLamports,
      pumpSettings.maxTotalExposureLamports,
    ].every((value) => /^[1-9]\d*$/u.test(value)) &&
    /^\d+$/u.test(pumpSettings.minSolReserveLamports);
  const pumpRiskValid =
    Number.isInteger(pumpSettings.maxTradingFeeBps) &&
    pumpSettings.maxTradingFeeBps >= 1 &&
    pumpSettings.maxTradingFeeBps <= 1_000 &&
    Number.isInteger(pumpSettings.maxSlippageBps) &&
    pumpSettings.maxSlippageBps >= 0 &&
    pumpSettings.maxSlippageBps <= 1_000 &&
    Number.isInteger(pumpSettings.maxOpenPositions) &&
    pumpSettings.maxOpenPositions >= 1 &&
    pumpSettings.maxOpenPositions <= 100 &&
    Number.isInteger(pumpSettings.maxTransactionsPerHour) &&
    pumpSettings.maxTransactionsPerHour >= 1 &&
    pumpSettings.maxTransactionsPerHour <= 100 &&
    rawLimitsValid &&
    BigInt(pumpSettings.maxDailySpendLamports) >=
      BigInt(pumpSettings.maxSpendPerTradeLamports) &&
    BigInt(pumpSettings.maxTotalExposureLamports) >=
      BigInt(pumpSettings.maxPerTokenExposureLamports);
  async function saveAndContinue(): Promise<void> {
    if (!valid || !transactionValid || !pumpRiskValid) return;
    setSaveMessage(null);
    try {
      await window.silfable.saveTransactionSettings({
        schemaVersion: 1,
        requestId: crypto.randomUUID(),
        settings: {
          maxNetworkFeeLamports: numeric.maxNetworkFeeLamports,
          maxFeePercent: numeric.maxFeePercent,
          defaultSlippageBps: numeric.defaultSlippageBps,
          maxSlippageBps: numeric.maxSlippageBps,
          defaultDeadlineMinutes: numeric.defaultDeadlineMinutes,
          priority: transactionPriority,
        },
      });
      await window.silfable.savePumpRiskSettings({
        schemaVersion: 1,
        requestId: crypto.randomUUID(),
        settings: pumpSettings,
      });
      onContinue({
        contextLimit: context,
        outputLimit: output,
        temperature,
        subagentMaxConcurrent: numeric.subagentMaxConcurrent,
        subagentContextLimit: numeric.subagentContextLimit,
        subagentOutputLimit,
        subagentTemperature,
        subagentMaxIterations: numeric.subagentMaxIterations,
        subagentTimeoutMs: numeric.subagentTimeoutMs,
        maxToolCallsPerTurn: numeric.maxToolCallsPerTurn,
        missionMaxSteps: numeric.missionMaxSteps,
        retryLimit: numeric.retryLimit,
        maxNetworkFeeLamports: numeric.maxNetworkFeeLamports,
        maxFeePercent: numeric.maxFeePercent,
        defaultSlippageBps: numeric.defaultSlippageBps,
        maxSlippageBps: numeric.maxSlippageBps,
        defaultDeadlineMinutes: numeric.defaultDeadlineMinutes,
        transactionPriority,
      });
    } catch {
      setSaveMessage("Transaction settings could not be saved.");
    }
  }
  return (
    <SetupCard
      icon="⌘"
      eyebrow="Route chapter / 04"
      className="desktopStepCanvas"
      title="Tune the AI agent"
      subtitle="These defaults are snapshotted when a new session starts."
    >
      <Notice tone="info" title="Restricted by default">
        Tool calls, mission steps, and model spending remain bounded
        independently of model output.
      </Notice>
      <Field label="Context budget">
        <input
          inputMode="numeric"
          value={contextLimit}
          onChange={(event) => setContextLimit(event.target.value)}
        />
        <small>
          1,000–2,000,000 tokens; revalidated against the selected model.
        </small>
      </Field>
      <Field label="Maximum output tokens">
        <input
          inputMode="numeric"
          value={outputLimit}
          onChange={(event) => setOutputLimit(event.target.value)}
        />
        <small>Must not exceed the context budget.</small>
      </Field>
      <Field label="Temperature">
        <input
          inputMode="decimal"
          value={temperature}
          onChange={(event) => setTemperature(event.target.value)}
          placeholder="Provider default"
        />
        <small>Optional · range 0–2.</small>
      </Field>
      <div className="tuningSectionHeader">Transaction guard</div>
      <div className="advancedGrid">
        <Field
          label={`Maximum network fee (${maxNetworkFeeUnit.toUpperCase()})`}
        >
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <input
              inputMode={
                maxNetworkFeeUnit === "lamports" ? "numeric" : "decimal"
              }
              value={
                maxNetworkFeeUnit === "lamports"
                  ? maxNetworkFeeLamports
                  : maxNetworkFeeUnit === "sol"
                    ? String(Number(maxNetworkFeeLamports) / 1e9)
                    : solPriceUsd
                      ? String(
                          Number(
                            (
                              (Number(maxNetworkFeeLamports) / 1e9) *
                              solPriceUsd
                            ).toFixed(4),
                          ),
                        )
                      : maxNetworkFeeLamports
              }
              onChange={(event) => {
                const val = event.target.value;
                if (maxNetworkFeeUnit === "lamports") {
                  setMaxNetworkFeeLamports(val);
                } else if (maxNetworkFeeUnit === "sol") {
                  const num = parseFloat(val);
                  setMaxNetworkFeeLamports(
                    isNaN(num) ? "" : String(Math.round(num * 1e9)),
                  );
                } else if (maxNetworkFeeUnit === "usd" && solPriceUsd) {
                  const num = parseFloat(val);
                  setMaxNetworkFeeLamports(
                    isNaN(num)
                      ? ""
                      : String(Math.round((num / solPriceUsd) * 1e9)),
                  );
                }
              }}
            />
            <select
              value={maxNetworkFeeUnit}
              onChange={(e) =>
                setMaxNetworkFeeUnit(
                  e.target.value as "lamports" | "sol" | "usd",
                )
              }
              style={{ padding: "6px 10px", borderRadius: "6px" }}
            >
              <option value="lamports">Lamports</option>
              <option value="sol">SOL</option>
              <option value="usd" disabled={!solPriceUsd}>
                USD {!solPriceUsd ? "(No Price)" : ""}
              </option>
            </select>
          </div>
          <small>
            {maxNetworkFeeUnit === "lamports" &&
              "5,000–10,000,000. Execution is blocked above this value."}
            {maxNetworkFeeUnit === "sol" &&
              `Stored as ${Number(maxNetworkFeeLamports).toLocaleString()} lamports (range: 0.000005–0.01 SOL).`}
            {maxNetworkFeeUnit === "usd" &&
              (solPriceUsd
                ? `Converted at $${solPriceUsd}/SOL (${Number(maxNetworkFeeLamports).toLocaleString()} lamports).`
                : "Price feed unavailable.")}
          </small>
        </Field>
        <Field label="Maximum fee percentage">
          <input
            inputMode="decimal"
            value={maxFeePercent}
            onChange={(event) => setMaxFeePercent(event.target.value)}
          />
          <small>Percentage of the proposed input value.</small>
        </Field>
        <Field label="Default slippage (bps)">
          <input
            inputMode="numeric"
            value={defaultSlippageBps}
            onChange={(event) => setDefaultSlippageBps(event.target.value)}
          />
          <small>Used as the recommended mission default.</small>
        </Field>
        <Field label="Maximum slippage (bps)">
          <input
            inputMode="numeric"
            value={maxSlippageBps}
            onChange={(event) => setMaxSlippageBps(event.target.value)}
          />
          <small>
            Hard ceiling for AI drafts, simulations, Pump proposals, and limit
            orders. Must be at least the default and no more than 300 bps.
          </small>
        </Field>
        <Field label="Default deadline (minutes)">
          <input
            inputMode="numeric"
            value={defaultDeadlineMinutes}
            onChange={(event) => setDefaultDeadlineMinutes(event.target.value)}
          />
          <small>Range 5 minutes–30 days.</small>
        </Field>
        <Field label="Priority preference">
          <select
            value={transactionPriority}
            onChange={(event) =>
              setTransactionPriority(
                event.target.value as TransactionSettings["priority"],
              )
            }
          >
            <option value="economy">Economy</option>
            <option value="standard">Standard</option>
            <option value="fast">Fast</option>
          </select>
          <small>
            Preference is applied to Jupiter transaction order construction
            (Economy / Standard / Fast). Absolute fee guard always wins.
          </small>
        </Field>
      </div>
      <div className="tuningSectionHeader">Pump.fun hard risk limits</div>
      <p
        className="fieldHint"
        style={{ margin: "0 0 10px", color: "var(--muted)", fontSize: "11px" }}
      >
        These local limits override AI output and are checked again before every
        unsigned simulation.
      </p>
      <div className="advancedGrid">
        <Field label="Maximum trading fee (bps)">
          <input
            inputMode="numeric"
            value={pumpRisk.maxTradingFeeBps}
            onChange={(event) =>
              setPumpRisk({ ...pumpRisk, maxTradingFeeBps: event.target.value })
            }
          />
          <small>Protocol plus creator fee ceiling.</small>
        </Field>
        <Field label="Maximum Pump slippage (bps)">
          <input
            inputMode="numeric"
            value={pumpRisk.maxSlippageBps}
            onChange={(event) =>
              setPumpRisk({ ...pumpRisk, maxSlippageBps: event.target.value })
            }
          />
          <small>A Pump proposal cannot exceed this value.</small>
        </Field>
        <Field label="Spend per trade (lamports)">
          <input
            inputMode="numeric"
            value={pumpRisk.maxSpendPerTradeLamports}
            onChange={(event) =>
              setPumpRisk({
                ...pumpRisk,
                maxSpendPerTradeLamports: event.target.value,
              })
            }
          />
        </Field>
        <Field label="Spend per day (lamports)">
          <input
            inputMode="numeric"
            value={pumpRisk.maxDailySpendLamports}
            onChange={(event) =>
              setPumpRisk({
                ...pumpRisk,
                maxDailySpendLamports: event.target.value,
              })
            }
          />
        </Field>
        <Field label="Exposure per token (lamports)">
          <input
            inputMode="numeric"
            value={pumpRisk.maxPerTokenExposureLamports}
            onChange={(event) =>
              setPumpRisk({
                ...pumpRisk,
                maxPerTokenExposureLamports: event.target.value,
              })
            }
          />
        </Field>
        <Field label="Total Pump exposure (lamports)">
          <input
            inputMode="numeric"
            value={pumpRisk.maxTotalExposureLamports}
            onChange={(event) =>
              setPumpRisk({
                ...pumpRisk,
                maxTotalExposureLamports: event.target.value,
              })
            }
          />
        </Field>
        <Field label="Maximum open positions">
          <input
            inputMode="numeric"
            value={pumpRisk.maxOpenPositions}
            onChange={(event) =>
              setPumpRisk({ ...pumpRisk, maxOpenPositions: event.target.value })
            }
          />
        </Field>
        <Field label="Transactions per hour">
          <input
            inputMode="numeric"
            value={pumpRisk.maxTransactionsPerHour}
            onChange={(event) =>
              setPumpRisk({
                ...pumpRisk,
                maxTransactionsPerHour: event.target.value,
              })
            }
          />
        </Field>
        <Field label="Minimum SOL reserve (lamports)">
          <input
            inputMode="numeric"
            value={pumpRisk.minSolReserveLamports}
            onChange={(event) =>
              setPumpRisk({
                ...pumpRisk,
                minSolReserveLamports: event.target.value,
              })
            }
          />
          <small>
            Proposals are blocked if spend plus maximum network fee would cross
            this floor.
          </small>
        </Field>
      </div>
      {!pumpRiskValid && (
        <p className="fieldError">
          Pump limits are invalid. Daily spend must cover one trade and total
          exposure must cover per-token exposure.
        </p>
      )}
      <details className="advanced">
        <summary>Advanced agent and subagent tuning</summary>
        <div className="advancedGrid">
          <Field label="Concurrent subagents">
            <input
              inputMode="numeric"
              value={subagentMaxConcurrent}
              onChange={(event) => setSubagentMaxConcurrent(event.target.value)}
            />
            <small>Range 1–20.</small>
          </Field>
          <Field label="Subagent context limit">
            <input
              inputMode="numeric"
              value={subagentContextLimit}
              onChange={(event) => setSubagentContextLimit(event.target.value)}
            />
            <small>Range 1,000–2,000,000.</small>
          </Field>
          <Field label="Subagent output tokens">
            <input
              inputMode="numeric"
              value={subagentOutputLimit}
              onChange={(event) => setSubagentOutputLimit(event.target.value)}
              placeholder="Inherit agent output"
            />
            <small>Optional · up to subagent context.</small>
          </Field>
          <Field label="Subagent temperature">
            <input
              inputMode="decimal"
              value={subagentTemperature}
              onChange={(event) => setSubagentTemperature(event.target.value)}
              placeholder="Inherit agent temperature"
            />
            <small>Optional · range 0–2.</small>
          </Field>
          <Field label="Subagent max iterations">
            <input
              inputMode="numeric"
              value={subagentMaxIterations}
              onChange={(event) => setSubagentMaxIterations(event.target.value)}
            />
            <small>Range 1–200.</small>
          </Field>
          <Field label="Subagent timeout (ms)">
            <input
              inputMode="numeric"
              value={subagentTimeoutMs}
              onChange={(event) => setSubagentTimeoutMs(event.target.value)}
            />
            <small>10,000–1,800,000 ms.</small>
          </Field>
          <Field label="Tool calls per turn">
            <input
              inputMode="numeric"
              value={maxToolCallsPerTurn}
              onChange={(event) => setMaxToolCallsPerTurn(event.target.value)}
            />
            <small>Range 1–100.</small>
          </Field>
          <Field label="Mission maximum steps">
            <input
              inputMode="numeric"
              value={missionMaxSteps}
              onChange={(event) => setMissionMaxSteps(event.target.value)}
            />
            <small>Range 1–500.</small>
          </Field>
          <Field label="Non-mutating retry limit">
            <input
              inputMode="numeric"
              value={retryLimit}
              onChange={(event) => setRetryLimit(event.target.value)}
            />
            <small>Mutating actions are never blindly retried.</small>
          </Field>
        </div>
      </details>
      <SetupActions
        step={4}
        onBack={onBack}
        onContinue={() => void saveAndContinue()}
        continueDisabled={!valid || !transactionValid || !pumpRiskValid}
      />
      {saveMessage && <p className="inlineMessage">{saveMessage}</p>}
    </SetupCard>
  );
}
export function ProviderStep({
  setup,
  onBack,
  onContinue,
}: {
  setup: SetupState;
  onBack: () => void;
  onContinue: (model: string) => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [models, setModels] = useState<OpenRouterModelView[]>([]);
  const [model, setModel] = useState(setup.providerModel);
  const [storedConfigured, setStoredConfigured] = useState(
    setup.providerConfigured,
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    window.silfable
      .getAiSettings()
      .then((response) => {
        const saved = response.providers.find(
          (provider) => provider.provider === "openrouter",
        );
        if (!saved?.configured) return;
        setStoredConfigured(true);
        setModel((current) => current || saved.model);
        setMessage(
          "OpenRouter is already configured. Enter a new key only to replace it.",
        );
      })
      .catch(() => undefined);
  }, []);
  async function loadModels(): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      const response = await window.silfable.previewOpenRouterModels({
        schemaVersion: 1,
        requestId: crypto.randomUUID(),
        apiKey,
        acknowledgedExternalProcessing: true,
      });
      setModels(response.models);
      setModel(response.models[0]?.id ?? "");
      setMessage(`${response.models.length} compatible models verified.`);
    } catch {
      setMessage(
        "OpenRouter rejected the key or the model catalog is unavailable.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function saveProvider(): Promise<void> {
    if (storedConfigured && apiKey.trim().length === 0 && model) {
      onContinue(model);
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await window.silfable.saveAiProvider({
        schemaVersion: 1,
        requestId: crypto.randomUUID(),
        provider: "openrouter",
        apiKey,
        model,
        acknowledgedExternalProcessing: true,
      });
      setStoredConfigured(true);
      setMessage(
        "OpenRouter key encrypted. The key will not be displayed again.",
      );
      onContinue(model);
    } catch {
      setMessage("OpenRouter configuration was not saved.");
    } finally {
      setBusy(false);
    }
  }
  const selected = models.find((item) => item.id === model);
  return (
    <SetupCard
      icon="◈"
      eyebrow="Route chapter / 05"
      className="desktopStepCanvas"
      title="Choose the inference provider"
      subtitle="OpenRouter supplies the model; Silfable keeps authority and tool enforcement local."
    >
      <Field label="OpenRouter API key">
        <div className="inputWithAction integrationInputAction">
          <input
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            autoComplete="new-password"
            placeholder={
              storedConfigured ? "Enter a new key to reconfigure" : "sk-or-…"
            }
          />
          <Button
            size="sm"
            variant="secondary"
            className="integrationSaveButton"
            loading={busy}
            disabled={busy || apiKey.trim().length < 8}
            onClick={() => void loadModels()}
          >
            Verify
          </Button>
        </div>
      </Field>
      <Field label="Compatible model">
        <select
          value={model}
          onChange={(event) => setModel(event.target.value)}
          disabled={models.length === 0}
        >
          {storedConfigured && model ? (
            <option value={model}>{model} · saved</option>
          ) : (
            <option value="">Verify a key to load models</option>
          )}
          {models
            .filter((item) => item.id !== model)
            .map((item) => (
              <option value={item.id} key={item.id}>
                {item.name} · {item.contextLength.toLocaleString()} ctx
              </option>
            ))}
        </select>
      </Field>
      {selected && (
        <div className="modelMeta">
          <span>{selected.id}</span>
          <span>{selected.supportsTools ? "Tools" : "No tools"}</span>
          <span>Structured output</span>
          <span>{selected.contextLength.toLocaleString()} context</span>
        </div>
      )}
      <Notice tone="warning" title="External processing">
        Session prompts are sent to OpenRouter after you create a session.
        Wallet keys, API keys, and signing material are never included.
      </Notice>
      {message && <p className="inlineMessage">{message}</p>}
      <SetupActions
        step={5}
        onBack={onBack}
        onContinue={() => void saveProvider()}
        continueDisabled={
          !model || (!storedConfigured && apiKey.trim().length < 8) || busy
        }
        continueLabel={
          storedConfigured && !apiKey ? "Continue with saved" : "Save provider"
        }
      />
    </SetupCard>
  );
}
export function ReviewStep({
  setup,
  runtime,
  edit,
  onBack,
  onFinalize,
  editing = false,
  onExit,
}: {
  setup: SetupState;
  runtime: RuntimeStatus | null;
  edit: (step: number) => void;
  onBack: () => void;
  onFinalize: () => void;
  editing?: boolean;
  onExit?: (() => void) | undefined;
}) {
  const rows = [
    {
      title: "Local security",
      state: setup.passwordConfigured ? "Configured" : "Blocked",
      detail: "OS-backed encrypted vault · local access policy",
      step: 1,
      ok: setup.passwordConfigured,
    },
    {
      title: "Wallets",
      state:
        runtime?.wallet === "configured" ? "Configured" : "Optional missing",
      detail:
        runtime?.wallet === "configured"
          ? "Solana wallet registry · restricted Mainnet approval"
          : "No wallet-bound tools",
      step: 2,
      ok: runtime?.wallet === "configured",
    },
    {
      title: "Trading integrations",
      state: setup.jupiterConfigured ? "Configured" : "Optional missing",
      detail: `Jupiter ${setup.jupiterConfigured ? "configured" : "not set"} · EVM routing uses chain defaults`,
      step: 3,
      ok: setup.jupiterConfigured,
    },
    {
      title: "Agent core",
      state: "Saved",
      detail: `${setup.contextLimit.toLocaleString()} context · ${setup.outputLimit.toLocaleString()} output · ${setup.subagentMaxConcurrent} subagents`,
      step: 4,
      ok: true,
    },
    {
      title: "Inference",
      state: setup.providerConfigured ? "Configured" : "Blocked",
      detail: setup.providerModel || "OpenRouter is required for Agent/Mission",
      step: 5,
      ok: setup.providerConfigured,
    },
  ];
  return (
    <SetupCard
      icon="✓"
      eyebrow="Route chapter / 06"
      className={editing ? "desktopSettingsCanvas" : "desktopReviewCanvas"}
      title={editing ? "Edit infrastructure" : "Review your setup"}
      subtitle={
        editing
          ? "Review current settings and edit only the section you need."
          : "Confirm the capabilities available before entering the Mainnet workspace."
      }
    >
      <div className="reviewList">
        {rows.map((row) => (
          <div className="reviewRow" key={row.title}>
            <span className={row.ok ? "dot ok" : "dot warn"} />
            <div>
              <strong>{row.title}</strong>
              <small>{row.detail}</small>
            </div>
            <StatusPill tone={row.ok ? "success" : "warning"}>
              {row.state}
            </StatusPill>
            <button onClick={() => edit(row.step)}>Edit</button>
          </div>
        ))}
      </div>

      {false && editing && (
        <details className="advanced">
          <summary>Advanced safety · Emergency stop</summary>
          <p>
            Use only when a prepared transaction or local strategy must be
            halted immediately. Normal sessions do not require this control.
          </p>
          <div className="advancedSafetyPanel">
            <EmergencyStopPanel />
          </div>
        </details>
      )}
      {editing ? (
        <footer className="setupActions settingsActions">
          <span>Settings · Mainnet only</span>
          <div>
            <button className="primaryButton" onClick={onExit}>
              Back to sessions
            </button>
          </div>
        </footer>
      ) : (
        <SetupActions
          step={6}
          onBack={onBack}
          onContinue={onFinalize}
          continueDisabled={
            !setup.passwordConfigured || !setup.providerConfigured
          }
          continueLabel="Finalize setup"
        />
      )}
    </SetupCard>
  );
}
