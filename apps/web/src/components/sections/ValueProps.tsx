import { AtlasKicker, NetworkBadge, WingMark } from "@/components/atlas/AtlasPrimitives";
import { AtlasReveal } from "@/components/motion/AtlasMotion";

export function ValueProps() {
  return (
    <section id="networks" className="atlasSection">
      <div className="section-shell">
        <AtlasReveal className="atlasSectionHeader">
          <div><AtlasKicker tone="lilac">Robinhood Chain atlas</AtlasKicker><h2>One primary chain.<br />One connected ecosystem.</h2></div>
          <p>Robinhood Chain leads the product experience. Solana remains a first-class connected network with its own assets, venues, and settlement requirements.</p>
        </AtlasReveal>
        <AtlasReveal className="networkAtlas" delay={0.08}>
          <article className="networkPlate atlasTone-lilac networkPlatePrimary">
            <WingMark />
            <NetworkBadge tone="lilac">Primary / Chain ID 4663</NetworkBadge>
            <h3>Robinhood</h3>
            <p>Prepare supported swaps through a pinned venue route, verify current Robinhood network state, and move value through reviewed cross-chain paths.</p>
            <div className="networkCapabilities"><span>Onchain swap</span><span>Pinned venue</span><span>Two-way bridge</span><span>Receipt tracking</span></div>
          </article>
          <article className="networkPlate atlasTone-aqua networkPlateConnected">
            <WingMark />
            <NetworkBadge tone="aqua">Connected ecosystem</NetworkBadge>
            <h3>Solana</h3>
            <p>Continue into connected Solana workflows for swaps, token launches, market research, automation proposals, and cross-chain settlement.</p>
            <div className="networkCapabilities"><span>Token swap</span><span>Token launch</span><span>Bridge settlement</span><span>Market research</span></div>
          </article>
        </AtlasReveal>
      </div>
    </section>
  );
}
