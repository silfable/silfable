import Image from "next/image";
import Link from "next/link";

import { StatusMarker, WingMark } from "@/components/atlas/AtlasPrimitives";

export function Footer() {
  return (
    <footer className="atlasFooter">
      <div className="section-shell atlasFooterMap">
        <div className="atlasFooterBrand"><WingMark /><h2>Follow the route.<br />Know the result.</h2><div className="mt-8"><StatusMarker>Mainnet routes active</StatusMarker></div></div>
        <div className="atlasFooterGroup"><h3>Atlas</h3><Link href="/#networks">Networks</Link><Link href="/connect">Web workspace</Link><Link href="/#download">Desktop</Link></div>
        <div className="atlasFooterGroup"><h3>Reference</h3><Link href="/docs">Documentation</Link><Link href="/whitepaper">Whitepaper</Link><Link href="/releases">Changelog</Link></div>        
      </div>
      <div className="section-shell atlasFooterBottom"><Link href="/" className="flex items-center gap-3 text-[var(--atlas-bone)]"><Image src="/logo.png" alt="" width={24} height={24} /> Silfable</Link><span>© 2026 Silfable Labs · Markets involve risk · Verify every transaction</span></div>
    </footer>
  );
}
