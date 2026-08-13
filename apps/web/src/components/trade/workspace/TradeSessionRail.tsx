"use client";

import Image from "next/image";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import type { SessionItem } from "@/lib/db";
import { getWebEvmChain } from "@/lib/evm-chains";

type SessionFilter = "all" | "agent" | "mission";
type WorkspaceView = "chat" | "missions" | "automation";

interface TradeSessionRailProps {
  sessions: SessionItem[];
  activeSessionId: string;
  sessionFilter: SessionFilter;
  workspaceView: WorkspaceView;
  onFilterChange: (filter: SessionFilter) => void;
  onNewSession: () => void;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string, event: React.MouseEvent) => void;
  onDeleteAll: () => void;
  onViewChange: (view: WorkspaceView) => void;
  onOpenSettings: () => void;
  onSignOut: () => void;
}

function shortWallet(address?: string): string {
  return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "Not linked";
}

function sessionMeta(session: SessionItem): string {
  if (session.workspace === "evm") {
    return `${getWebEvmChain(session.chainKey ?? "")?.name ?? "EVM"} · ${shortWallet(session.sessionWalletAddress)}`;
  }
  return `Solana · ${new Date(session.updatedAt).toLocaleTimeString()}`;
}

export function TradeSessionRail({
  sessions,
  activeSessionId,
  sessionFilter,
  workspaceView,
  onFilterChange,
  onNewSession,
  onSelectSession,
  onDeleteSession,
  onDeleteAll,
  onViewChange,
  onOpenSettings,
  onSignOut,
}: TradeSessionRailProps) {
  const visibleSessions = sessions.filter((session) =>
    sessionFilter === "all"
    || session.filter === sessionFilter
    || (sessionFilter === "mission" && session.filter === "pump"));

  return (
    <aside className="leftRail">
      <Link href="/trade" className="railBrand" title="Silfable Web Workspace">
        <div className="railBrandLogo">
          <Image src="/logo.png" alt="Silfable Logo" width={26} height={26} className="h-6 w-6 object-contain" />
        </div>
        <span className="railBrandTitle">SILFABLE</span>
      </Link>

      <button type="button" onClick={onNewSession} className="newSession">+ NEW SESSION</button>

      <div className="sessionFilters">
        {(["all", "agent", "mission"] as const).map((filter) => (
          <button key={filter} type="button" onClick={() => onFilterChange(filter)} className={sessionFilter === filter ? "active" : ""}>
            {filter}
          </button>
        ))}
      </div>

      <div className="sessionList">
        <div className="sessionListHeader">
          <p>SESSIONS</p>
          <button type="button" onClick={onDeleteAll} disabled={sessions.length === 0} title="Delete all sessions and messages">
            <Trash2 className="size-3" /> Clear all
          </button>
        </div>
        {visibleSessions.map((session) => (
          <button key={session.id} type="button" onClick={() => onSelectSession(session.id)} className={activeSessionId === session.id ? "active" : ""}>
            <div>
              <strong>{session.title}</strong>
              <small>{sessionMeta(session)}</small>
            </div>
            <span
              onClick={(event) => onDeleteSession(session.id, event)}
              className="ml-auto p-1 text-slate-500 hover:text-rose-400"
              role="button"
              aria-label={`Delete ${session.title}`}
            >
              <Trash2 className="size-3" />
            </span>
          </button>
        ))}
      </div>

      <nav className="bottomNav">
        <button type="button" className={workspaceView === "missions" ? "active" : ""} onClick={() => onViewChange("missions")}>Missions</button>
        <button type="button" className={workspaceView === "automation" ? "active" : ""} onClick={() => onViewChange("automation")}>Automation</button>
        <button type="button" onClick={onOpenSettings}>Settings</button>
        <button type="button" onClick={onSignOut}>Sign out</button>
      </nav>

      <div className="runtimeBadge"><span /> MAINNET GUARDED - READY</div>
    </aside>
  );
}
