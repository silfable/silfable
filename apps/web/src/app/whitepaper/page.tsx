import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowUpRight,
  CheckCircle2,
  LockKeyhole,
  ShieldCheck,
  TriangleAlert,
  ServerCrash,
  BrainCircuit,
  Database,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Whitepaper - Silfable",
  description:
    "Silfable whitepaper covering its Solana-first transaction workflow, Jupiter swaps, Pump.fun launches, automation, connected EVM routes, and wallet-reviewed execution.",
};

const statusRows = [
  ["Verified restricted", "Robinhood Chain Swap", "Controlled ETH-to-USDG and USDG-to-ETH swaps have completed. The active desktop EVM scope is Robinhood Chain only, using a verified Robinhood RPC and a pinned Uniswap-compatible route."],
  ["Verified restricted", "Solana-Robinhood Bridge", "Controlled Solana USDC-to-Robinhood USDG and Robinhood USDG-to-Solana USDC bridges have completed in web and desktop. Each transfer remains route-, liquidity-, RPC-, wallet-, and receipt-dependent."],
  ["Verified restricted", "Jupiter Solana Swap", "Controlled SOL-to-USDC and USDC-to-SOL Mainnet swaps have completed. Every new swap still requires a fresh quote, deterministic checks, explicit wallet approval, one-attempt broadcast, and receipt reconciliation."],
  ["Verified restricted", "Pump.fun Token Launch", "Controlled Mainnet token launches have completed through metadata publication, create_v2 preflight, exact final review, wallet approval, broadcast, and receipt verification."],
  ["Verified restricted", "Auto DCA", "Controlled DCA cycles have detected a due schedule, obtained a fresh quote, completed only after explicit wallet approval, and been reconciled on Mainnet. The schedule never signs on the user's behalf."],
  ["Verified restricted", "TP/SL & Exits", "Controlled TP/SL conditions have triggered a bounded Mainnet exit proposal and completed only after explicit wallet approval and receipt reconciliation. Triggering a condition never grants unattended signing authority."],
  ["Planned · desktop-only", "Full Access / autonomous signing", "Not production-available yet. Any future unattended signing must use a paired desktop agent and an encrypted local vault; Silfable web never receives a private key or runs a cloud signer."],
] as const;

const principles = [
  {
    icon: ShieldCheck,
    title: "Wallet-Specific Signing",
    text: "Desktop keys remain in the local encrypted vault. On web, Phantom or Solflare confirms transactions and the server never creates a production signer.",
  },
  {
    icon: LockKeyhole,
    title: "Reviewed Web Transactions",
    text: "The connected browser wallet must confirm every production web transaction. Full Access is desktop-only; the web service never stores a private key or signs in the cloud.",
  },
  {
    icon: CheckCircle2,
    title: "Persistent Strategies",
    text: "DCA and TP/SL strategies retain their amounts, schedules, pause controls, and revoke controls. The active web or desktop app can prepare a fresh transaction for review, while signing remains with the selected wallet surface.",
  },
  {
    icon: TriangleAlert,
    title: "Deterministic Route Checks",
    text: "Fee, slippage, allowlist, balance, and freshness requirements must pass before a supported transaction can reach wallet confirmation.",
  },
] as const;

import { PageTransition } from "@/components/ui/PageTransition";

export function WhitepaperContent() {
  return (
      <section id="whitepaper" className="scroll-mt-20 border-t border-[var(--line)]">
        <section className="border-b border-black/15 pt-24 sm:pt-28">
          <div className="section-shell pb-20 sm:pb-28">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--sc-orange)]">Whitepaper / v0.2.0</p>
            <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_0.48fr] lg:items-end">
              <h1 className="max-w-5xl font-serif text-6xl font-normal leading-[0.9] tracking-normal sm:text-7xl lg:text-8xl">
                A Solana-first current from intent to settlement.
              </h1>
              <p className="max-w-lg text-base leading-8 text-black/55 lg:justify-self-end">
                An operator workspace centered on Solana swaps, token launches, automation, and connected routes, with venue-specific preparation, wallet confirmation, and settlement tracking.
              </p>
            </div>
          </div>
        </section>

        <section className="border-b border-black/15 bg-black/[0.02]">
          <div className="section-shell grid gap-10 py-16 lg:grid-cols-[18rem_1fr] lg:py-20">
            <SectionLabel number="00" title="Important Notice" />
            <div className="space-y-6 text-sm leading-7 text-black/70">
              <p className="font-medium text-black">Silfable is an autonomous trading interface designed to help users research markets, evaluate opportunities, and execute on-chain actions with greater efficiency.</p>
              <p>
                AI-generated analysis and decisions may be incomplete, delayed, or inaccurate. All transactions remain subject to the safeguards, limits, and wallet permissions configured by the user.
              </p>
              <p>Digital assets are highly volatile and involve significant financial risk. Users remain responsible for reviewing their settings, understanding the risks involved, and deciding how Silfable is used.</p>
               
            </div>
          </div>
        </section>

        <section className="border-b border-black/15">
          <div className="section-shell grid gap-10 py-16 lg:grid-cols-[18rem_1fr] lg:py-20">
            <SectionLabel number="01" title="Executive Summary" />
            <div className="space-y-6 text-sm leading-7 text-black/70">
              <p>
                The decentralized finance (DeFi) ecosystem is becoming increasingly agentic. AI agents are beginning to search for information, analyze tokens, draft limit orders, and perform economic tasks for humans and businesses.
              </p>
              <p>
                The difficult part is connecting flexible market research to predictable transaction handling without turning a model response into an unchecked wallet instruction.
              </p>
              <p>
                Silfable is built around five core ideas:
              </p>
              <ul className="list-decimal pl-5 space-y-4 text-black">
                <li><strong>Intent-based research, deterministic transactions:</strong> AI may analyze markets and prepare actions, but supported transactions must pass venue-specific checks before execution.</li>
                <li><strong>Wallet-specific signing:</strong> Desktop keys remain in the local encrypted vault; web signing remains in the connected browser wallet.</li>
                <li><strong>Readable transaction records:</strong> Quotes, simulations, confirmations, rejections, and final outcomes remain distinguishable. Desktop records are stored locally.</li>
                <li><strong>Reviewed web execution:</strong> Every supported web transaction requires browser-wallet confirmation. Full Access is desktop-only; web never stores a private key or signs in the cloud.</li>
                <li><strong>Wallet-scoped authentication:</strong> Web access requires an expiring, one-time wallet challenge signature. It authenticates the workspace but never authorizes a transaction.</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="border-b border-black/15">
          <div className="section-shell grid gap-10 py-16 lg:grid-cols-[18rem_1fr] lg:py-20">
            <SectionLabel number="02" title="Current Status" />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[44rem] text-left text-sm">
                <thead className="border-b border-black/20 font-mono text-[9px] uppercase tracking-[0.16em] text-black/35">
                  <tr>
                    <th className="py-4 font-normal">Status</th>
                    <th className="py-4 font-normal">Capability</th>
                    <th className="py-4 font-normal">Scope</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/10">
                  {statusRows.map(([status, capability, scope]) => (
                    <tr key={capability}>
                      <td className="py-5 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--sc-orange)]">{status}</td>
                      <td className="py-5 font-medium">{capability}</td>
                      <td className="py-5 leading-7 text-black/55">{scope}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="border-b border-black/15">
          <div className="section-shell grid gap-10 py-16 lg:grid-cols-[18rem_1fr] lg:py-20">
            <SectionLabel number="03" title="The Problem" />
            <div className="grid gap-8 sm:grid-cols-3">
              <div>
                <BrainCircuit className="size-6 text-[var(--sc-violet)] mb-4" strokeWidth={1.5} />
                <h3 className="font-serif text-2xl mb-2">Ambiguous Requests</h3>
                <p className="text-sm leading-6 text-black/60">Natural-language requests often omit the exact asset, network, amount, deadline, slippage, or destination needed to build a safe transaction.</p>
              </div>
              <div>
                <LockKeyhole className="size-6 text-[var(--sc-violet)] mb-4" strokeWidth={1.5} />
                <h3 className="font-serif text-2xl mb-2">Fragmented Workflows</h3>
                <p className="text-sm leading-6 text-black/60">Research, quoting, token metadata, wallet confirmation, and transaction tracking often live in separate tools with no shared context.</p>
              </div>
              <div>
                <ServerCrash className="size-6 text-[var(--sc-violet)] mb-4" strokeWidth={1.5} />
                <h3 className="font-serif text-2xl mb-2">Long-Running Strategies</h3>
                <p className="text-sm leading-6 text-black/60">DCA and TP/SL conditions need durable schedules and state, while the resulting transaction must still use the signing model of the active web or desktop surface.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-black/15 bg-black/[0.02]">
          <div className="section-shell grid gap-10 py-16 lg:grid-cols-[18rem_1fr] lg:py-20">
            <SectionLabel number="04" title="Product Direction" />
            <div className="space-y-6 text-sm leading-7 text-black/70">
              <p className="text-lg text-black font-medium leading-relaxed">
                Silfable aims to become an open environment where humans and software agents can express an intended outcome, research the market, and securely execute that outcome without compromising custody.
              </p>
              <p>A request may be expressed as:</p>
              <div className="bg-white border border-black/10 p-5 font-mono text-[11px] text-[var(--sc-orange)] space-y-2">
                <p>&gt; &ldquo;Draft the immutable metadata and bounded fee plan for a Pump.fun Token Launch.&rdquo;</p>
                <p>&gt; &ldquo;Prepare a USDC-to-SOL swap proposal with slippage capped at 1%.&rdquo;</p>
              </div>
              <p>Silfable coordinates the user request, AI provider, venue checks, local or browser-wallet signer, network-specific protocol, and final transaction record as one visible workflow.</p>
            </div>
          </div>
        </section>

        <section className="border-b border-black/15">
          <div className="section-shell grid gap-10 py-16 lg:grid-cols-[18rem_1fr] lg:py-20">
            <SectionLabel number="05" title="Design Principles" />
            <div className="grid gap-5 sm:grid-cols-2">
              {principles.map((principle) => {
                const Icon = principle.icon;
                return (
                  <article key={principle.title} className="border border-black/15 p-6">
                    <Icon className="size-5 text-[var(--sc-violet)]" strokeWidth={1.5} />
                    <h2 className="mt-8 font-serif text-3xl font-normal tracking-normal">{principle.title}</h2>
                    <p className="mt-4 text-sm leading-7 text-black/55">{principle.text}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="border-b border-black/15">
          <div className="section-shell grid gap-10 py-16 lg:grid-cols-[18rem_1fr] lg:py-20">
            <SectionLabel number="06" title="System Architecture" />
            <div className="grid gap-8">
              <div className="flex gap-4">
                <Database className="size-6 text-[var(--sc-violet)] shrink-0" strokeWidth={1.5} />
                <div>
                  <h3 className="font-serif text-xl mb-1">Encrypted Cloud State Layer</h3>
                  <p className="text-sm leading-6 text-black/60">A cloud database for user preferences, chat state, and proposal metadata within defined limits. Production transaction keys are never stored by the web service.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <ServerCrash className="size-6 text-[var(--sc-violet)] shrink-0" strokeWidth={1.5} />
                <div>
                  <h3 className="font-serif text-xl mb-1">High-Throughput Task Queue</h3>
                  <p className="text-sm leading-6 text-black/60">A task queue foundation for scheduled monitoring and transaction preparation. Cloud execution jobs remain disabled.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-black/15 bg-black/[0.02]">
          <div className="section-shell grid gap-10 py-16 lg:grid-cols-[18rem_1fr] lg:py-20">
            <SectionLabel number="07" title="Venue Model" />
            <div>
              <p className="max-w-3xl text-lg leading-8 text-black/60">
                Robinhood Chain is the active primary EVM environment through a pinned Uniswap-compatible route for ETH↔USDG. Two-way bridge support is explicitly limited to Robinhood USDG and Solana USDC. Solana remains available for Jupiter swaps and Pump.fun Token Launch.
              </p>
              <div className="mt-10 grid gap-4 md:grid-cols-3">
                {[
                  ["Token Launch", "AI may help draft public metadata, but the user confirms exact immutable content, creator wallet, fee caps, and the final launch approval."],
                  ["Swap", "Robinhood Chain ETH↔USDG swaps use a pinned Uniswap-compatible route. Connected Jupiter swaps retain separate typed contracts, provider evidence, policy, signer boundaries, and transaction recovery."],
                  ["Bridge", "Robinhood USDG to Solana USDC and the reverse direction have completed controlled web and desktop flows. No universal any-chain bridge claim is made."],
                  ["Auto DCA & Exits", "The active web or desktop runtime can monitor conditions, fetch a fresh quote, and open a bounded action for review. Each resulting transaction still requires explicit wallet approval."],
                ].map(([title, text]) => (
                  <div key={title} className="border-t border-black/20 pt-5">
                    <h3 className="font-serif text-2xl font-normal tracking-normal">{title}</h3>
                    <p className="mt-3 text-sm leading-7 text-black/55">{text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section>
          <div className="section-shell grid gap-10 py-16 lg:grid-cols-[18rem_1fr] lg:py-20">
            <SectionLabel number="08" title="Web And Desktop" />
            <div className="grid gap-5 md:grid-cols-2">
              <div className="border border-black/15 p-6 bg-white">
                <h2 className="font-serif text-3xl font-normal tracking-normal">Desktop</h2>
                <p className="mt-4 text-sm leading-7 text-black/55">
                  The reference surface for Robinhood Chain swaps, two-way Robinhood–Solana bridges, encrypted local-vault signing, and connected Jupiter Swap and Pump.fun Token Launch workflows. Other EVM chains are outside the active desktop product scope.
                </p>
              </div>
              <div className="border border-black/15 p-6 bg-white">
                <h2 className="font-serif text-3xl font-normal tracking-normal">Web</h2>
                <p className="mt-4 text-sm leading-7 text-black/55">
                  Uses the single connected browser wallet for approval. It does not collect a secret key and does not yet provide execution parity with every desktop venue.
                </p>
              </div>
            </div>
            <div className="lg:col-start-2 mt-4">
              <Link
                href="/trade"
                className="solarPrimaryButton inline-flex items-center gap-3 px-6 py-4 text-[10px] font-semibold uppercase tracking-[0.16em]"
              >
                Open Trade Workspace <ArrowUpRight className="size-4" />
              </Link>
            </div>
          </div>
        </section>
      </section>
  );
}

export default function WhitepaperPage() {
  return (
    <PageTransition>
      <main className="publicPage docsTheme min-h-screen bg-paper text-ink">
        <WhitepaperContent />
      </main>
    </PageTransition>
  );
}

function SectionLabel({ number, title }: { number: string; title: string }) {
  return (
    <div>
      <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--sc-orange)]">[{number}]</p>
      <h2 className="mt-3 font-serif text-3xl font-normal tracking-normal">{title}</h2>
    </div>
  );
}
