import type { Metadata } from "next";
import { IBM_Plex_Mono, Manrope, Space_Grotesk } from "next/font/google";

import { ConditionalFooter } from "@/components/sections/ConditionalFooter";
import { ConditionalNavbar } from "@/components/sections/ConditionalNavbar";
import { SolanaProvider } from "@/components/providers/SolanaProvider";
import "./globals.css";
import "./solar-current-public.css";
import "./solar-current-workspace.css";

const sans = Manrope({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Silfable — Solana Execution Workspace",
  description:
    "Plan Solana swaps, token launches, automations, and connected routes—then review every transaction before wallet approval.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Silfable",
    title: "Silfable — Solana Execution Workspace",
    description:
      "Plan Solana swaps, token launches, automations, and connected routes—then review every transaction before wallet approval.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Silfable Solana-first execution workspace",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@silfable",
    creator: "@silfable",
    title: "Silfable — Solana Execution Workspace",
    description:
      "Plan Solana swaps, token launches, automations, and connected routes—then review every transaction before wallet approval.",
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
