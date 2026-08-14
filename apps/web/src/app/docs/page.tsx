import type { Metadata } from "next";

import { DocsContent } from "@/components/docs/DocsContent";
import { DocsSidebar } from "@/components/docs/DocsSidebar";
import { WhitepaperContent } from "@/app/whitepaper/page";

export const metadata: Metadata = {
  title: "Documentation - Silfable",
  description: "Configure Silfable for Robinhood Chain swaps, two-way Solana connectivity, wallet confirmation, and final transaction tracking.",
};

import { PageTransition } from "@/components/ui/PageTransition";
import { AtlasReveal } from "@/components/motion/AtlasMotion";

export default function DocsPage() {
  return (
    <PageTransition>
      <main className="publicPage docsTheme min-h-screen bg-paper text-ink">
        <AtlasReveal><WhitepaperContent /></AtlasReveal>
        <div className="section-shell atlasDocsShell pt-20">
          <AtlasReveal className="lg:hidden"><DocsSidebar /></AtlasReveal>
          <AtlasReveal className="grid gap-16 py-16 lg:grid-cols-[250px_minmax(0,1fr)] lg:py-24" delay={0.08}>
            <div className="hidden lg:block h-full"><DocsSidebar /></div>
            <div className="prose prose-invert min-w-0 max-w-none prose-headings:font-serif prose-headings:text-ink prose-p:text-black/55 prose-strong:text-ink prose-li:text-black/55 prose-code:font-mono">
              <DocsContent />
            </div>
          </AtlasReveal>
        </div>
      </main>
    </PageTransition>
  );
}
