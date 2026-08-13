"use client";

import { useEffect, useState } from "react";
import { ImagePlus, ShieldAlert, UploadCloud } from "lucide-react";

export type PublishedTokenMetadata = {
  imageUri: string;
  metadataUri: string;
  metadataGatewayUrl: string;
  metadataSha256: string;
};

export type PublishedTokenLaunchDraft = PublishedTokenMetadata & {
  name: string;
  symbol: string;
  description: string;
  maxCreatorOutflowLamports: string;
  maxPriorityFeeLamports: string;
};

export function TokenLaunchPanel({
  creatorWallet,
  walletReady,
  onClose,
  onPublished,
}: {
  creatorWallet: string;
  walletReady: boolean;
  onClose: () => void;
  onPublished: (draft: PublishedTokenLaunchDraft) => void;
}) {
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [xUrl, setXUrl] = useState("");
  const [telegramUrl, setTelegramUrl] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [outflow, setOutflow] = useState("10000000");
  const [priorityFee, setPriorityFee] = useState("100000");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = walletReady && name.trim().length > 0 && symbol.trim().length > 0 && Boolean(image) && acknowledged;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [busy, onClose]);

  async function publish(): Promise<void> {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      if (!image) throw new Error("Choose a token image to upload through Pinata.");
      const form = new FormData();
      form.set("walletAddress", creatorWallet);
      form.set("name", name.trim());
      form.set("symbol", symbol.trim().toUpperCase());
      form.set("description", description.trim());
      form.set("websiteUrl", websiteUrl.trim());
      form.set("xUrl", xUrl.trim());
      form.set("telegramUrl", telegramUrl.trim());
      form.set("image", image);
      const response = await fetch("/api/token-launch/metadata", { method: "POST", body: form });
      const result = await response.json() as { error?: string } & Partial<PublishedTokenMetadata>;
      if (!response.ok || !result.imageUri || !result.metadataUri || !result.metadataGatewayUrl || !result.metadataSha256) {
        throw new Error(result.error || "Token metadata could not be published.");
      }
      onPublished({
        imageUri: result.imageUri,
        metadataUri: result.metadataUri,
        metadataGatewayUrl: result.metadataGatewayUrl,
        metadataSha256: result.metadataSha256,
        name: name.trim(),
        symbol: symbol.trim().toUpperCase(),
        description: description.trim(),
        maxCreatorOutflowLamports: outflow,
        maxPriorityFeeLamports: priorityFee,
      });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Token metadata could not be published.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[#030611]/85 p-3 backdrop-blur-md sm:p-6" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onClose();
    }}>
    <section className="flex max-h-[calc(100vh-1.5rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-cyan-400/30 bg-[#0a1020] shadow-[0_38px_120px_rgba(0,0,0,0.72)] sm:max-h-[calc(100vh-3rem)]" role="dialog" aria-modal="true" aria-labelledby="token-launch-modal-title">
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-white/10 px-5 py-4 sm:px-6">
        <div>
          <p className="font-mono text-[10px] tracking-[0.18em] text-cyan-300">TOKEN LAUNCH · METADATA DRAFT</p>
          <h2 id="token-launch-modal-title" className="mt-1 text-lg font-semibold text-white">Prepare Pump.fun launch metadata</h2>
          <p className="mt-1 text-xs leading-5 text-slate-400">The token image and metadata JSON are uploaded to public IPFS through Pinata. This step does not create, sign, or broadcast a token transaction.</p>
        </div>
        <button type="button" onClick={onClose} disabled={busy} className="grid size-9 shrink-0 place-items-center rounded-full border border-white/10 text-lg text-slate-400 transition hover:border-cyan-300/40 hover:text-white disabled:opacity-40" aria-label="Close Token Launch modal">×</button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">
      {!walletReady && <p className="mb-3 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-200">Connect the Solana wallet bound to this session before publishing metadata.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-slate-300">Name<input maxLength={32} value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" /></label>
        <label className="text-xs text-slate-300">Symbol<input maxLength={10} value={symbol} onChange={(event) => setSymbol(event.target.value.toUpperCase().replace(/[^A-Z0-9]/gu, ""))} className="mt-1 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" /></label>
        <label className="text-xs text-slate-300 sm:col-span-2">Description<textarea maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} className="mt-1 min-h-20 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" /></label>
        <label className="text-xs text-slate-300 sm:col-span-2">Token image via Pinata (PNG, JPEG, GIF, or WebP; max 10 MB)<span className="mt-1 flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-cyan-400/35 bg-cyan-400/5 px-3 py-2 text-sm text-cyan-100"><ImagePlus className="size-4" />{image ? image.name : "Choose image"}<input type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="sr-only" onChange={(event) => setImage(event.target.files?.[0] ?? null)} /></span></label>
        <label className="text-xs text-slate-300">Website (optional)<input type="url" placeholder="https://..." value={websiteUrl} onChange={(event) => setWebsiteUrl(event.target.value)} className="mt-1 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" /></label>
        <label className="text-xs text-slate-300">X profile (optional)<input type="url" placeholder="https://x.com/..." value={xUrl} onChange={(event) => setXUrl(event.target.value)} className="mt-1 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" /></label>
        <label className="text-xs text-slate-300 sm:col-span-2">Telegram (optional)<input type="url" placeholder="https://t.me/..." value={telegramUrl} onChange={(event) => setTelegramUrl(event.target.value)} className="mt-1 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" /></label>
        <label className="text-xs text-slate-300">Maximum creator outflow (lamports)<input inputMode="numeric" value={outflow} onChange={(event) => setOutflow(event.target.value.replace(/\D/gu, ""))} className="mt-1 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" /></label>
        <label className="text-xs text-slate-300">Maximum priority fee (lamports)<input inputMode="numeric" value={priorityFee} onChange={(event) => setPriorityFee(event.target.value.replace(/\D/gu, ""))} className="mt-1 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" /></label>
      </div>
      <label className="mt-4 flex items-start gap-2 text-xs leading-5 text-slate-300"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-1" /><span>I understand the metadata upload is public and irreversible. Publishing creates a review draft; launching still requires preflight, final review, and explicit wallet approval.</span></label>
      {error && <p className="mt-3 rounded-lg border border-rose-400/30 bg-rose-400/10 p-3 text-xs text-rose-200">{error}</p>}
      </div>
      <footer className="flex shrink-0 flex-col gap-3 border-t border-white/10 bg-[#0c1326] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"><span className="flex items-center gap-1 text-[10px] leading-4 text-slate-500"><ShieldAlert className="size-3.5 shrink-0" /> No transaction opens until the unsigned simulation passes.</span><div className="flex justify-end gap-2"><button type="button" disabled={busy} onClick={onClose} className="rounded-full border border-white/15 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-slate-300 hover:border-white/30 disabled:opacity-40">Cancel</button><button type="button" disabled={!valid || busy || !/^\d+$/u.test(outflow) || !/^\d+$/u.test(priorityFee)} onClick={() => void publish()} className="primaryButton inline-flex items-center gap-2 px-4 py-2 text-xs disabled:opacity-50"><UploadCloud className="size-3.5" />{busy ? "Publishing..." : "Publish & create draft"}</button></div></footer>
    </section>
    </div>
  );
}
