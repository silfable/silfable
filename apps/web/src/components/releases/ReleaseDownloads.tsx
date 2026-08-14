import { Apple, ArrowDownToLine, CheckCircle2, Clock3, FileKey2, Laptop, MonitorDown } from "lucide-react";

import { CurrentReveal } from "@/components/motion/CurrentMotion";
import { Button } from "@/components/ui/button";

const linuxArtifacts = [
  { label: "AppImage · x64", href: "https://github.com/silfable/silfable/releases/download/v0.1.0/Silfable-0.1.0-x86_64.AppImage", primary: true },
  { label: "AppImage · ARM64", href: "https://github.com/silfable/silfable/releases/download/v0.1.0/Silfable-0.1.0-arm64.AppImage", primary: false },
  { label: "Debian · x64", href: "https://github.com/silfable/silfable/releases/download/v0.1.0/Silfable-0.1.0-amd64.deb", primary: false },
  { label: "Debian · ARM64", href: "https://github.com/silfable/silfable/releases/download/v0.1.0/Silfable-0.1.0-arm64.deb", primary: false },
] as const;

const upcoming = [
  { platform: "macOS", detail: "Apple Silicon & Intel", note: "Pending signing and compatibility validation", icon: Apple },
  { platform: "Windows", detail: "x64 installer", note: "Available after preview acceptance testing", icon: Laptop },
] as const;

export function ReleaseDownloads() {
  return (
    <section id="downloads" className="scroll-mt-24 border-b border-[var(--line)] py-20 sm:py-28">
      <CurrentReveal className="releaseDownloadHeading">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--sc-orange)]">Release artifacts / 0.1.0</p>
          <h2 className="mt-5 text-5xl font-bold tracking-[-0.06em] sm:text-6xl">Install the Linux preview.</h2>
        </div>
        <p>Choose the artifact that matches your processor and package format. Every transaction still requires an explicit wallet review.</p>
      </CurrentReveal>

      <div className="releaseDownloadConsole mt-10">
        <CurrentReveal className="releaseLinuxFeature" delay={0.06}>
          <div className="releaseLinuxIdentity">
            <div className="releasePlatformIcon"><MonitorDown /></div>
            <div><span>AVAILABLE NOW</span><h3>Linux</h3><p>AppImage and Debian · x64 and ARM64</p></div>
          </div>
          <div className="releaseBuildLedger">
            <span>VERSION <strong>0.1.0</strong></span><span>CHANNEL <strong>Preview</strong></span><span>EXECUTION <strong>Wallet reviewed</strong></span>
          </div>
          <div className="releaseArtifactGrid">
            {linuxArtifacts.map((artifact) => (
              <Button key={artifact.label} asChild variant={artifact.primary ? undefined : "outline"} className={artifact.primary ? "solarPrimaryButton" : "outlineButton"}>
                <a href={artifact.href} download>{artifact.label}<ArrowDownToLine className="ml-3 size-4" /></a>
              </Button>
            ))}
          </div>
          <p className="releaseVerifyNote"><FileKey2 /> Verify the selected artifact against SHA256SUMS.txt before installation.</p>
        </CurrentReveal>

        <CurrentReveal className="releaseUpcoming" delay={0.12}>
          <div className="releaseUpcomingHeader"><span>NEXT PLATFORMS</span><Clock3 /></div>
          {upcoming.map((build) => {
            const Icon = build.icon;
            return <article key={build.platform} className="releaseUpcomingRow"><Icon /><div><h3>{build.platform}</h3><p>{build.detail}</p></div><span>COMING SOON</span><small>{build.note}</small></article>;
          })}
          <div className="releaseAvailabilityNote"><CheckCircle2 /> Linux remains the only public preview download in v0.1.0.</div>
        </CurrentReveal>
      </div>
    </section>
  );
}
