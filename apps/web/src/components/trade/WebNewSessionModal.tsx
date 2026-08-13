"use client";

import React, { useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import bs58 from "bs58";
import { requestEvmAccount, signEvmAuthenticationMessage, switchToRobinhoodChain } from "@/lib/evm-browser-wallet";

export type LinkedWebWallet = {
  id: string;
  namespace: "solana" | "evm";
  address: string;
  label?: string | null;
  verifiedAt: string;
};

interface WebNewSessionModalProps {
  isOpen: boolean;
  defaultMode?: "agent" | "mission";
  customEvmRpcUrl?: string;
  linkedWallets: LinkedWebWallet[];
  onWalletLinked: (wallet: LinkedWebWallet) => void;
  onClose: () => void;
  onCancel: () => void;
  onCreateRestrictedSession: (session: {
    title: string;
    mode: "agent" | "mission";
    workspace: "solana" | "evm";
    chainKey?: "robinhood";
    sessionWalletAddress: string;
  }) => Promise<void>;
}

export function WebNewSessionModal({
  isOpen,
  defaultMode = "agent",
  customEvmRpcUrl,
  linkedWallets,
  onWalletLinked,
  onClose,
  onCancel,
  onCreateRestrictedSession,
}: WebNewSessionModalProps) {
  const [title, setTitle] = useState("New Mainnet session");
  const { connected: solanaConnected, publicKey: solanaPublicKey, signMessage: signSolanaMessage } = useWallet();
  const { setVisible: setSolanaWalletVisible } = useWalletModal();
  const [mode, setMode] = useState<"agent" | "mission">(defaultMode);
  const [workspace, setWorkspace] = useState<"solana" | "evm">("evm");
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const evmWallets = useMemo(() => linkedWallets.filter((wallet) => wallet.namespace === "evm"), [linkedWallets]);
  const solanaWallets = useMemo(() => linkedWallets.filter((wallet) => wallet.namespace === "solana"), [linkedWallets]);
  const effectiveEvmAddress = evmWallets[0]?.address || "";
  const effectiveSolanaAddress = solanaWallets[0]?.address || "";

  if (!isOpen) return null;

  async function linkEvmWallet() {
    setLinking(true);
    setError(null);
    try {
      await switchToRobinhoodChain(customEvmRpcUrl);
      const account = await requestEvmAccount();
      if (effectiveEvmAddress) {
        if (account.address.toLowerCase() !== effectiveEvmAddress.toLowerCase()) {
          throw new Error(`This account is already bound to ${shortAddress(effectiveEvmAddress)}. Switch MetaMask/Rabby to that wallet.`);
        }
        return;
      }
      const challengeResponse = await fetch("/api/wallets/evm/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(account),
      });
      const challenge = await challengeResponse.json();
      if (!challengeResponse.ok || typeof challenge.message !== "string") throw new Error(challenge.error || "EVM verification challenge is unavailable.");
      const signature = await signEvmAuthenticationMessage(account.address, challenge.message);
      const verifyResponse = await fetch("/api/wallets/evm/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId: challenge.challengeId, address: account.address, signature, label: "Browser EVM wallet" }),
      });
      const result = await verifyResponse.json();
      if (!verifyResponse.ok || !result.wallet) throw new Error(result.error || "EVM wallet could not be linked.");
      onWalletLinked(result.wallet as LinkedWebWallet);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "EVM wallet could not be linked.");
    } finally {
      setLinking(false);
    }
  }

  async function linkSolanaWallet() {
    if (!solanaConnected || !solanaPublicKey) {
      setSolanaWalletVisible(true);
      return;
    }
    if (!signSolanaMessage) {
      setError("This Solana wallet does not support message signing.");
      return;
    }
    setLinking(true);
    setError(null);
    try {
      const address = solanaPublicKey.toBase58();
      if (effectiveSolanaAddress) {
        if (address !== effectiveSolanaAddress) throw new Error(`This account is already bound to ${shortAddress(effectiveSolanaAddress)}. Switch to that active Solana wallet.`);
        return;
      }
      const challengeResponse = await fetch("/api/wallets/solana/challenge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address }) });
      const challenge = await challengeResponse.json();
      if (!challengeResponse.ok || typeof challenge.message !== "string") throw new Error(challenge.error || "Solana verification challenge is unavailable.");
      const signature = bs58.encode(await signSolanaMessage(new TextEncoder().encode(challenge.message)));
      const verifyResponse = await fetch("/api/wallets/solana/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ challengeId: challenge.challengeId, address, signature, label: "Browser Solana wallet" }) });
      const result = await verifyResponse.json();
      if (!verifyResponse.ok || !result.wallet) throw new Error(result.error || "Solana wallet could not be linked.");
      onWalletLinked(result.wallet as LinkedWebWallet);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Solana wallet could not be linked.");
    } finally {
      setLinking(false);
    }
  }

  async function handleSubmit() {
    const sessionWalletAddress = workspace === "evm" ? effectiveEvmAddress : effectiveSolanaAddress;
    if (!sessionWalletAddress) {
      setError(workspace === "solana" ? "Connect dan verifikasi satu wallet Solana terlebih dahulu." : "Connect dan verifikasi satu wallet Robinhood terlebih dahulu.");
      return;
    }
    if (workspace === "solana") {
      if (!solanaConnected || !solanaPublicKey) {
        setError("Connect wallet Solana terlebih dahulu.");
        setSolanaWalletVisible(true);
        return;
      }
      if (solanaPublicKey.toBase58() !== sessionWalletAddress) {
        setError(`Switch the active Solana account to ${shortAddress(sessionWalletAddress)} before creating a session.`);
        return;
      }
    } else {
      try {
        await switchToRobinhoodChain(customEvmRpcUrl);
        const account = await requestEvmAccount();
        if (account.address.toLowerCase() !== sessionWalletAddress.toLowerCase()) {
          setError(`Switch the active EVM account to ${shortAddress(sessionWalletAddress)} before creating a session.`);
          return;
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Connect wallet Robinhood terlebih dahulu.");
        return;
      }
    }
    await onCreateRestrictedSession({
      title: title.trim() || "New Mainnet session",
      mode,
      workspace,
      chainKey: workspace === "evm" ? "robinhood" : undefined,
      sessionWalletAddress,
    });
    onClose();
  }

  return (
    <div className="modalBackdrop" role="dialog" aria-modal="true" onClick={(event) => {
      if (event.target === event.currentTarget) onCancel();
    }}>
      <section className="sessionModal">
        <header className="sessionModalHeader">
          <div>
            <p className="kicker">New session</p>
            <h2>Your goal. Your wallet. One chain.</h2>
            <p>Every session is bound to one source wallet so the signer can never change silently.</p>
          </div>
          <button className="modalClose" aria-label="Close" onClick={onCancel}>×</button>
        </header>

        <div className="sessionModalBody">
          <section className="sessionConfigSection">
            <div className="sectionLegend"><span>01</span><strong>Session name</strong><small>Used in your session history.</small></div>
            <div>
              <input type="text" value={title} maxLength={80} onChange={(event) => setTitle(event.target.value)} placeholder="Give this session a short name" />
              <div className="fieldMeta"><span>You can start chatting after creation.</span><span>{title.length} / 80</span></div>
            </div>
          </section>

          <section className="sessionConfigSection">
            <div className="sectionLegend"><span>02</span><strong>Workspace</strong><small>Choose the source execution environment.</small></div>
            <div className="choiceGrid sessionWorkspaceChoices">
              {(["evm", "solana"] as const).map((value, index) => (
                <button type="button" key={value} className={workspace === value ? "active" : ""} onClick={() => setWorkspace(value)}>
                  <span className="choiceNumber">0{index + 1}</span>
                  <strong>{value === "evm" ? "Robinhood Chain" : "Solana"}</strong>
                  <small>{value === "evm" ? "Primary · ETH/USDG swap and two-way bridge" : "Connected · Jupiter, Pump.fun, and bridge"}</small>
                </button>
              ))}
            </div>
          </section>

          <section className="sessionConfigSection">
            <div className="sectionLegend"><span>03</span><strong>Wallet and chain</strong><small>The binding is persisted with this session.</small></div>
            <div className="sessionWalletBinding">
              {workspace === "solana" ? (
                <>
                  {effectiveSolanaAddress && <div className="boundWallet"><strong>Solana wallet</strong><span>{shortAddress(effectiveSolanaAddress)}</span></div>}
                  <button type="button" className="linkWalletButton" disabled={linking} onClick={() => void linkSolanaWallet()}>{linking ? "Awaiting wallet signature…" : effectiveSolanaAddress ? "Connect bound Solana wallet" : "+ Connect and verify Solana wallet"}</button>
                </>
              ) : (
                <>
                  {effectiveEvmAddress && <div className="boundWallet"><strong>Robinhood wallet</strong><span>{shortAddress(effectiveEvmAddress)}</span></div>}
                  <button type="button" className="linkWalletButton" disabled={linking} onClick={() => void linkEvmWallet()}>{linking ? "Awaiting wallet signature…" : effectiveEvmAddress ? "Connect bound Robinhood wallet" : "+ Connect and verify Robinhood wallet"}</button>
                </>
              )}
              {workspace === "evm" && <div className="boundWallet"><strong>Execution chain</strong><span>Robinhood Chain · 4663</span></div>}
              {error && <p className="sessionBindingError">{error}</p>}
            </div>
          </section>

          <section className="sessionConfigSection">
            <div className="sectionLegend"><span>04</span><strong>Mode</strong><small>Choose the agent lifecycle.</small></div>
            <div className="choiceGrid">
              <button type="button" className={mode === "agent" ? "active" : ""} onClick={() => setMode("agent")}><span className="choiceNumber">01</span><strong>Agent</strong><small>Interactive analysis and one approved action at a time.</small></button>
              <button type="button" className={mode === "mission" ? "active" : ""} onClick={() => setMode("mission")}><span className="choiceNumber">02</span><strong>Mission</strong><small>Goal-driven workflow with explicit limits and stop conditions.</small></button>
            </div>
          </section>

          <section className="sessionConfigSection">
            <div className="sectionLegend"><span>05</span><strong>Permission</strong><small>Restricted browser-wallet authority.</small></div>
            <div className="choiceGrid"><button type="button" className="active"><span className="choiceNumber">01</span><strong>Restricted</strong><small>Every transaction requires deterministic checks and approval in the bound wallet.</small></button><button type="button" className="unavailableChoice" disabled><span className="choiceNumber">02 · DESKTOP ONLY</span><strong>Full access</strong><small>Unattended local signing is available only through a future paired desktop agent. Web never stores a private key or signs in the cloud.</small></button></div>
          </section>
        </div>

        <footer className="sessionModalFooter"><span>MAINNET — RESTRICTED</span><div className="flex items-center gap-3"><button type="button" className="cancelBtn" onClick={onCancel}>Cancel</button><button type="button" className="createBtn" onClick={() => void handleSubmit()}>Create Session</button></div></footer>
      </section>
    </div>
  );
}

function shortAddress(address: string) {
  return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "Not connected";
}
