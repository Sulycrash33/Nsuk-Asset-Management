"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { code128Svg } from "@/lib/code128";

/** On-screen Code 128 rendering — SVG so it stays sharp on any display. */
export default function BarcodeImage({
  value,
  width = 260,
  height = 60,
}: {
  value: string;
  width?: number;
  height?: number;
}) {
  const svg = useMemo(() => {
    try {
      return code128Svg(value, width, height);
    } catch {
      return null;
    }
  }, [value, width, height]);

  if (!svg) return <p className="text-xs text-neutral-500">Cannot render barcode for “{value}”.</p>;

  return (
    <div
      className="mx-auto w-full max-w-xs"
      aria-label={`Barcode ${value}`}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/** On-screen QR rendering for the same payload as the barcode. */
export function QrImage({ value, size = 160 }: { value: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(value, {
      margin: 0,
      width: size * 2,
      color: { dark: "#111111", light: "#FFFFFF" },
    })
      .then((url) => {
        if (active) setSrc(url);
      })
      .catch(() => {
        if (active) setSrc(null);
      });
    return () => {
      active = false;
    };
  }, [value, size]);

  if (!src) return <div className="rounded-lg bg-nsuk-cream" style={{ width: size, height: size }} />;

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={`QR code ${value}`} width={size} height={size} className="rounded" />;
}
