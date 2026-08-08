"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Camera, CameraOff, Keyboard, Loader2, SwitchCamera } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Status = "idle" | "starting" | "scanning" | "looking-up" | "error";

export default function ScanClient() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const busyRef = useRef(false);

  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");

  /** Resolve a scanned or typed code to an asset record. */
  const lookup = useCallback(
    async (rawCode: string) => {
      const code = rawCode.trim();
      if (!code || busyRef.current) return;
      busyRef.current = true;
      setStatus("looking-up");
      setMessage(null);

      const { data, error } = await createClient()
        .from("assets")
        .select("id")
        .or(`barcode.eq.${code},qr_payload.eq.${code}`)
        .limit(1)
        .maybeSingle();

      if (error) {
        setStatus("error");
        setMessage(error.message);
        busyRef.current = false;
        return;
      }
      if (!data) {
        setStatus("error");
        setMessage(
          `No asset found for “${code}”. It may belong to a unit outside your access, or the code may not be registered.`,
        );
        busyRef.current = false;
        return;
      }

      controlsRef.current?.stop();
      router.push(`/assets/${data.id}`);
    },
    [router],
  );

  const stopCamera = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setStatus("idle");
  }, []);

  const startCamera = useCallback(async () => {
    setStatus("starting");
    setMessage(null);
    busyRef.current = false;

    try {
      // Loaded lazily so the scanner bundle never blocks first paint.
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();

      const controls = await reader.decodeFromConstraints(
        { video: { facingMode: { ideal: facingMode } } },
        videoRef.current!,
        (result) => {
          if (result) lookup(result.getText());
        },
      );
      controlsRef.current = controls;
      setStatus("scanning");
    } catch (err) {
      setStatus("error");
      setMessage(
        err instanceof Error && err.name === "NotAllowedError"
          ? "Camera permission was denied. Allow camera access, or type the code below."
          : "Could not start the camera on this device. Type the code below instead.",
      );
    }
  }, [facingMode, lookup]);

  useEffect(() => () => controlsRef.current?.stop(), []);

  const scanning = status === "scanning" || status === "starting";

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-nsuk-ink">
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            playsInline
            muted
            aria-label="Camera preview"
          />
          {!scanning && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/70">
              <CameraOff className="h-8 w-8" />
              <p className="text-sm">Camera is off</p>
            </div>
          )}
          {status === "scanning" && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-32 w-4/5 rounded-xl border-2 border-nsuk-gold shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
            </div>
          )}
          {status === "looking-up" && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          {scanning ? (
            <button onClick={stopCamera} className="btn-ghost">
              <CameraOff className="h-4 w-4" /> Stop camera
            </button>
          ) : (
            <button onClick={startCamera} className="btn-gold">
              <Camera className="h-4 w-4" /> Start camera
            </button>
          )}
          <button
            onClick={() => {
              setFacingMode((m) => (m === "environment" ? "user" : "environment"));
              if (scanning) {
                stopCamera();
                setTimeout(startCamera, 150);
              }
            }}
            className="btn-ghost"
          >
            <SwitchCamera className="h-4 w-4" /> Flip camera
          </button>
        </div>
      </div>

      <form
        className="card space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          busyRef.current = false;
          lookup(manualCode);
        }}
      >
        <label className="label flex items-center gap-2" htmlFor="manual-code">
          <Keyboard className="h-4 w-4" /> Enter or scan a code
        </label>
        <input
          id="manual-code"
          className="field font-mono"
          value={manualCode}
          onChange={(e) => setManualCode(e.target.value)}
          placeholder="NSUK-CS-0001"
          autoComplete="off"
          autoCapitalize="characters"
          // Handheld scanners emulate a keyboard and finish with Enter, which
          // submits this form — no special integration required.
          autoFocus
        />
        <button type="submit" className="btn-primary w-full" disabled={status === "looking-up"}>
          {status === "looking-up" && <Loader2 className="h-4 w-4 animate-spin" />}
          Look up asset
        </button>
      </form>

      {message && (
        <p className="flex items-start gap-2 rounded-xl border border-[#B91C1C]/30 bg-[#B91C1C]/8 p-3 text-sm text-[#B91C1C]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {message}
        </p>
      )}
    </div>
  );
}
