"use client";

import Image from "next/image";

interface TradeHomeStateProps {
  input: string;
  loading?: boolean;
  newSession?: boolean;
  onInputChange: (value: string) => void;
  onSubmit: (prompt?: string) => void;
}

export function TradeHomeState({ input, loading = false, newSession = false, onInputChange, onSubmit }: TradeHomeStateProps) {
  const suggestions = newSession
    ? [
        ["WALLET ACTIVITY", "Review my configured wallet balances and recent finalized activity."],
        ["ROBINHOOD SWAP", "Prepare a Robinhood Chain swap with explicit limits."],
        ["BRIDGE TO SOLANA", "Prepare a Robinhood-to-Solana bridge for review."],
      ]
    : [
        ["AI CAPABILITIES", "Explain exactly what you can and cannot do in this application."],
        ["WALLET ACTIVITY", "Review my configured wallet balances and recent finalized activity."],
        ["PLAN A MISSION", "Draft a conservative accumulation mission with explicit limits."],
        ["RUNTIME SAFETY", "Explain the current Mainnet execution restrictions."],
      ];

  return (
    <div className="homeState flex h-full flex-col items-center justify-center px-6 text-center">
      <span className="brandMark large mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border">
        <Image src="/logo.png" alt="Silfable Logo" width={32} height={32} className="h-8 w-8 object-contain" />
      </span>
      <p className="tagline mb-4 font-mono text-[9px] uppercase tracking-[0.22em]">Robinhood Chain first · Solana connected</p>
      <h1 className={`font-serif text-4xl font-bold leading-tight tracking-tight text-white md:text-5xl ${newSession ? "mb-5" : "mb-10"}`}>
        What should we do on Robinhood Chain?
      </h1>
      {newSession && (
        <p className="mb-8 max-w-lg text-sm leading-6 text-[var(--muted)]">
          Start with a swap, two-way bridge, or another supported workflow. Robinhood is selected by default; Solana remains available.
        </p>
      )}
      <div className="composer mx-auto mb-6 w-full max-w-[680px]">
        <textarea
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onSubmit();
            }
          }}
          placeholder="Plan a Robinhood swap, bridge, or portfolio task..."
          rows={1}
        />
        {newSession && <span>NEW SESSION</span>}
        <button type="button" disabled={!input.trim() || loading} onClick={() => onSubmit()}>↑</button>
      </div>
      <div className="suggestions flex flex-wrap justify-center gap-3">
        {suggestions.map(([label, prompt]) => (
          <button key={label} type="button" onClick={() => onSubmit(prompt)}>{label}</button>
        ))}
      </div>
    </div>
  );
}

export function TradeSessionLoading() {
  return (
    <div className="sessionLoadingState" role="status" aria-live="polite">
      <div className="sessionLoadingRoute" aria-hidden="true"><span /><i /><span /><i /><span /></div>
      <p>Loading session</p>
      <small>Restoring messages and route context</small>
    </div>
  );
}
