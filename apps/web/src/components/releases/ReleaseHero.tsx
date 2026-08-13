import { ArrowDownToLine, CheckCircle2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AtlasReveal } from "@/components/motion/AtlasMotion";

export function ReleaseHero() {
  return (
    <section className="atlasReleaseHero border-b border-[var(--line)] text-paper">
      <div className="section-shell pb-16 pt-32 sm:pb-20 sm:pt-40 lg:pb-24">
        <AtlasReveal className="grid gap-14 lg:grid-cols-[1fr_0.65fr] lg:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <Badge>Linux preview</Badge>
              <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/35">Preview artifacts available</span>
            </div>
            <h1 className="releaseStamp mt-8 text-[clamp(4.5rem,11vw,10rem)] leading-[0.78] tracking-[-0.08em]">
              Silfable <em className="block pl-[8vw]">0.1.0</em>
            </h1>
          </div>
          <div className="border-t border-white/15 pt-7 lg:mb-2">
            <p className="text-lg leading-8 text-white/60">
              The Linux preview establishes Silfable&apos;s Robinhood Chain-first desktop foundation, with supported ETH↔USDG swaps, two-way Solana connectivity, and separate release status for every venue.
            </p>
            <div className="mt-7 flex flex-wrap gap-x-6 gap-y-3 font-mono text-[9px] uppercase tracking-[0.16em] text-white/35">
              <span className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-[var(--atlas-coral)]" /> AppImage</span>
              <span className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-[var(--atlas-coral)]" /> Debian</span>
              <span>macOS & Windows: Coming soon</span>
            </div>
            <Button asChild size="lg" className="atlasCoralButton mt-9 w-full sm:w-auto">
              <a href="#downloads">Download for Linux <ArrowDownToLine className="ml-4 size-4" /></a>
            </Button>
          </div>
        </AtlasReveal>
      </div>
    </section>
  );
}
