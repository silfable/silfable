import { ArrowDownToLine } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { AtlasReveal } from "@/components/motion/AtlasMotion";

const releases = [
  {
    version: "0.1.0",
    date: "Linux preview",
    status: "Preview",
    summary: "Robinhood Chain-first foundation",
    added: ["Linux AppImage and Debian preview builds", "Robinhood Chain wallet onboarding on chain ID 4663", "Encrypted local session and transaction-record storage"],
    changed: ["ETH↔USDG uses the pinned Robinhood route with explicit wallet confirmation", "Two-way Robinhood USDG↔Solana USDC bridges reconcile each transfer independently", "Solana Jupiter and Pump.fun workflows remain available as connected capabilities"],
    fixed: ["Provider errors and incomplete route data now stop safely", "Desktop privilege-boundary audits", "Linux package compatibility checks"],
  },
] as const;

export function ReleaseHistory() {
  return (
    <section className="py-20 sm:py-28">
      <AtlasReveal className="mb-14 grid gap-7 border-b border-black/20 pb-10 lg:grid-cols-[1fr_0.6fr] lg:items-end">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--atlas-coral)]">Changelog timeline</p>
          <h2 className="mt-5 font-serif text-5xl tracking-[-0.05em] sm:text-7xl">Version history</h2>
        </div>
        <p className="max-w-md text-sm leading-7 text-black/50 lg:justify-self-end">The current preview milestone, with Linux available first and more desktop platforms planned.</p>
      </AtlasReveal>

      <div className="releaseLedger relative space-y-10 before:absolute before:bottom-0 before:left-[7px] before:top-0 before:w-px before:bg-black/20 sm:before:left-[12rem]">
        {releases.map((release, index) => (
          <AtlasReveal key={release.version} delay={index * 0.08}>
          <article className="relative grid gap-5 pl-10 sm:grid-cols-[10.5rem_1fr] sm:gap-14 sm:pl-0">
            <span className="absolute left-0 top-8 size-[15px] rounded-full border-4 border-paper bg-[var(--atlas-coral)] sm:left-[11.55rem]" />
            <div className="releaseVersionMeta pt-7 sm:pl-6">
              <p className="font-mono text-2xl tracking-[-0.05em] text-[var(--atlas-coral)]">v{release.version}</p>
              <p className="mt-3 font-mono text-[8px] uppercase tracking-[0.15em] text-black/30">{release.date}</p>
            </div>

            <Card className="border-black/15 bg-white text-ink">
              <CardHeader className="border-b border-black/10 p-7 sm:p-9">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <h3 className="font-serif text-3xl tracking-[-0.04em] sm:text-4xl">{release.summary}</h3>
                  <Badge className="border-[rgb(167_139_250_/_0.42)] bg-[rgb(167_139_250_/_0.08)] text-[var(--atlas-lilac)]">{release.status}</Badge>
                </div>
              </CardHeader>
              <CardContent className="p-7 sm:p-9">
                <div className="grid gap-8 md:grid-cols-3">
                  <ChangeList title="Added" items={release.added} />
                  <ChangeList title="Changed" items={release.changed} />
                  <ChangeList title="Fixed" items={release.fixed} />
                </div>
                <div className="mt-9 border-t border-black/10 pt-7">
                  <Button asChild className="atlasCoralButton">
                    <a href="#downloads" aria-label={`View downloads for Silfable version ${release.version}`}>
                      Download v{release.version} <ArrowDownToLine className="ml-3 size-3.5" />
                    </a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </article>
          </AtlasReveal>
        ))}
      </div>
    </section>
  );
}

function ChangeList({ title, items }: { title: string; items: readonly string[] }) {
  return (
    <div>
      <p className="mb-4 font-mono text-[9px] uppercase tracking-[0.17em] text-black/35">{title}</p>
      <ul className="space-y-3">
        {items.map((item) => <li key={item} className="border-l border-black/15 pl-4 text-xs leading-6 text-black/50">{item}</li>)}
      </ul>
    </div>
  );
}
