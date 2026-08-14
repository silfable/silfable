"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { ArrowRight, KeyRound, ShieldCheck, Wallet } from "lucide-react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import bs58 from "bs58";
import { requestEvmAccount, signEvmAuthenticationMessage } from "@/lib/evm-browser-wallet";
import { CurrentLabel, CurrentNode, NetworkIdentity, StatusSignal } from "@/components/solar/SolarPrimitives";

type AuthResponse = {
  authenticated?: boolean;
  challengeId?: string;
  message?: string;
  error?: string;
};

async function readAuthResponse(response: Response, fallback: string): Promise<AuthResponse> {
  const raw = await response.text();
  if (!raw) {
    throw new Error(`${fallback} (HTTP ${response.status}, empty response).`);
  }
  try {
    return JSON.parse(raw) as AuthResponse;
  } catch {
    const contentType = response.headers.get("content-type") || "unknown content type";
    throw new Error(
      `${fallback} (HTTP ${response.status}; server returned ${contentType} instead of JSON).`,
    );
  }
}

function ConnectContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedNext = searchParams.get("next") || "/trade";
  const next = requestedNext.startsWith("/") && !requestedNext.startsWith("//")
    ? requestedNext
    : "/trade";
  const { publicKey, connected, signMessage } = useWallet();
  const { setVisible: setSolanaWalletVisible } = useWalletModal();
  const [authState, setAuthState] = useState<"ready" | "signing-evm" | "signing-solana">("ready");
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/wallet/session", { cache: "no-store" })
      .then((response) => readAuthResponse(response, "Wallet session check failed"))
      .then((session) => {
        if (cancelled) return;
        if (session.authenticated === true) {
          router.replace(next);
          return;
        }
        setAuthState("ready");
      })
      .catch(() => {
        if (!cancelled) setAuthState("ready");
      });
    return () => {
      cancelled = true;
    };
  }, [router, next]);

  const authenticateEvmWallet = useCallback(async () => {
    setAuthState("signing-evm");
    setAuthError(null);
    try {
      const account = await requestEvmAccount();
      const challengeResponse = await fetch("/api/auth/wallet/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: account.address, namespace: "evm", chainId: account.chainId }),
      });
      const challenge = await readAuthResponse(
        challengeResponse,
        "EVM authentication challenge is unavailable",
      );
      if (!challengeResponse.ok || typeof challenge.message !== "string") throw new Error(challenge.error || "EVM authentication challenge is unavailable.");
      const signature = await signEvmAuthenticationMessage(account.address, challenge.message);
      const verifyResponse = await fetch("/api/auth/wallet/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId: challenge.challengeId, walletAddress: account.address, signature }),
      });
      const verified = await readAuthResponse(
        verifyResponse,
        "EVM signature verification is unavailable",
      );
      if (!verifyResponse.ok || verified.authenticated !== true) throw new Error(verified.error || "EVM signature could not be verified.");
      router.replace(next);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Autentikasi EVM gagal.");
      setAuthState("ready");
    }
  }, [next, router]);

  const authenticateSolanaWallet = useCallback(async () => {
    setAuthError(null);
    if (!connected || !publicKey) {
      setSolanaWalletVisible(true);
      return;
    }
    if (!signMessage) {
      setAuthError("This Solana wallet does not support message signing.");
      return;
    }
    setAuthState("signing-solana");
    try {
      const walletAddress = publicKey.toBase58();
      const challengeResponse = await fetch("/api/auth/wallet/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress, namespace: "solana" }),
      });
      const challenge = await readAuthResponse(challengeResponse, "Solana authentication challenge is unavailable");
      if (!challengeResponse.ok || typeof challenge.message !== "string") throw new Error(challenge.error || "Solana authentication challenge is unavailable.");
      const signature = bs58.encode(await signMessage(new TextEncoder().encode(challenge.message)));
      const verifyResponse = await fetch("/api/auth/wallet/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId: challenge.challengeId, walletAddress, signature }),
      });
      const verified = await readAuthResponse(verifyResponse, "Solana signature verification is unavailable");
      if (!verifyResponse.ok || verified.authenticated !== true) throw new Error(verified.error || "Solana signature could not be verified.");
      router.replace(next);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Solana authentication failed.");
      setAuthState("ready");
    }
  }, [connected, next, publicKey, router, setSolanaWalletVisible, signMessage]);

  const assurances = [
    {
      icon: KeyRound,
      title: "Authentication only",
      text: "The sign-in signature proves wallet ownership. It does not move funds or approve a later trade.",
    },
    {
      icon: ShieldCheck,
      title: "Confirmation stays separate",
      text: "Every prepared market action still requires its own review and wallet confirmation.",
    },
  ];

  return (
    <main className="publicPage connectPage flex min-h-screen items-start px-4 pb-16 pt-28 sm:px-6 lg:pt-32">
      <div className="connectInstrument mx-auto grid w-full max-w-6xl overflow-hidden border lg:grid-cols-[1.08fr_0.92fr]">
        <div className="connectInstrumentMain relative overflow-hidden p-7 sm:p-10 lg:p-12">
          <CurrentLabel>Wallet sign-in / Silfable Web</CurrentLabel>
          <h1 className="relative max-w-xl text-5xl font-bold leading-[0.94] tracking-[-0.065em] text-[var(--paper)] sm:text-7xl">
            Enter the current.<br />Operate on Solana first.
          </h1>
          <p className="relative mt-7 max-w-xl text-base leading-7 text-[var(--muted)]">
            Sign in with Phantom or Solflare for the primary Solana workspace. EVM wallet access remains available for connected Robinhood workflows. Authentication never approves a transaction.
          </p>

          <div className="connectStepLabel"><span>01</span><strong>Authenticate account access</strong></div>
          <div className="relative mt-4 max-w-xl">
            <button type="button" onClick={() => void authenticateSolanaWallet()} disabled={authState !== "ready"} className="connectEcosystem isSolana mb-3 inline-flex min-h-20 w-full items-center justify-between gap-4 px-5 font-mono text-[10px] font-bold uppercase tracking-[0.15em] disabled:opacity-60">
              <Wallet className="h-4 w-4" />
              <span>{authState === "signing-solana" ? "Awaiting signature" : connected ? "Continue with Solana" : "Connect Solana wallet"}</span>
              <NetworkIdentity network="solana">Primary</NetworkIdentity>
            </button>
            <button type="button" onClick={() => void authenticateEvmWallet()} disabled={authState !== "ready"} className="connectEcosystem isEvm inline-flex min-h-20 w-full items-center justify-between gap-4 px-5 font-mono text-[10px] font-bold uppercase tracking-[0.15em] disabled:opacity-60">
              <Wallet className="h-4 w-4" />
              <span>{authState === "signing-evm" ? "Awaiting signature" : "Connect wallet"}</span>
              <NetworkIdentity network="evm">Connected</NetworkIdentity>
            </button>
            <p className="mt-3 text-xs leading-5 text-[var(--muted)]">Choose one account identity. Other wallets can be linked later without reusing this authentication signature for a transaction.</p>
          </div>
          {authError && (
            <p className="relative mt-4 max-w-xl rounded-xl border border-rose-400/30 bg-rose-400/10 p-3 text-sm leading-relaxed text-rose-300">{authError}</p>
          )}
        </div>

        <div className="connectInstrumentGuide border-t border-[var(--line)] lg:border-l lg:border-t-0">
          <div className="connectFlow p-7 sm:p-8"><div className="flex items-center justify-between gap-4"><CurrentLabel tone="orange">Two authority checkpoints</CurrentLabel><StatusSignal state="muted">No transaction</StatusSignal></div><div className="connectRoutePair mt-7 grid gap-5 sm:grid-cols-2"><CurrentNode label="01 · Authentication" detail="Proves wallet ownership" state="active" /><CurrentNode label="02 · Transaction" detail="Confirmed later per action" /></div></div>
          <div className="connectAssuranceGrid grid sm:grid-cols-2">
          {assurances.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.title} className="connectAssurance border-b border-[var(--line)] p-7 sm:p-8">
                <Icon className="mb-5 h-5 w-5 text-[var(--sc-violet)]" />
                <h2 className="text-xl font-semibold tracking-[-0.04em] text-[var(--paper)]">{item.title}</h2>
                <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{item.text}</p>
              </div>
            );
          })}
          </div>
          <div className="connectAfter p-7 sm:p-8">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-white/75">
              After connecting
            </p>
            <p className="mt-3 text-xl font-semibold tracking-[-0.04em]">
              Verify your wallet, then choose the workflow you want to prepare.
              <ArrowRight className="ml-2 inline h-5 w-5" />
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

import { PageTransition } from "@/components/ui/PageTransition";

export default function ConnectPage() {
  return (
    <PageTransition>
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center bg-[#050505] text-zinc-500">
            Loading workspace...
          </div>
        }
      >
        <ConnectContent />
      </Suspense>
    </PageTransition>
  );
}
