"use client";
import { useState } from "react";
import { Copy, Mail, MessageSquare, Share2 } from "lucide-react";

export function CopyLink({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const text = `${title} — ${url}`;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input readOnly value={url} className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-canvas px-3 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} aria-label="Lien commercial" />
      <button type="button" onClick={async () => { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="inline-flex h-9 items-center gap-1 rounded-full border border-line bg-white px-3 text-xs font-medium"><Copy className="h-3.5 w-3.5" />{copied ? "Copié !" : "Copier"}</button>
      <a href={`sms:?&body=${encodeURIComponent(text)}`} className="inline-flex h-9 items-center gap-1 rounded-full border border-line bg-white px-3 text-xs"><MessageSquare className="h-3.5 w-3.5" />SMS</a>
      <a href={`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(text)}`} className="inline-flex h-9 items-center gap-1 rounded-full border border-line bg-white px-3 text-xs"><Mail className="h-3.5 w-3.5" />E-mail</a>
      <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener" className="inline-flex h-9 items-center gap-1 rounded-full border border-line bg-white px-3 text-xs"><Share2 className="h-3.5 w-3.5" />WhatsApp</a>
      <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`} target="_blank" rel="noopener" className="inline-flex h-9 items-center gap-1 rounded-full border border-line bg-white px-3 text-xs">Facebook</a>
    </div>
  );
}
