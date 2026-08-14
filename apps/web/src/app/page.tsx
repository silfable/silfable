import { Hero } from "@/components/sections/Hero";
import { FeatureGrid } from "@/components/sections/FeatureGrid";
import { DownloadTable } from "@/components/sections/DownloadTable";
import { FaqSection } from "@/components/sections/FaqSection";
import { TerminalMockup } from "@/components/sections/TerminalMockup";
import { ValueProps } from "@/components/sections/ValueProps";
import { SurfaceCompare } from "@/components/sections/SurfaceCompare";

import { PageTransition } from "@/components/ui/PageTransition";

export default function Home() {
  return (
    <PageTransition>
      <main>
        <Hero />
        <FeatureGrid />
        <ValueProps />
        <TerminalMockup />
        <SurfaceCompare />
        <DownloadTable />
        <FaqSection />
      </main>
    </PageTransition>
  );
}
