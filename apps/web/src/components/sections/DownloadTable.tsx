import { Apple, ArrowDownToLine, Clock3, Laptop } from "lucide-react";

import { AtlasKicker, StatusMarker } from "@/components/atlas/AtlasPrimitives";
import { AtlasReveal } from "@/components/motion/AtlasMotion";
import { Button } from "@/components/ui/button";

type PlatformRelease = { platform: string; detail: string; requirement: string; primaryLabel: string; href?: string; secondaryLabel?: string; secondaryHref?: string };

export async function DownloadTable() {
  let version = "0.1.0";
  let tag = "v0.1.0";
  try {
    const response = await fetch("https://api.github.com/repos/silfable/silfable/releases/latest", { next: { revalidate: 3600 } });
    if (response.ok) { const data = await response.json(); if (data.tag_name) { tag = data.tag_name; version = tag.replace(/^v/, ""); } }
  } catch { /* Pinned preview remains the fallback. */ }

  const releases: PlatformRelease[] = [
    { platform: "macOS", detail: "Apple Silicon & Intel", requirement: "Signed package in preparation.", primaryLabel: "Coming soon" },
    { platform: "Windows", detail: "x64 installer", requirement: "Queued after preview validation.", primaryLabel: "Coming soon" },
    { platform: "Linux", detail: "AppImage · x64 + ARM64", requirement: "Use x64 for Intel/AMD or ARM64 when `uname -m` returns aarch64/arm64.", primaryLabel: "AppImage · x64", href: `https://github.com/silfable/silfable/releases/download/${tag}/Silfable-${version}-x86_64.AppImage`, secondaryLabel: "AppImage · ARM64", secondaryHref: `https://github.com/silfable/silfable/releases/download/${tag}/Silfable-${version}-arm64.AppImage` },
  ];

  return (
    <section id="download" className="atlasSection downloadAtlas">
      <div className="section-shell">
        <AtlasReveal className="atlasSectionHeader">
          <div><AtlasKicker tone="coral">Desktop app / {version}</AtlasKicker><h2>Bring the atlas<br />to your machine.</h2></div>
          <p>Desktop keeps its encrypted vault, transaction checks, and activity records locally. Every platform is labelled with its current release state.</p>
        </AtlasReveal>
        <AtlasReveal className="downloadGrid" delay={0.08}>
          {releases.map(release => {
            const Icon = release.platform === "macOS" ? Apple : Laptop;
            return <article key={release.platform} className={`downloadCard ${release.href ? "isAvailable" : ""}`}>
              <div className="flex items-center justify-between gap-4"><Icon className="size-5" /><StatusMarker tone={release.href ? "citron" : "coral"}>{release.href ? "Preview" : "Planned"}</StatusMarker></div>
              <h3>{release.platform}</h3><p className="mt-2 text-sm">{release.detail}</p><p className="mt-6 text-xs leading-6">{release.requirement}</p>
              <div className="downloadActions grid gap-2">{release.href ? <Button asChild className="atlasPrimaryButton w-full"><a href={release.href} download>{release.primaryLabel}<ArrowDownToLine className="ml-3 size-4" /></a></Button> : <Button disabled className="w-full rounded-full">{release.primaryLabel}<Clock3 className="ml-3 size-4" /></Button>}{release.secondaryHref ? <Button asChild variant="outline" className="outlineButton w-full"><a href={release.secondaryHref} download>{release.secondaryLabel}<ArrowDownToLine className="ml-3 size-4" /></a></Button> : null}</div>
            </article>;
          })}
        </AtlasReveal>
        <AtlasReveal delay={0.16}><a href="/releases" className="mt-8 inline-flex items-center gap-3 font-mono text-[10px] uppercase tracking-[.14em] text-[#b53c32]">View changelog <ArrowDownToLine className="size-4" /></a></AtlasReveal>
      </div>
    </section>
  );
}
