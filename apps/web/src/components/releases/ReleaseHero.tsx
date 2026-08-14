import { ArrowDownToLine, CheckCircle2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CurrentReveal } from "@/components/motion/CurrentMotion";

export function ReleaseHero() {
  return (
    <section className="operatorReleaseHero border-b border-[var(--line)] text-paper">
      <div className="section-shell releaseConsoleHero">
        <CurrentReveal className="releaseConsoleHeroGrid grid gap-10 lg:grid-cols-[.72fr_1fr] lg:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <Badge>Linux preview</Badge>
              <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/35">Preview artifacts available</span>
            </div>
            <h1 className="releaseStamp mt-7 text-[clamp(3.6rem,7vw,7rem)] leading-[0.84] tracking-[-0.07em]">
              Changelog <em className="block">0.1.0</em>
            </h1>
          </div>
          <div className="releaseConsoleSummary border-l border-white/15 pl-7 lg:mb-2">
            <p className="text-lg leading-8 text-white/60">
              Silfable 0.1.0 is the current Linux preview: a Solana-first workspace for Jupiter swaps, Pump.fun launches, portfolio visibility, and wallet-reviewed automation. Connected EVM routes remain available as a secondary network path.
            </p>
            <div className="mt-7 flex flex-wrap gap-x-6 gap-y-3 font-mono text-[9px] uppercase tracking-[0.16em] text-white/35">
              <span className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-[var(--sc-ice)]" /> AppImage</span>
              <span className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-[var(--sc-ice)]" /> Debian</span>
              <span>macOS & Windows: Coming soon</span>
            </div>
            <Button asChild size="lg" className="solarPrimaryButton mt-7 w-full sm:w-auto">
              <a href="#downloads">Download for Linux <ArrowDownToLine className="ml-4 size-4" /></a>
            </Button>
          </div>
        </CurrentReveal>
      </div>
    </section>
  );
}
