import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

const chapters = [
  { label: "Whitepaper", href: "#whitepaper" },
  { label: "Introduction", href: "#introduction" },
  { label: "Installation", href: "#quick-start" },
  { label: "How it works", href: "#core-concepts" },
  { label: "Transaction settings", href: "#desk-rule" },
  { label: "Transaction lifecycle", href: "#mission-lifecycle" },
  { label: "Security model", href: "#security" },
  { label: "Transaction records", href: "#receipts" },
  { label: "Capability status", href: "#cli" },
  { label: "Troubleshooting", href: "#troubleshooting" },
];

export function DocsSidebar() {
  return (
    <>
      <ScrollArea className="sticky top-20 z-30 -mx-5 w-[calc(100%+2.5rem)] border-b border-black/15 bg-paper px-5 lg:hidden">
        <nav aria-label="Documentation chapters" className="flex w-max gap-6 py-4">
          {chapters.map((chapter) => (
            <a key={`${chapter.href}-${chapter.label}`} href={chapter.href} className="text-[9px] font-semibold uppercase tracking-[0.16em] text-black/45 hover:text-[var(--atlas-coral)]">
              {chapter.label}
            </a>
          ))}
        </nav>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      <aside className="hidden lg:block h-full">
        <div className="sticky top-28">
          <p className="mb-6 font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--atlas-aqua)]">Atlas index</p>
          <ScrollArea className="h-[calc(100vh-15rem)]">
          <nav aria-label="Documentation chapters" className="border-l border-black/15 pr-4">
            {chapters.map((chapter, index) => (
              <a
                key={`${chapter.href}-${chapter.label}`}
                href={chapter.href}
                className="group flex items-center gap-4 border-l border-transparent py-2.5 pl-5 text-sm text-black/45 transition-colors hover:border-[var(--atlas-coral)] hover:text-ink"
              >
                <span className="font-mono text-[8px] text-black/25">{String(index + 1).padStart(2, "0")}</span>
                {chapter.label}
              </a>
            ))}
          </nav>
          </ScrollArea>
          <div className="mt-10 border-t border-black/15 pt-6">
            <p className="font-mono text-[8px] uppercase tracking-[0.18em] text-black/30">Current docs</p>
            <p className="mt-2 font-mono text-xs text-[var(--atlas-lilac)]">v0.1.0</p>
          </div>
        </div>
      </aside>
    </>
  );
}
