import type { RuntimeStatus } from "@silfable/contracts";
import { Brand, CornerFooter } from "../common/Brand";
import { Notice, StatusPill } from "../common/Feedback";
import { Button } from "../ui/Button";

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
      <section className="bootCard">
        <div className="sectionRule">
          <span />
        </div>
        <div className="screenHeading">
          <div>
            <p className="kicker">System check</p>
            <h1>Prepare the local runtime.</h1>
            <p>
              Silfable runs locally and connects only to Mainnet services you
              explicitly configure.
            </p>
          </div>
          <span className="stepCount">BOOTSTRAP</span>
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
          <Button variant="primary" disabled={!ready} onClick={onContinue}>
            Continue <span>→</span>
          </Button>
        </div>
        <p className="safeNote">
          No wallet signing, mission scheduling, or Mainnet execution starts
          during setup.
        </p>
      </section>
      <CornerFooter />
    </main>
  );
}
