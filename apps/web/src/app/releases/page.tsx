import type { Metadata } from "next";

import { ReleaseDownloads } from "@/components/releases/ReleaseDownloads";
import { ReleaseHero } from "@/components/releases/ReleaseHero";
import { ReleaseHistory } from "@/components/releases/ReleaseHistory";
import { UpdatePolicy } from "@/components/releases/UpdatePolicy";

export const metadata: Metadata = {
  title: "Changelog - Silfable",
  description: "Review Silfable product changes, desktop builds, checksums, compatibility, and update channels.",
};

import { PageTransition } from "@/components/ui/PageTransition";

export default function ReleasesPage() {
  return (
    <PageTransition>
      <main className="publicPage releasesTheme bg-paper text-ink">
        <ReleaseHero />
        <div className="section-shell">
          <ReleaseDownloads />
          <ReleaseHistory />
          <UpdatePolicy />
        </div>
      </main>
    </PageTransition>
  );
}
