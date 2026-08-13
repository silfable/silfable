import { AtlasKicker, AtlasPanel, RouteNode, StatusMarker } from "@/components/atlas/AtlasPrimitives";
import { AtlasReveal } from "@/components/motion/AtlasMotion";

const lifecycle = [
  { number: "01", label: "Intent", detail: "Define the Robinhood Chain asset, amount, wallet, and target.", tone: "lilac" as const },
  { number: "02", label: "Route check", detail: "Compare fresh venue data with allowance, fees, limits, and expected output.", tone: "aqua" as const },
  { number: "03", label: "Wallet review", detail: "Nothing moves until the exact transaction is confirmed in your wallet.", tone: "coral" as const },
  { number: "04", label: "Settlement", detail: "Keep broadcast, receipt, and final status in the same activity record.", tone: "citron" as const },
];

export function TerminalMockup() {
  return (
    <section className="atlasSection">
      <div className="section-shell">
        <AtlasReveal className="atlasSectionHeader">
          <div><AtlasKicker tone="citron">Live workspace lifecycle</AtlasKicker><h2>The whole trade,<br />kept in view.</h2></div>
          <p>Move from conversation to a typed transaction preview without jumping between disconnected tools. Wallet context, route checks, limits, and final status stay together.</p>
        </AtlasReveal>
        <AtlasReveal className="tradeLifecycle" delay={0.08}>
          <AtlasPanel className="lifecycleSummary" tone="lilac">
            <StatusMarker tone="citron">Recorded from the app</StatusMarker>
            <div className="lifecycleSummaryCopy"><AtlasKicker tone="lilac">One continuous record</AtlasKicker><h3>Context stays attached to the route.</h3><p>The interface changes shape as the trade advances, while the wallet, network, checks, and result remain readable together.</p></div>
            <div className="lifecycleNodes"><RouteNode label="Robinhood Chain" detail="Primary execution" tone="lilac" active /><RouteNode label="Solana" detail="Connected route" tone="aqua" active /></div>
          </AtlasPanel>
          <div className="lifecycleTrack">
            {lifecycle.map((step) => <AtlasPanel key={step.number} className={`lifecycleStep atlasTone-${step.tone}`} tone={step.tone}>
              <span className="lifecycleNumber">{step.number}</span><div><AtlasKicker tone={step.tone}>{step.label}</AtlasKicker><p>{step.detail}</p></div><StatusMarker tone={step.tone}>{step.number === "04" ? "Final" : "In view"}</StatusMarker>
            </AtlasPanel>)}
          </div>
        </AtlasReveal>
      </div>
    </section>
  );
}
