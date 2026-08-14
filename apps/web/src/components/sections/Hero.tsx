"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowDownRight, Download } from "lucide-react";
import Link from "next/link";

import { AtlasKicker, NetworkBadge } from "@/components/atlas/AtlasPrimitives";
import { Button } from "@/components/ui/button";

export function Hero() {
  const reduceMotion = useReducedMotion();

  return (
    <section id="top" className="atlasHero">
      <div className="atlasHeroBackground" aria-hidden="true">
        <video
          
          className="atlasHeroBackgroundVideo"
          loop
          autoPlay={!reduceMotion}
          muted
          playsInline
          preload="metadata"
        >
          <source src="/hero.mp4" type="video/mp4" />
        </video>
      </div>
      <div className="section-shell atlasHeroLayout">
        <motion.div className="atlasHeroCopy" initial={{ opacity: 0, x: -28 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: .75 }}>          
          <h1>Set the strategy.<em>Let the runtime handle execution.</em></h1>
          <div className="atlasHeroLead">
            <span className="atlasLeadLine" />
            <div>
              <p>Build to run locally on your machine, Mission Mode can operate autonomously for days while every swap and bridge remains subject to the same fail-closed safety controls.</p>
              <div className="atlasHeroActions">
                <Button asChild size="lg" className="atlasPrimaryButton"><Link href="/connect">Open workspace <ArrowDownRight className="ml-3 size-4" /></Link></Button>
                <Button asChild size="lg" className="atlasSecondaryButton"><Link href="/#download">Desktop app <Download className="ml-3 size-4" /></Link></Button>
              </div>
            </div>
          </div>
        </motion.div>

      </div>

      <div className="atlasProofStrip ">
        <div className="section-shell atlasProofGrid">
          {[
            <><AtlasKicker tone="coral">Living Atlas / 01</AtlasKicker><span>Every supported workflow stays visible.</span></>,
            <><NetworkBadge tone="lilac">Robinhood Chain</NetworkBadge><span>Primary ecosystem · ID 4663</span></>,
            <><NetworkBadge tone="aqua">Connected to Solana</NetworkBadge><span>Swap + launch + bridge</span></>,
            <><strong>Web + desktop</strong><span>Two signing surfaces</span></>,
          ].map((content, index) => (
            <motion.div
              className="atlasProofItem"
              key={index}
              initial={reduceMotion ? false : { opacity: 0, y: 14 }}
              whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: .5, delay: index * .08 }}
            >
              {content}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
