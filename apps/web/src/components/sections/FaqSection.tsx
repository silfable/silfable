import { ArrowUpRight } from "lucide-react";

import { AtlasKicker, StatusMarker } from "@/components/atlas/AtlasPrimitives";
import { AtlasReveal } from "@/components/motion/AtlasMotion";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const faqs = [
  ["What can I do on Robinhood Chain today?", "Silfable supports reviewed swaps on Robinhood Chain and two-way routes between Robinhood and Solana. Every action still depends on fresh network, provider, liquidity, wallet, and settlement evidence."],
  ["How does signing differ between web and desktop?", "Web transactions are confirmed in the connected browser wallet. Desktop can sign supported transactions through its encrypted local vault. Silfable does not ask you to upload a seed phrase to the web service."],
  ["What will I see before confirming a transaction?", "The review depends on the workflow, but includes the source wallet, network, exact assets, amount, expected output, route, fees, timing, and checks required for that venue."],
  ["What happens when route data is incomplete or out of date?", "Silfable stops the action and explains which input needs attention. You may need to refresh the quote, correct the wallet or asset, adjust a limit, or start a new review."],
  ["Is Solana still supported?", "Yes. Solana remains available for swaps, token launches, research, reviewed automation proposals, and the connected side of supported bridge routes. Robinhood Chain remains the primary product focus."],
] as const;

export function FaqSection() {
  return (
    <section className="atlasSection faqAtlas">
      <div className="section-shell faqLayout">
        <AtlasReveal className="faqIntro"><AtlasKicker tone="aqua">Field notes / FAQ</AtlasKicker><h2>Know before<br />you connect.</h2><p className="mt-8 max-w-sm leading-7 text-[var(--atlas-muted)]">Practical answers about workflows, wallet confirmation, route reviews, and current platform coverage.</p><a href="/docs" className="mt-8 inline-flex items-center gap-2 text-sm text-[var(--atlas-citron)]">Explore documentation <ArrowUpRight className="size-4" /></a></AtlasReveal>
        <AtlasReveal delay={0.08}><div className="mb-7"><StatusMarker tone="citron">Five field notes</StatusMarker></div><Accordion type="single" collapsible className="faqNotes">{faqs.map(([question, answer], index) => <AccordionItem key={question} value={`note-${index}`} className="text-left"><AccordionTrigger className="faqQuestionTrigger py-7 text-xl"><span className="font-mono text-[9px] text-[var(--atlas-coral)]">N{String(index + 1).padStart(2, "0")}</span><span className="faqQuestionText">{question}</span></AccordionTrigger><AccordionContent className="faqAnswer max-w-2xl text-base leading-8 text-[var(--atlas-muted)]">{answer}</AccordionContent></AccordionItem>)}</Accordion></AtlasReveal>
      </div>
    </section>
  );
}
