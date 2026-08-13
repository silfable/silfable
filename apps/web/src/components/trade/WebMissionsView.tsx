"use client";

import type { SessionItem } from "@/lib/db";

type WebMissionsViewProps = {
  sessions: SessionItem[];
  onCreateMission: () => void;
  onOpenSession: (sessionId: string) => void;
};

function formatWorkspace(session: SessionItem): string {
  return session.workspace === "evm" ? "Robinhood Chain" : "Solana";
}

export function WebMissionsView({ sessions, onCreateMission, onOpenSession }: WebMissionsViewProps) {
  if (sessions.length === 0) {
    return (
      <div className="flex h-full flex-col items-start justify-center px-[clamp(40px,9vw,120px)]">
        <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--blue-2)]">Missions</p>
        <h1 className="mt-2 max-w-[720px] text-[clamp(42px,5vw,80px)] font-semibold leading-[.95] tracking-[-0.055em] text-[var(--paper)]">No mission contracts yet.</h1>
        <p className="mt-[18px] max-w-[620px] text-sm leading-7 text-[var(--muted)]">Create a Mission session and provide exact token amounts, slippage limit, deadline, and stop conditions. Every Mainnet transaction will remain bound to its browser wallet.</p>
        <button type="button" onClick={onCreateMission} className="mt-7 rounded-full border border-[color-mix(in_srgb,var(--electric)_65%,transparent)] bg-[color-mix(in_srgb,var(--electric)_14%,transparent)] px-5 py-3 font-mono text-[10px] uppercase tracking-[0.13em] text-[var(--paper)] transition hover:bg-[color-mix(in_srgb,var(--electric)_24%,transparent)]">
          Create Mission session
        </button>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-[clamp(38px,6vw,82px)] py-[clamp(38px,6vw,82px)]">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--blue-2)]">Missions</p>
          <h1 className="my-2 text-[42px] font-semibold tracking-[-0.04em] text-[var(--paper)]">Contract previews</h1>
          <p className="max-w-xl text-sm leading-6 text-[var(--muted)]">Open an eligible session to review its constrained plan and explicitly approve a restricted Mainnet action.</p>
        </div>
        <button type="button" onClick={onCreateMission} className="rounded-full border border-[color-mix(in_srgb,var(--electric)_65%,transparent)] bg-[color-mix(in_srgb,var(--electric)_14%,transparent)] px-4 py-2.5 font-mono text-[9px] uppercase tracking-[0.13em] text-[var(--paper)] transition hover:bg-[color-mix(in_srgb,var(--electric)_24%,transparent)]">
          + New mission
        </button>
      </div>

      <div className="mt-[30px] grid grid-cols-[repeat(auto-fill,minmax(250px,320px))] justify-start gap-3">
        {sessions.map((session) => (
          <button key={session.id} type="button" onClick={() => onOpenSession(session.id)} className="flex min-h-[150px] flex-col items-start gap-[9px] rounded-[10px] border border-[color-mix(in_srgb,var(--electric)_22%,var(--line))] bg-[color-mix(in_srgb,var(--panel)_94%,transparent)] p-[18px] text-left text-[var(--paper)] transition hover:-translate-y-px hover:border-[var(--electric)]">
            <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-[var(--blue-2)]">Mission session</span>
            <strong className="text-sm leading-[1.4]">{session.title}</strong>
            <small className="text-[9px] text-[var(--muted)]">{formatWorkspace(session)} · {new Date(session.updatedAt).toLocaleString()}</small>
            <em className="mt-auto font-mono text-[8px] uppercase tracking-[0.12em] text-[var(--blue-2)] not-italic">Open session</em>
          </button>
        ))}
      </div>
    </div>
  );
}
