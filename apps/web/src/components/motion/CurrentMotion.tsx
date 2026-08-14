"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

export function CurrentReveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const reduced = useReducedMotion();
  return <motion.div className={className} initial={reduced ? false : { opacity: 0, x: -18 }} whileInView={reduced ? undefined : { opacity: 1, x: 0 }} viewport={{ once: true, amount: .15 }} transition={{ duration: .5, delay, ease: [.2,.8,.2,1] }}>{children}</motion.div>;
}
