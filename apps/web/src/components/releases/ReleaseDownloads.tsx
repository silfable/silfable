import { Apple, ArrowDownToLine, Clock3, FileKey2, Laptop } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AtlasReveal } from "@/components/motion/AtlasMotion";

const builds = [
  { platform: "macOS", detail: "Apple Silicon & Intel", file: "Signed package in preparation", requirement: "Will be published after platform signing and compatibility validation.", href: null },
  { platform: "Windows", detail: "x64 installer", file: "Installer in preparation", requirement: "Will follow the Linux preview acceptance process.", href: null },
  { platform: "Linux", detail: "AppImage & Debian · x64 + ARM64", file: "Silfable-0.1.0-x86_64.AppImage", requirement: "Choose x64 for Intel/AMD PCs or ARM64 for aarch64 devices. Verify the artifact against SHA256SUMS.txt.", href: "https://github.com/silfable/silfable/releases/download/v0.1.0/Silfable-0.1.0-x86_64.AppImage" },
] as const;

export function ReleaseDownloads() {
  return (
    <section id="downloads" className="scroll-mt-24 border-b border-[var(--line)] py-20 sm:py-28">
      <AtlasReveal className="grid gap-8 border-b border-[var(--line)] pb-11 lg:grid-cols-[minmax(0,1fr)_23rem] lg:items-end">
        <div><p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--atlas-coral)]">Release artifacts / 0.1.0</p><h2 className="mt-5 text-5xl font-bold tracking-[-0.06em] sm:text-6xl">Choose your platform.</h2></div>
        <p className="text-sm leading-7 text-[var(--muted)]">Every download is labelled by release state, supported platform, and verification requirements. Installing a build does not enable unattended transactions.</p>
      </AtlasReveal>
      <AtlasReveal className="releaseSpecimens mt-10 grid gap-4 lg:grid-cols-[.8fr_.8fr_1.4fr]" delay={0.08}>
        {builds.map((build) => {
          const Icon = build.platform === "macOS" ? Apple : Laptop;
          const available = Boolean(build.href);
          return <article key={build.platform} className={`releaseSpecimen flex min-h-[25rem] flex-col border border-[var(--line)] p-6 sm:p-8 ${available ? "isAvailable" : ""}`}>
            <div className="flex items-center gap-3 text-lg font-semibold"><Icon className="size-5 text-[var(--atlas-lilac)]" /> {build.platform}</div>
            <p className="mt-3 font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--blue-2)]">{build.detail}</p>
            <div className="mt-9 grid gap-3">
              {available ? <Button asChild className="atlasCoralButton w-full "><a href={build.href ?? undefined} download>AppImage · x64 <ArrowDownToLine className="ml-3 size-4" /></a></Button> : <Button disabled className="w-full text-slate-700">Coming soon <Clock3 className="ml-3 size-4" /></Button>}
              {available ? <Button asChild variant="outline" className="outlineButton w-full"><a href="https://github.com/silfable/silfable/releases/download/v0.1.0/Silfable-0.1.0-arm64.AppImage" download>AppImage · ARM64</a></Button> : <Button disabled variant="outline" className="outlineButton w-full">Release notes</Button>}
              {available ? <div className="grid grid-cols-2 gap-2"><Button asChild variant="outline" className="outlineButton w-full"><a href="https://github.com/silfable/silfable/releases/download/v0.1.0/Silfable-0.1.0-amd64.deb" download>Debian x64</a></Button><Button asChild variant="outline" className="outlineButton w-full"><a href="https://github.com/silfable/silfable/releases/download/v0.1.0/Silfable-0.1.0-arm64.deb" download>Debian ARM64</a></Button></div> : null}
            </div>
            <div className="mt-6 border-t border-[var(--line)] pt-6"><p className="font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--blue-2)]">Build details</p><p className="mt-3 text-sm leading-6 text-[var(--muted)]">{build.requirement}</p></div>
          </article>;
        })}
      </AtlasReveal>
      <AtlasReveal delay={0.16}><p className="mt-6 flex items-center gap-3 font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--muted)]"><FileKey2 className="size-4 text-[var(--atlas-coral)]" /> Verify each downloaded artifact against SHA256SUMS.txt.</p></AtlasReveal>
    </section>
  );
}
