"use client";
import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/cn";

export function Gallery({ images, title }: { images: { url: string; alt: string | null }[]; title: string }) {
  const [i, setI] = useState(0);
  if (!images.length) return <div className="flex aspect-square items-center justify-center rounded-3xl bg-black/5 text-ink-3">Pas de photo</div>;
  return (
    <div>
      <div className="relative aspect-square overflow-hidden rounded-3xl bg-black/5">
        <Image src={images[i].url} alt={images[i].alt ?? title} fill priority sizes="(max-width:1024px) 100vw, 55vw" className="object-cover" />
      </div>
      {images.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {images.map((im, k) => (
            <button key={im.url} onClick={() => setI(k)} aria-label={`Photo ${k + 1}`}
              className={cn("relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border-2", k === i ? "border-ink" : "border-transparent opacity-70")}>
              <Image src={im.url} alt="" fill sizes="80px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
