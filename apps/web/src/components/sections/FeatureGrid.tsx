"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeftRight, Bot, Rocket, Route } from "lucide-react";

const capabilities = [
  { code: "01", title: "Swap", detail: "Resolve a fresh Jupiter route, expected output, slippage, and network fee before wallet review.", icon: ArrowLeftRight },
  { code: "02", title: "Launch", detail: "Prepare Pump.fun metadata, run preflight checks, and keep final Mainnet approval separate.", icon: Rocket },
  { code: "03", title: "Automate", detail: "Turn schedules and market conditions into proposals that still require explicit wallet approval.", icon: Bot },
  { code: "04", title: "Bridge", detail: "Track source confirmation and destination settlement across supported connected routes.", icon: Route },
];

export function FeatureGrid() {
  const reduced = useReducedMotion();
  return <section className="solarSection"><div className="section-shell">
    <header className="solarSectionHeader"><div><span className="solarEyebrow"><i /> CAPABILITY CURRENT</span><h2>One stream.<br />Four operator paths.</h2></div><p>Choose the action, inspect the prepared route, and keep authority in the wallet. Each capability follows the same review-first execution model.</p></header>
    <div className="capabilityCurrent">
      {capabilities.map(({ code, title, detail, icon: Icon }, index) => <motion.article key={title} className="currentCard" initial={reduced ? false : { opacity: 0, y: 26 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: index * .08 }}>
        <div className="currentCardTop"><span>{code}</span><Icon /></div><h3>{title}</h3><p>{detail}</p><div className="currentCardLine"><i /></div>
      </motion.article>)}
    </div>
  </div></section>;
}
