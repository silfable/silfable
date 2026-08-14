import type { Metadata } from "next";
import { Azeret_Mono, DM_Sans, Fraunces } from "next/font/google";

import { ConditionalFooter } from "@/components/sections/ConditionalFooter";
import { ConditionalNavbar } from "@/components/sections/ConditionalNavbar";
import { SolanaProvider } from "@/components/providers/SolanaProvider";
import "./globals.css";
import "./living-atlas-public.css";
import "./living-atlas-workspace.css";

const sans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const mono = Azeret_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Silfable — Robinhood Chain Trading Workspace",
  description:
    "Prepare reviewed Robinhood Chain swaps, connect with Solana workflows, and track each transaction from route to settlement.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Silfable",
    title: "Silfable — Robinhood Chain Trading Workspace",
    description:
      "Prepare reviewed Robinhood Chain swaps, connect with Solana workflows, and track each transaction from route to settlement.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Silfable Robinhood Chain-first trading workspace",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@silfable",
    creator: "@silfable",
    title: "Silfable — Robinhood Chain Trading Workspace",
    description:
      "Prepare reviewed Robinhood Chain swaps, connect with Solana workflows, and track each transaction from route to settlement.",
    images: ["/og-image.png"],
  },
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable} ${mono.variable}`} data-theme="dark" data-scroll-behavior="smooth">
      <body>
        <SolanaProvider>
          <ConditionalNavbar />
          {children}
          <ConditionalFooter />
        </SolanaProvider>
      </body>
    </html>
  );
}
