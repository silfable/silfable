// @ts-nocheck
import { CirclePlus, Target, Bot, Settings } from "lucide-react";
import type { RuntimeStatus, SessionRecord } from "@silfable/contracts";
import { Button } from "../ui";
import { BrandMark } from "../setup/SetupHelpers";
import { sessionIntentLabel, type SessionFilter, type SetupState } from "../types";

export function LeftSidebar({
  activeId,
  setActiveId,
  nav,
  setNav,
  requestSession,
  sessionFilter,
  chooseFilter,
  sessionsState,
  refreshEncryptedSessions,
  filteredSessions,
  setSessionToDelete,
  setup,
  saveSetup,
  setSettingsOpen,
  runtime,
}: {
  activeId: string | null;
  setActiveId: (id: string | null) => void;
  nav: string;
  setNav: (nav: string) => void;
  requestSession: () => void;
  sessionFilter: SessionFilter;
  chooseFilter: (filter: SessionFilter) => void;
  sessionsState: string;
  refreshEncryptedSessions: (id?: string | null) => Promise<void>;
  filteredSessions: SessionRecord[];
  setSessionToDelete: (session: SessionRecord) => void;
  setup: SetupState;
  saveSetup: (setup: SetupState) => void;
  setSettingsOpen: (open: boolean) => void;
  runtime: RuntimeStatus | null;
}) {
  return (
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
  );
}
