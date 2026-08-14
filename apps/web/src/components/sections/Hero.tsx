"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, BookOpen, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export function Hero() {
  const reduced = useReducedMotion();

  return (
    <section id="top" className="solarHero solarHeroCharacter">
      <video
        className="solarHeroCharacterImage"
        autoPlay={!reduced}
        muted
        loop
        playsInline
        preload="metadata"
        poster="/silfable-character.jpeg"
        aria-hidden="true"
      >
        <source src="/hero2.mp4" type="video/mp4" />
      </video>
      <div className="solarHeroCharacterShade" aria-hidden="true" />
      <div className="section-shell solarHeroLayout solarHeroSingleLayout">
        <motion.div
          className="solarHeroCopy solarHeroCharacterCopy"
          initial={reduced ? false : { opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7 }}
        >
          <span className="solarEyebrow"><i /> SOLANA OPERATOR WORKSPACE</span>
          <h1>Move onchain.<br /><em>Keep the final say.</em></h1>
          <p>Prepare Solana swaps, token launches, automation, and connected routes from one controlled workspace. Silfable assembles the execution path; your wallet approves every transaction.</p>
          <div className="solarHeroActions">
            <Button asChild size="lg" className="solarPrimary"><Link href="/connect">Open workspace <ArrowUpRight /></Link></Button>
            <Button asChild size="lg" className="solarSecondary"><Link href="/docs">Read documentation <BookOpen /></Link></Button>
          </div>
          <div className="solarTrust"><ShieldCheck /><span><strong>Wallet-reviewed execution.</strong> Authentication never authorizes a later transaction.</span></div>
          <div className="solarHeroSignals" aria-label="Supported operator capabilities">
            <span>Jupiter swaps</span><span>Pump.fun launch</span><span>Automation</span><span>Connected EVM</span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
