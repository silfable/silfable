import { AlertTriangle, ArrowRight, Check, KeyRound, Monitor, ShieldCheck, TerminalSquare } from "lucide-react";
import Image from "next/image";

const concepts = [
  { icon: TerminalSquare, title: "Workspace", text: "Keeps market research, wallet context, transaction previews, and final status together." },
  { icon: ArrowRight, title: "Workflow", text: "Turns a request into venue-specific steps with the exact inputs required for that action." },
  { icon: ShieldCheck, title: "Route check", text: "Validates identity, amount, fee, route, freshness, and venue requirements before confirmation." },
];

export function DocsContent() {
  return (
    <article className="min-w-0">
      <section id="introduction" className="scroll-mt-36 border-b border-black/15 pb-16">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--atlas-coral)]">Start here / v0.1.0</p>
        <h1 className="mt-7 max-w-4xl font-serif text-[clamp(3.1rem,7vw,7.5rem)] leading-[0.86] tracking-[-0.06em]">
          Build on Robinhood.<br />Stay connected to Solana.
        </h1>
        <p className="mt-9 max-w-2xl text-lg leading-8 text-black/55">
          Silfable is a Robinhood Chain-first trading workspace for supported ETH↔USDG swaps and two-way Robinhood USDG↔Solana USDC bridges. Solana remains available for Jupiter swaps, Pump.fun launches, and connected settlement workflows.
        </p>
        <div className="mt-10 grid border-t border-l border-black/15 sm:grid-cols-3">
          {["Robinhood Chain · 4663", "Solana connected", "Result tracked"].map((item) => (
            <div key={item} className="flex items-center gap-3 border-r border-b border-black/15 p-5 text-xs font-medium text-black">
              <Check className="size-4 text-[var(--atlas-coral)]" /> {item}
            </div>
          ))}
        </div>
      </section>

      <section id="quick-start" className="scroll-mt-36 border-b border-black/15 py-16">
        <DocHeading number="01" title="Quick start" />
        <p className="doc-lead">Choose web or desktop, configure the providers required by your network, then open a workspace with the wallet you intend to use.</p>
        <ol className="mt-10 space-y-7">
          {[
            ["Choose", "Use desktop for encrypted local-vault signing, or web with a connected browser wallet."],
            ["Configure", "Verify Robinhood Chain ID 4663 and its RPC first, then add the providers and transaction limits required by your workflow."],
            ["Describe", "Select a Robinhood wallet for the primary workspace, or choose Solana for a connected workflow. Opening a workspace does not authorize a transaction."],
            ["Review", "Inspect the assets, amount, route, simulation, fees, and quote freshness. Confirm the action, then follow its final status."],
          ].map(([title, text], index) => (
            <li key={title} className="grid gap-3 border-t border-black/10 pt-6 sm:grid-cols-[3rem_8rem_1fr]">
              <span className="font-mono text-sm text-[var(--atlas-coral)]">{String(index + 1).padStart(2, "0")}</span>
              <strong className="font-serif text-xl font-normal">{title}</strong>
              <span className="text-sm leading-7 text-black/70">{text}</span>
            </li>
          ))}
        </ol>
      </section>

      <section id="core-concepts" className="scroll-mt-36 border-b border-black/15 py-16">
        <DocHeading number="02" title="Core concepts" />
        <p className="doc-lead">Three concepts explain how a request moves from an idea to a supported market action.</p>
        <div className="mt-10 grid border-t border-l border-black/15 md:grid-cols-3">
          {concepts.map((concept) => {
            const Icon = concept.icon;
            return (
              <div key={concept.title} className="border-r border-b border-black/15 p-6">
                <Icon className="size-5 text-[var(--atlas-lilac)]" strokeWidth={1.5} />
                <h3 className="mt-12 font-serif text-3xl tracking-[-0.04em]">{concept.title}</h3>
                <p className="mt-4 text-sm leading-7 text-black/50">{concept.text}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section id="desk-rule" className="scroll-mt-36 border-b border-black/15 py-16">
        <DocHeading number="03" title="Transaction settings" />
        <p className="doc-lead">Global limits define the amounts, fees, slippage, and venues Silfable may present for confirmation. A new request cannot silently raise them.</p>
        <div className="mt-8 mb-8 overflow-hidden rounded-xl border border-black/10 shadow-sm">
          <Image src="/setting.app.png" alt="Transaction Settings UI" width={1200} height={800} className="w-full object-cover" />
        </div>
        <div className="border-l-2 border-[var(--atlas-coral)] bg-[rgb(255_107_92_/_0.1)] p-5 text-sm leading-7 text-[var(--atlas-bone)]">
          If required route data is missing, stale, or outside your configured limits, Silfable stops the action before wallet confirmation.
        </div>
      </section>

      <section id="mission-lifecycle" className="scroll-mt-36 border-b border-black/15 py-16">
        <DocHeading number="04" title="Transaction lifecycle" />
        <p className="doc-lead">Each action moves through explicit stages, allowing the interface to distinguish preparation from an onchain result.</p>
        <div className="mt-10 space-y-0 border-t border-black/15">
          {[
            ["Prepared", "Silfable gathers the required parameters and creates a venue-specific transaction preview."],
            ["Validated", "Route checks validate the wallet, assets, amount, limits, provider response, and quote freshness."],
            ["Simulated", "An unsigned transaction is inspected and simulated where the venue supports it."],
            ["Confirmed", "Fresh validation passes and the user authorizes one signing attempt in the active wallet surface."],
            ["Tracked", "Success, failure, or an unresolved broadcast is checked independently and saved to the transaction record."],
          ].map(([state, description], index) => (
            <div key={state} className="grid grid-cols-[2.5rem_7rem_1fr] gap-3 border-b border-black/15 py-5 sm:grid-cols-[4rem_10rem_1fr]">
              <span className="font-mono text-sm text-black/45">0{index + 1}</span>
              <strong className="text-sm font-medium text-black">{state}</strong>
              <span className="text-sm leading-6 text-black/70">{description}</span>
            </div>
          ))}
        </div>
      </section>

      <section id="security" className="scroll-mt-36 border-b border-black/15 py-16">
        <DocHeading number="05" title="Security model" />
        <p className="doc-lead">Silfable keeps wallet signing, route validation, provider responses, and transaction outcomes in clearly defined parts of the system.</p>
        <div className="mt-10 grid gap-5 sm:grid-cols-2">
          {[
            { icon: KeyRound, title: "Wallet-specific signing", text: "Desktop keys remain in the encrypted local vault; web confirmations remain inside the connected browser wallet." },
            { icon: ShieldCheck, title: "Bounded workflows", text: "Each workspace uses the markets, sizes, and actions allowed by the active transaction settings." },
            { icon: Monitor, title: "Checks before confirmation", text: "Silfable evaluates route and limit requirements before asking the active wallet to sign." },
            { icon: AlertTriangle, title: "Stops on uncertainty", text: "Unavailable price data, invalid routes, or incomplete provider evidence stop the action instead of being ignored." },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.title} className="border border-black/15 p-6">
                <Icon className="size-5 text-[var(--atlas-lilac)]" strokeWidth={1.5} />
                <h3 className="mt-8 font-serif text-2xl tracking-[-0.03em]">{item.title}</h3>
                <p className="mt-3 text-sm leading-7 text-black/50">{item.text}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section id="receipts" className="scroll-mt-36 border-b border-black/15 py-16">
        <DocHeading number="06" title="Transaction records" />
        <p className="doc-lead">A transaction record captures what was prepared, validated, simulated, confirmed, broadcast, and checked afterward. A quote or simulation is never presented as settlement.</p>
        <div className="mt-9 overflow-x-auto">
          <table className="min-w-[42rem] w-full text-left text-sm">
            <thead className="border-b border-black/20 font-mono text-[9px] uppercase tracking-[0.17em] text-black/35">
              <tr><th className="py-4 font-normal">Event</th><th className="py-4 font-normal">Recorded data</th><th className="py-4 font-normal">Retention</th></tr>
            </thead>
            <tbody className="divide-y divide-black/10 text-black/55">
              <tr><td className="py-5 text-ink">Observation</td><td>Source, timestamp, market snapshot</td><td>Local</td></tr>
              <tr><td className="py-5 text-ink">Policy check</td><td>Rule inputs, result, reason</td><td>Local</td></tr>
              <tr><td className="py-5 text-ink">Execution</td><td>Route, signature, settlement state</td><td>Local + chain</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section id="cli" className="scroll-mt-36 border-b border-black/15 py-16">
        <DocHeading number="07" title="Capability status" />
        <p className="doc-lead">Implemented code is not the same as production clearance. Each mutable lane retains an independent release gate.</p>
        <div className="mt-9 overflow-x-auto">
          <table className="min-w-[48rem] w-full text-left text-sm">
            <thead className="border-b border-black/20 font-mono text-[9px] uppercase tracking-[0.17em] text-black/35">
              <tr><th className="py-4 font-normal">Lane</th><th className="py-4 font-normal">Current state</th><th className="py-4 font-normal">Release boundary</th></tr>
            </thead>
            <tbody className="divide-y divide-black/10 text-black/55">
              <tr><td className="py-5 text-ink">Solana Swap</td><td>Verified restricted Jupiter path</td><td>Fresh checks and explicit wallet approval remain mandatory</td></tr>
              <tr><td className="py-5 text-ink">Token Launch</td><td>Verified restricted Pump.fun desktop and browser-wallet web implementation</td><td>Unsigned simulation, exact final review, explicit signing, and receipt verification remain mandatory</td></tr>
              <tr><td className="py-5 text-ink">Robinhood Swap</td><td>Verified restricted ETH-USDG execution</td><td>Healthy Robinhood RPC, live route, balance, gas, and wallet approval are required</td></tr>
              <tr><td className="py-5 text-ink">Bridge</td><td>Verified restricted Solana-Robinhood execution in both directions</td><td>Provider route, liquidity, source confirmation, and destination settlement are checked per transfer</td></tr>
              <tr><td className="py-5 text-ink">DCA / TP-SL</td><td>Verified restricted monitoring, proposal, wallet-approval, and receipt lifecycle</td><td>No autonomous signing or unattended broadcast</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section id="troubleshooting" className="scroll-mt-36 py-16">
        <DocHeading number="08" title="Troubleshooting" />
        <div className="mt-10 divide-y divide-black/15 border-t border-black/15">
          {[
            ["A proposal is blocked", "Confirm the wallet network, exact asset identity, amount, provider configuration, deadline, and global transaction limits."],
            ["Wallet signature is not requested", "Confirm the session reached approval state and the proposed action passed every policy check."],
            ["Runtime shows stale market data", "Refresh the wallet, verify RPC connectivity, and request a new quote. Never reuse stale simulation evidence."],
            ["A receipt is missing", "Check the local workspace path and available disk space. Silfable fails closed when receipt storage is unavailable."],
          ].map(([problem, answer]) => (
            <div key={problem} className="grid gap-3 py-6 sm:grid-cols-[14rem_1fr]">
              <strong className="text-sm font-medium">{problem}</strong>
              <p className="text-sm leading-7 text-black/50">{answer}</p>
            </div>
          ))}
        </div>
      </section>
    </article>
  );
}

function DocHeading({ number, title }: { number: string; title: string }) {
  return (
    <div className="flex items-baseline gap-5">
      <span className="font-mono text-sm tracking-[0.18em] text-[var(--atlas-coral)]">{number}</span>
      <h2 className="font-serif text-4xl tracking-[-0.045em] sm:text-5xl">{title}</h2>
    </div>
  );
}
