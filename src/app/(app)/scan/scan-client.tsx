"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Camera, CameraOff, Keyboard, Loader2, SwitchCamera } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";

type Status = "idle" | "starting" | "scanning" | "looking-up" | "error";

export default function ScanClient() {
  const router = useRouter();
  const toast = useToast();

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
        .select("id,name")
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
          `No asset found for “${code}”. It may belong to a unit outside your access, or the code may not be registered yet.`,
        );
        // Vibrate on a miss so the failure registers without looking at the screen.
        navigator.vibrate?.(120);
        busyRef.current = false;
        return;
      }

      navigator.vibrate?.(40);
      toast.success("Asset found", data.name as string);
      controlsRef.current?.stop();
      router.push(`/assets/${data.id}`);
    },
    [router, toast],
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
          ? "Camera permission was denied. Allow camera access in your browser settings, or type the code below."
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

          {!scanning && status !== "looking-up" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/60">
              <CameraOff className="h-9 w-9" />
              <p className="text-sm">Camera is off</p>
            </div>
          )}

          {status === "starting" && (
            <div className="absolute inset-0 flex items-center justify-center bg-nsuk-ink/70 text-white">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          )}

          {status === "scanning" && (
            <>
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="relative h-36 w-[82%] rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
                  {/* Corner brackets read as a target without boxing the view in. */}
                  {[
                    "top-0 left-0 border-t-4 border-l-4 rounded-tl-2xl",
                    "top-0 right-0 border-t-4 border-r-4 rounded-tr-2xl",
                    "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-2xl",
                    "bottom-0 right-0 border-b-4 border-r-4 rounded-br-2xl",
                  ].map((cls) => (
                    <span key={cls} className={`absolute h-7 w-7 border-nsuk-gold ${cls}`} />
                  ))}
                </div>
              </div>
              <p className="absolute inset-x-0 bottom-3 text-center text-xs font-medium text-white/85">
                Line the QR code up inside the frame
              </p>
            </>
          )}

          {status === "looking-up" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-nsuk-ink/75 text-white">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p className="text-sm">Looking up…</p>
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
          className="field font-mono text-lg tracking-wider"
          value={manualCode}
          onChange={(e) => setManualCode(e.target.value)}
          placeholder="NSUK-CS-0001"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          // Handheld scanners emulate a keyboard and finish with Enter, which
          // submits this form — no special integration required.
          autoFocus
        />
        <p className="hint">
          A handheld scanner types straight into this box and submits on its own.
        </p>
        <button type="submit" className="btn-primary w-full" disabled={status === "looking-up"}>
          {status === "looking-up" && <Loader2 className="h-4 w-4 animate-spin" />}
          Look up asset
        </button>
      </form>

      {message && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-nsuk-danger/25 bg-nsuk-danger-soft p-3 text-sm text-nsuk-danger"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {message}
        </p>
      )}
    </div>
  );
}
