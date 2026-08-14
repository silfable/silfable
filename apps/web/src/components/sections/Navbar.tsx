import Image from "next/image";
import Link from "next/link";

import { SILFABLE_X_URL } from "@/lib/social-links";

const navLinks = [{ label: "Capabilities", href: "/#networks" }, { label: "Docs", href: "/docs" }, { label: "Changelog", href: "/releases" }];

function XMark() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="size-3.5" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.657l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" /></svg>;
}

export function Navbar() {
  return (
    <header className="publicNav fixed inset-x-0 top-0 z-50">
      <div className="section-shell publicNavInner flex items-center justify-between gap-5">
        <Link href="/" className="brandWordmark flex items-center gap-3" aria-label="Silfable home"><Image src="/logo.png" alt="" width={34} height={34} priority /><span>Silfable</span></Link>
        <nav aria-label="Primary navigation" className="operatorNavLinks hidden items-center lg:flex">
          {navLinks.map(link => <Link key={link.label} href={link.href} className="operatorNavLink">{link.label}</Link>)}
          <a href={SILFABLE_X_URL} target="_blank" rel="noopener noreferrer" className="operatorNavLink operatorSocialLink" aria-label="Follow Silfable on X"><XMark /></a>
        </nav>

        <Link href="/connect" className="solarNavCta">Open workspace <span>↗</span></Link>

      </div>
    </header>
  );
}
