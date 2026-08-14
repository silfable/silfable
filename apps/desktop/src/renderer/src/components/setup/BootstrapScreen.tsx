import type { RuntimeStatus } from "@silfable/contracts";
import { Brand, StatusPill, Notice, CornerFooter } from "./SetupHelpers";

export function BootstrapScreen({
  runtime,
  ready,
  error,
  onContinue,
}: {
  runtime: RuntimeStatus | null;
  ready: boolean;
  error: string | null;
  onContinue: () => void;
}) {
  const probes = [
    {
      label: "Desktop runtime",
      detail: runtime
        ? `Electron host · ${runtime.appVersion}`
        : "Inspecting application host",
      ok: ready,
    },
    {
      label: "Local database",
      detail: ready
        ? "SQLite opened · schema migrations applied"
        : "Opening encrypted runtime data",
      ok: ready,
    },
    {
      label: "Mainnet RPC",
      detail: runtime
        ? `${runtime.networkHealth} · read-only finalized balance access`
        : "Checking Mainnet connectivity",
      ok: runtime?.networkHealth === "healthy",
    },
    {
      label: "Secure vault",
      detail: runtime
        ? `OS-backed storage · ${runtime.keystore}`
        : "Checking secure storage",
      ok: ready,
    },
  ];
  return (
    <main className="onboardingPage">
      <Brand compact={false} />
      <span className="setupModeBadge">Desktop bootstrap</span>
      <section className="bootCard gatewayCanvas">
        <header className="gatewayChapter">
          <span className="gatewayNode">01</span>
          <div>
            <p className="kicker">System check</p>
            <h1>Prepare the local runtime.</h1>
            <p>
              Silfable runs locally and connects only to Mainnet services you
              explicitly configure.
            </p>
          </div>
          <span className="gatewayChapterLabel">Route entry / bootstrap</span>
        </header>
        <div className="gatewayContent">
          <div className="gatewayContentHeader">
            <div>
              <span className="stepCount">LOCAL READINESS</span>
              <h2>Four checks before entry.</h2>
            </div>
            <StatusPill tone={ready ? "success" : "neutral"}>
              {ready ? "ALL READY" : "CHECKING"}
            </StatusPill>
          </div>
          <div className="probeList">
            {probes.map((probe, index) => (
              <div className="probeRow" key={probe.label}>
                <span className="probeIndex">0{index + 1}</span>
                <span className="probeIcon">{probe.ok ? "✓" : "·"}</span>
                <div>
                  <strong>{probe.label}</strong>
                  <small>{probe.detail}</small>
                </div>
                <StatusPill
                  tone={
                    probe.ok
                      ? "success"
                      : runtime && index === 2
                        ? "warning"
                        : "neutral"
                  }
                >
                  {probe.ok
                    ? "READY"
                    : runtime && index === 2
                      ? "DEGRADED"
                      : "CHECKING"}
                </StatusPill>
              </div>
            ))}
          </div>
          {error && (
            <Notice tone="danger" title="Runtime check failed">
              {error}
            </Notice>
          )}
          <div className="bootActions">
            <span>No signing or execution starts here.</span>
            <button
              className="primaryButton"
              disabled={!ready}
              onClick={onContinue}
            >
              Continue <span>→</span>
            </button>
          </div>
        </div>
      </section>
      <CornerFooter />
    </main>
  );
}
