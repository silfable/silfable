import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { CurrentReveal } from "@/components/motion/CurrentMotion";

export function ValueProps() {
  return <section id="networks" className="solarSection solarEcosystem"><div className="section-shell">
    <CurrentReveal className="solarSectionHeader"><div><span className="solarEyebrow"><i /> PRIMARY ECOSYSTEM</span><h2>Built for the speed<br />of Solana.</h2></div><p>Solana leads the experience from wallet context to settlement. Connected EVM routes stay available without competing for the primary workflow.</p></CurrentReveal>
    <CurrentReveal className="ecosystemLayout" delay={.08}>
      <article className="ecosystemPrimary"><div className="ecosystemMark"><Image src="/solana.svg" alt="Solana" width={58} height={58}/></div><span>PRIMARY CURRENT</span><h3>Solana operator stack</h3><p>Jupiter routing, Pump.fun token launch, dynamic portfolio reads, automation proposals, and explicit wallet confirmation in one continuous workspace.</p><div className="ecosystemTags"><b>Jupiter</b><b>Pump.fun</b><b>Portfolio</b><b>Automation</b></div></article>
      <article className="ecosystemConnected"><div className="connectedTop"><span>CONNECTED NETWORK</span><ArrowUpRight /></div><h3>Robinhood Chain</h3><p>Access supported Uniswap swaps and two-way bridge workflows as a connected EVM route.</p><div className="connectedLedger"><span>Venue <b>Uniswap</b></span><span>Wallet <b>MetaMask / Rabby</b></span><span>Chain <b>4663</b></span></div></article>
    </CurrentReveal>
  </div></section>;
}
