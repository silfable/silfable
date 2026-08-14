"use client";

import { usePathname } from "next/navigation";
import { Footer } from "@/components/sections/Footer";

export function ConditionalFooter() {
  const pathname = usePathname();
  if (pathname === "/trade" || pathname === "/connect") {
    return null;
  }
  return <Footer />;
}
