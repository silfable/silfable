"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";

type CodeBlockProps = {
  code: string;
  label: string;
};

export function CodeBlock({ code, label }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = code;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    setCopied(true);
  }

  return (
    <div className="my-8 overflow-hidden border border-white/15 bg-[#07101f] text-slate-300">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
        <span className="font-mono text-[9px] uppercase tracking-[0.17em] text-slate-500">{label}</span>
        <button
          type="button"
          onClick={copyCode}
          className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.15em] text-slate-500 transition-colors hover:text-[var(--sc-orange)]"
          aria-label={`Copy ${label}`}
        >
          {copied ? <Check className="size-3.5 text-[var(--sc-ice)]" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-5 font-mono text-[11px] leading-7 sm:p-7 sm:text-xs"><code>{code}</code></pre>
    </div>
  );
}
