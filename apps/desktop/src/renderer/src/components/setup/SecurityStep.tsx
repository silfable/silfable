// @ts-nocheck
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import type { RuntimeStatus } from "@silfable/contracts";
import { SetupCard, Notice, Field, SetupActions } from "./SetupHelpers";

export function SecurityStep({
  runtime,
  onConfigured,
  migration = false,
}: {
  runtime: RuntimeStatus | null;
  onConfigured: (runtime: RuntimeStatus) => void;
  migration?: boolean;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const characterGroups = [
    /[a-z]/u,
    /[A-Z]/u,
    /[0-9]/u,
    /[^a-zA-Z0-9]/u,
  ].filter((pattern) => pattern.test(password)).length;
  const score = Math.min(
    4,
    (password.length >= 8 ? 1 : 0) + Math.min(3, characterGroups),
  );
  const valid =
    password.length >= 8 && characterGroups >= 3 && password === confirm;
  const strengthLabel = !password
    ? "Not entered"
    : valid
      ? "Strong"
      : score < 3
        ? "Weak"
        : "Almost ready";
  async function configure(): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      const response = await window.silfable.configureMasterPassword({
        schemaVersion: 1,
        requestId: crypto.randomUUID(),
        password,
        confirmPassword: confirm,
        acknowledgedPasswordLossRisk: true,
      });
      setPassword("");
      setConfirm("");
      onConfigured(
        runtime
          ? {
              ...runtime,
              keystore: response.keystore,
              masterPassword: response.masterPassword,
            }
          : await window.silfable.getRuntimeStatus(),
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : "";
      if (
        error instanceof TypeError ||
        /not a function|no handler|channel/u.test(detail)
      )
        setMessage(
          "The desktop runtime is outdated. Quit Silfable completely and reopen it before trying again.",
        );
      else if (/already configured/u.test(detail))
        setMessage(
          "A master password is already configured. Reopen Silfable and use the unlock screen.",
        );
      else if (/encryption|secure storage|basic_text/u.test(detail))
        setMessage(
          "Windows secure storage is unavailable. Restart Windows or check the system credential service, then try again.",
        );
      else
        setMessage(
          "Password could not be saved. Restart Silfable and try again.",
        );
    } finally {
      setBusy(false);
    }
  }
  return (
    <SetupCard
      icon="⌾"
      eyebrow="Route chapter / 01"
      className="desktopStepCanvas"
      title={
        migration ? "Secure your existing setup" : "Protect your local vault"
      }
      subtitle={
        migration
          ? "Create the master password that will be required whenever Silfable opens."
          : "Create the access password used to enter Silfable on this machine."
      }
    >
      {migration && (
        <Notice tone="warning" title="One-time security upgrade">
          The earlier build did not persist a password verifier. Create the
          password once here; your wallets and API configuration remain
          unchanged.
        </Notice>
      )}
      <Notice tone="info" title="Local-first security">
        Secrets remain protected by the operating-system vault. This password is
        never written to setup history or logs.
      </Notice>
      <Field label="Master password">
        <div className="inputWithAction">
          <input
            type={show ? "text" : "password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
          />
          <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"}>
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </Field>
      <div className={`strength strength${score}`}>
        <div className="strengthHeader">
          <small>Password strength</small>
          <strong>{strengthLabel}</strong>
        </div>
        <div className="strengthSegments">
          {[1, 2, 3, 4].map((segment) => (
            <span className={segment <= score ? "filled" : ""} key={segment} />
          ))}
        </div>
        <p>
          Minimum 8 characters. Combine at least three: lowercase, uppercase,
          number, or symbol.
        </p>
      </div>
      <Field label="Confirm password">
        <input
          type={show ? "text" : "password"}
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          autoComplete="new-password"
        />
      </Field>
      {confirm && password !== confirm && (
        <p className="fieldError">Passwords do not match.</p>
      )}
      {message && <p className="fieldError">{message}</p>}
      <SetupActions
        step={1}
        onContinue={() => void configure()}
        continueDisabled={!valid || busy}
        continueLabel={
          busy
            ? "Securing vault…"
            : migration
              ? "Save and open workspace"
              : "Save and continue"
        }
      />
    </SetupCard>
  );
}

export function ChangePasswordStep({ onContinue }: { onContinue: () => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const newPasswordGroups = [
    /[a-z]/u,
    /[A-Z]/u,
    /[0-9]/u,
    /[^a-zA-Z0-9]/u,
  ].filter((pattern) => pattern.test(newPassword)).length;
  const valid =
    newPassword.length >= 8 &&
    newPasswordGroups >= 3 &&
    newPassword === confirm &&
    currentPassword.length > 0;
  async function change(): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      await window.silfable.changeMasterPassword({
        schemaVersion: 1,
        requestId: crypto.randomUUID(),
        currentPassword,
        newPassword,
        confirmPassword: confirm,
        acknowledgedPasswordLossRisk: true,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
      setMessage("Master password changed successfully.");
    } catch {
      setMessage(
        "Password was not changed. Check the current password, use at least 8 characters, and make sure the new entries match.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <SetupCard

      eyebrow="Route chapter / 01"
      className="desktopStepCanvas"
      title="Change master password"
      subtitle="Update the password required when Silfable opens."
    >
      <Field label="Current password">
        <input
          type="password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          autoComplete="current-password"
        />
      </Field>
      <Field label="New password">
        <input
          type="password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          autoComplete="new-password"
        />
      </Field>
      <Field label="Confirm new password">
        <input
          type="password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          autoComplete="new-password"
        />
      </Field>
      {message && <p className="inlineMessage">{message}</p>}
      <footer className="setupActions">
        <span>Security · Mainnet only</span>
        <div>
          <button onClick={onContinue}>Return to review</button>
          <button
            className="primaryButton"
            disabled={!valid || busy}
            onClick={() => void change()}
          >
            {busy ? "Changing…" : "Change password"}
          </button>
        </div>
      </footer>
    </SetupCard>
  );
}
