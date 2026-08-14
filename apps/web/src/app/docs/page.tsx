import type { Metadata } from "next";

import { DocsContent } from "@/components/docs/DocsContent";
import { DocsSidebar } from "@/components/docs/DocsSidebar";
import { BookOpen, Radio, ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "Documentation - Silfable",
  description: "Configure Silfable for Jupiter swaps, Pump.fun launches, Solana automation, wallet confirmation, and transaction tracking.",
};

import { PageTransition } from "@/components/ui/PageTransition";
import { CurrentReveal } from "@/components/motion/CurrentMotion";

export default function DocsPage() {
  return (
    <PageTransition>
      <main className="publicPage docsTheme min-h-screen bg-paper text-ink">
        <CurrentReveal>
          <header className="docsConsoleHero">
            <div className="section-shell docsConsoleHeroGrid">
              <div>
                <p className="docsConsoleLabel">REFERENCE CONSOLE / CURRENT 01</p>
                <h1>Operate with<br />the route visible.</h1>
              </div>
              <div className="docsConsoleIntro">
                <p>Configuration, execution boundaries, and transaction lifecycle for Silfable&apos;s Solana-first workspace.</p>
                <div className="docsConsoleSignals">
                  <span><Radio /> Solana first</span><span><ShieldCheck /> Wallet reviewed</span><span><BookOpen /> v0.1.0</span>
                </div>
              </div>
            </div>
          </header>
        </CurrentReveal>
        <div className="section-shell currentDocsShell">
          <div className="lg:hidden"><DocsSidebar /></div>
          <div className="docsConsoleBody grid gap-12 py-12 lg:grid-cols-[210px_minmax(0,1fr)] lg:py-16">
            <div className="hidden lg:block h-full"><DocsSidebar /></div>
            <div className="prose prose-invert min-w-0 max-w-none prose-headings:font-display prose-headings:text-ink prose-p:text-black/55 prose-strong:text-ink prose-li:text-black/55 prose-code:font-mono">
              <DocsContent />
            </div>
          </div>
        </div>
      </main>
    </PageTransition>
  );
}
