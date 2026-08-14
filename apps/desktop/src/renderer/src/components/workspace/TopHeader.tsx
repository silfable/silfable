// @ts-nocheck
import type { SessionRecord } from "@silfable/contracts";

export function TopHeader({ session }: { session: SessionRecord }) {
  return (
    <header className="workspaceTopHeader">
      <div>
        <span className="liveDot" />{" "}
        {session.workspace === "pump"
          ? "Pump.fun · manual restricted"
          : session.walletScope === "solana"
            ? session.mode === "mission"
              ? "Solana workspace · mission"
              : "Solana workspace · agent"
            : session.walletScope === "evm"
              ? session.mode === "mission"
                ? "EVM workspace · restricted mission"
                : "EVM workspace · restricted agent"
          : session.intent === "token-launch"
            ? "Token launch planning"
            : session.intent === "solana-swap"
              ? "Solana swap preparing"
              : session.intent === "evm-swap"
                ? "EVM swap planning · release gated"
                : session.intent === "bridge"
                  ? "Bridge planning · quote only"
                  : session.mode === "mission"
                    ? "Mission mode · policy enforced"
                    : "Agent mode · advisory only"}
      </div>
      <div>
        <span>Live route · {session.title}</span>
      </div>
    </header>
  );
}
