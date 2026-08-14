import { Cloud, HardDrive } from "lucide-react";

import { AtlasKicker, AtlasPanel, NetworkBadge } from "@/components/atlas/AtlasPrimitives";
import { AtlasReveal } from "@/components/motion/AtlasMotion";

export function SurfaceCompare() {
  return (
    <section className="atlasSection">
      <div className="section-shell">
        <AtlasReveal className="atlasSectionHeader">
          <div><AtlasKicker tone="aqua">Choose a surface</AtlasKicker><h2>Same map.<br />Different signing path.</h2></div>
          <p>Web and desktop share the Silfable workflow, but they do not handle signing in the same place. Choose the surface that fits the action you want to prepare.</p>
        </AtlasReveal>
        <AtlasReveal className="surfaceCompare" delay={0.08}>
          <AtlasPanel className="surfaceCard" tone="aqua">
            <Cloud className="size-7 atlasTone-aqua" />
            <NetworkBadge tone="aqua">Browser wallet</NetworkBadge>
            <h3>Web</h3>
            <p>Open the workspace from a browser and confirm each supported transaction in the connected source wallet.</p>
            <div className="surfaceList"><span>Connected wallet confirmation</span><span>No uploaded private key</span><span>Supported browser workflows</span></div>
          </AtlasPanel>
          <AtlasPanel className="surfaceCard" tone="lilac">
            <HardDrive className="size-7 atlasTone-lilac" />
            <NetworkBadge tone="lilac">Local vault</NetworkBadge>
            <h3>Desktop</h3>
            <p>Run the native workspace with encrypted local wallet storage, local transaction records, and desktop-specific workflows.</p>
            <div className="surfaceList"><span>Encrypted local vault</span><span>Local activity records</span><span>Platform release channels</span></div>
          </AtlasPanel>
        </AtlasReveal>
      </div>
    </section>
  );
}
