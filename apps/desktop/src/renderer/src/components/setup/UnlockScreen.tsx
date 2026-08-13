import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Brand, Field, CornerFooter, StatusPill } from "./SetupHelpers";
import { STORAGE_KEY } from "../types";

export function UnlockScreen({ onUnlocked }: { onUnlocked: () => Promise<void> }) {
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetAcknowledged, setResetAcknowledged] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  async function unlock(): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      await window.silfable.unlockVault({
        schemaVersion: 1,
        requestId: crypto.randomUUID(),
        password,
      });
      setPassword("");
      await onUnlocked();
    } catch {
      setPassword("");
      setMessage(
        "Master password is incorrect or the secure vault is unavailable.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function resetVault(): Promise<void> {
    setResetBusy(true);
    setMessage(null);
    try {
      await window.silfable.resetVault({
        schemaVersion: 1,
        requestId: crypto.randomUUID(),
        confirmation: "SET UP NEW VAULT",
        acknowledgedPermanentAccessLoss: true,
      });
      localStorage.removeItem(STORAGE_KEY);
      window.location.reload();
    } catch (error) {
      if (!(error instanceof Error) || !/cancelled/u.test(error.message))
        setMessage(
          "The new vault was not created. Your current encrypted vault remains unchanged.",
        );
      setResetOpen(false);
      setResetAcknowledged(false);
    } finally {
      setResetBusy(false);
    }
  }
  return (
    <main className="onboardingPage">
      <Brand compact={false} />
      <span className="setupModeBadge">Secure access</span>
      <section className="bootCard unlockCard gatewayCanvas">
        <header className="gatewayChapter">
          <span className="gatewayNode">02</span>
          <div>
            <p className="kicker">Vault locked</p>
            <h1>Welcome back.</h1>
            <p>Enter the master password configured on this device.</p>
          </div>
          <span className="gatewayChapterLabel">Route entry / secure access</span>
        </header>
        <div className="gatewayContent unlockGatewayContent">
          <div className="gatewayContentHeader">
            <div>
              <span className="stepCount">ENCRYPTED LOCALLY</span>
              <h2>Open your workspace.</h2>
            </div>
            <StatusPill tone="neutral">LOCKED</StatusPill>
          </div>
          <div className="unlockFormPanel">
            <Field label="Master password">
              <div className="inputWithAction">
                <input
                  autoFocus
                  type={show ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && password) void unlock();
                  }}
                  autoComplete="current-password"
                />
                <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"}>
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </Field>
            {message && <p className="fieldError">{message}</p>}
            <div className="unlockBoundary">
              <span>01</span><p>Unlocking exposes encrypted local settings only to this desktop session.</p>
              <span>02</span><p>Transactions still require their own simulation and explicit approval.</p>
            </div>
          </div>
          <div className="bootActions">
            <button
              className="forgotVaultButton"
              onClick={() => setResetOpen(true)}
            >
              Set up a new vault
            </button>
            <button
              className="primaryButton"
              disabled={!password || busy}
              onClick={() => void unlock()}
            >
              {busy ? "Unlocking…" : "Unlock workspace"} <span>→</span>
            </button>
          </div>
        </div>
      </section>
      {resetOpen && (
        <div className="modalBackdrop" role="presentation">
          <section
            className="resetVaultModal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-vault-title"
          >
            <p className="kicker">Destructive recovery</p>
            <h2 id="reset-vault-title">Set up a new vault?</h2>
            <p>
              This does not recover or decrypt the current vault. Silfable will
              preserve an encrypted backup, then remove the current wallets, API
              configuration, and saved sessions from the active workspace.
            </p>
            <p>
              On-chain funds can be recovered only from an existing seed phrase
              or private key.
            </p>
            <label className="resetAcknowledgement">
              <input
                type="checkbox"
                checked={resetAcknowledged}
                onChange={(event) => setResetAcknowledged(event.target.checked)}
              />
              <span>
                I understand that access to the current vault cannot be
                recovered without its password.
              </span>
            </label>
            <div className="modalActions">
              <button
                disabled={resetBusy}
                onClick={() => {
                  setResetOpen(false);
                  setResetAcknowledged(false);
                }}
              >
                Cancel
              </button>
              <button
                className="dangerButton"
                disabled={!resetAcknowledged || resetBusy}
                onClick={() => void resetVault()}
              >
                {resetBusy ? "Preparing backup…" : "Set up new vault"}
              </button>
            </div>
          </section>
        </div>
      )}
      <CornerFooter />
    </main>
  );
}
