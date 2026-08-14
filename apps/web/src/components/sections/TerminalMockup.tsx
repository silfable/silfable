import { Check, WalletCards } from "lucide-react";
import { CurrentReveal } from "@/components/motion/CurrentMotion";

const stages = [
  ["01", "Intent", "Bind the active wallet, network, asset, and amount."],
  ["02", "Quote", "Load current venue data and expected output."],
  ["03", "Simulate", "Validate limits, fees, and transaction shape."],
  ["04", "Approve", "Review the exact action in the connected wallet."],
  ["05", "Settle", "Reconcile broadcast, receipt, and final status."],
];

export function TerminalMockup() {
  return <section className="solarSection"><div className="section-shell">
    <CurrentReveal className="solarSectionHeader"><div><span className="solarEyebrow"><i /> EXECUTION WORKFLOW</span><h2>From intent to settlement,<br />nothing disappears.</h2></div><p>Preparation, simulation, wallet approval, and settlement remain distinct so operators always know what has—and has not—happened.</p></CurrentReveal>
    <CurrentReveal className="executionSpecimen" delay={.08}>
      <div className="executionRail">{stages.map(([number,label,detail], index)=><article key={label} className={index === 3 ? "is-active" : ""}><span>{number}</span><i>{index < 3 ? <Check /> : null}</i><div><h3>{label}</h3><p>{detail}</p></div></article>)}</div>
      <aside className="approvalSpecimen"><span>APPROVAL CHECKPOINT</span><WalletCards/><h3>The wallet is the boundary.</h3><p>Silfable can prepare and simulate. It cannot silently approve a transaction or reuse an authentication signature.</p><div><b>Network</b><strong>Solana Mainnet</strong></div><div><b>Authority</b><strong>Connected wallet</strong></div><div><b>Status</b><strong>Awaiting review</strong></div></aside>
    </CurrentReveal>
  </div></section>;
}
