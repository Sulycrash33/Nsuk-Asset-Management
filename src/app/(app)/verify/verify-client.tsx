"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  AlertCircle,
  Camera,
  CameraOff,
  CheckCircle2,
  ClipboardCheck,
  CloudOff,
  Loader2,
  MapPinOff,
  Play,
  RefreshCw,
  Square,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import {
  cacheExpected,
  forgetExpected,
  forgetScan,
  isOnline,
  pendingScans,
  queueScan,
  readExpected,
} from "@/lib/offline";
import type { flattenTree } from "@/lib/tree";

type Unit = ReturnType<typeof flattenTree>[number];
type Session = { id: string; org_unit_id: string; started_at: string; closed_at?: string | null };

type Outcome = "expected" | "elsewhere" | "unknown" | "repeat" | "queued";
type ScanLine = { outcome: Outcome; barcode: string; name: string | null; at: number };

type Result = {
  expected_total: number;
  seen_total: number;
  present: { id: string; barcode: string; name: string }[];
  missing: { id: string; barcode: string; name: string; location: string | null }[];
  elsewhere: { id: string; barcode: string; name: string; unit: string | null }[];
  unknown: string[];
};

/** How each scan is announced, so the person can keep their eyes on the room. */
const OUTCOME = {
  expected: { label: "Accounted for", tone: "text-nsuk-green", buzz: 40 },
  elsewhere: { label: "Belongs to another unit", tone: "text-nsuk-gold-deep", buzz: 90 },
  unknown: { label: "Not in the register", tone: "text-nsuk-danger", buzz: 200 },
  repeat: { label: "Already scanned", tone: "text-nsuk-muted", buzz: 0 },
  // Judged against the list downloaded when the verification started. It will
  // be confirmed against the register the moment the signal returns.
  queued: { label: "Saved, no signal", tone: "text-nsuk-blue", buzz: 40 },
} as const;

/**
 * Whether the device currently has a signal. Subscribed to rather than read in
 * an effect, so the first paint already reflects reality instead of assuming a
 * connection and correcting itself a moment later.
 */
function useOnlineStatus() {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener("online", onChange);
      window.addEventListener("offline", onChange);
      return () => {
        window.removeEventListener("online", onChange);
        window.removeEventListener("offline", onChange);
      };
    },
    isOnline,
    // The server cannot know, and assuming a signal matches what the page does
    // before any scan is attempted.
    () => true,
  );
}

export default function VerifyClient({
  units,
  openSessions,
  recentSessions,
}: {
  units: Unit[];
  openSessions: Session[];
  recentSessions: Session[];
}) {
  const toast = useToast();
  const confirm = useConfirm();

  const unitName = (id: string) => units.find((u) => u.id === id)?.name ?? "Unknown unit";

  const online = useOnlineStatus();
  const [session, setSession] = useState<Session | null>(openSessions[0] ?? null);
  const [unitId, setUnitId] = useState(units[0]?.id ?? "");
  const [lines, setLines] = useState<ScanLine[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState("");
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [queued, setQueued] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const sessionRef = useRef<Session | null>(session);
  const inFlight = useRef(false);

  // `record` is handed to the camera once and then reads the session through
  // this ref, so it always scans against the current one without the decoder
  // having to be torn down and rebuilt every time the session changes.
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const record = useCallback(
    async (raw: string) => {
      const barcode = raw.trim();
      const current = sessionRef.current;
      if (!barcode || !current || inFlight.current) return;
      inFlight.current = true;

      const show = (outcome: Outcome, name: string | null) => {
        navigator.vibrate?.(OUTCOME[outcome].buzz);
        setLines((prev) => [{ outcome, barcode, name, at: Date.now() }, ...prev]);
      };

      // Nothing is attempted over a dead network: it would stall the scanner
      // for the whole timeout while somebody stands there waiting.
      if (!isOnline()) {
        await queueScan(current.id, barcode);
        const known = (await readExpected(current.id)).find((a) => a.barcode === barcode);
        show("queued", known?.name ?? null);
        setQueued((n) => n + 1);
        setTimeout(() => {
          inFlight.current = false;
        }, 700);
        return;
      }

      const { data, error } = await createClient().rpc("record_verification_scan", {
        p_session_id: current.id,
        p_barcode: barcode,
      });

      if (error) {
        // The signal can drop between the check above and the request itself,
        // so a failure here is queued rather than reported as lost.
        await queueScan(current.id, barcode);
        const known = (await readExpected(current.id)).find((a) => a.barcode === barcode);
        show("queued", known?.name ?? null);
        setQueued((n) => n + 1);
      } else {
        const row = data as { outcome: Outcome; asset_name: string | null };
        show(row.outcome, row.asset_name);
      }
      // Brief pause so the camera does not fire the same code repeatedly.
      setTimeout(() => {
        inFlight.current = false;
      }, 700);
    },
    [],
  );

  const stopCamera = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setCameraOn(false);
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      controlsRef.current = await reader.decodeFromConstraints(
        { video: { facingMode: { ideal: "environment" } } },
        videoRef.current!,
        (r) => {
          if (r) record(r.getText());
        },
      );
      setCameraOn(true);
    } catch (err) {
      setCameraError(
        err instanceof Error && err.name === "NotAllowedError"
          ? "Camera permission was refused. Allow it in your browser settings, or type codes below."
          : "The camera could not be started on this device. Type codes below instead.",
      );
    }
  }, [record]);

  /** Send everything that was scanned while the signal was gone. */
  const flush = useCallback(async () => {
    const current = sessionRef.current;
    if (!current || !isOnline()) return;

    const waiting = await pendingScans(current.id);
    if (waiting.length === 0) {
      setQueued(0);
      return;
    }

    setSyncing(true);
    const supabase = createClient();
    let sent = 0;

    for (const scan of waiting) {
      const { error } = await supabase.rpc("record_verification_scan", {
        p_session_id: scan.sessionId,
        p_barcode: scan.barcode,
      });
      // Only forget a scan once the server has it. A failure leaves it queued
      // for the next attempt rather than losing it quietly.
      if (!error) {
        await forgetScan(scan.key);
        sent += 1;
      }
    }

    setQueued((await pendingScans(current.id)).length);
    setSyncing(false);
    if (sent > 0) {
      toast.success(
        `${sent} scan${sent === 1 ? "" : "s"} sent`,
        "Everything recorded while offline is now on the register.",
      );
    }
  }, [toast]);

  // Send whatever is queued as soon as the signal is back. `flush` returns
  // straight away when there is nothing waiting, so arriving already online
  // costs nothing.
  useEffect(() => {
    if (online) flush();
  }, [online, flush]);

  // Anything left over from a previous visit is picked up on arrival.
  useEffect(() => {
    if (!session) return;
    pendingScans(session.id).then((p) => setQueued(p.length));
    flush();
    // Resuming a verification started on another day, or another device.
    readExpected(session.id).then((cached) => {
      if (cached.length === 0 && isOnline()) {
        createClient()
          .from("assets")
          .select("barcode,name")
          .eq("org_unit_id", session.org_unit_id)
          .then(({ data }) => {
            if (data) cacheExpected(session.id, data as { barcode: string; name: string }[]);
          });
      }
    });
  }, [session, flush]);

  useEffect(() => () => controlsRef.current?.stop(), []);

  async function start() {
    if (!unitId) return;
    setBusy(true);
    const { data, error } = await createClient()
      .from("verification_sessions")
      .insert({ org_unit_id: unitId })
      .select("id,org_unit_id,started_at")
      .single();
    setBusy(false);

    if (error) {
      toast.error("Could not start the verification", error.message);
      return;
    }
    const created = data as Session;
    setSession(created);
    setLines([]);
    setResult(null);
    await downloadExpected(created);
  }

  /**
   * Take a copy of what this unit is supposed to contain, so a scan can still
   * be judged in a store room with no signal.
   */
  async function downloadExpected(s: Session) {
    const { data } = await createClient()
      .from("assets")
      .select("barcode,name")
      .eq("org_unit_id", s.org_unit_id);
    if (data) await cacheExpected(s.id, data as { barcode: string; name: string }[]);
  }

  async function finish() {
    if (!session) return;

    // Finishing with scans still queued would count them as missing and put a
    // false discrepancy in front of the Bursary.
    if (queued > 0) {
      await flush();
      const left = await pendingScans(session.id);
      if (left.length > 0) {
        toast.error(
          `${left.length} scan${left.length === 1 ? "" : "s"} still waiting`,
          "Find a signal before finishing, or those items would be reported missing.",
        );
        return;
      }
    }

    const ok = await confirm({
      title: "Finish this verification?",
      body: "The result is worked out now and the exercise is closed. Anything not scanned counts as missing.",
      confirmLabel: "Finish and show result",
    });
    if (!ok) return;

    setBusy(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("verification_result", {
      p_session_id: session.id,
    });
    if (error) {
      setBusy(false);
      toast.error("Could not work out the result", error.message);
      return;
    }
    await supabase
      .from("verification_sessions")
      .update({ closed_at: new Date().toISOString() })
      .eq("id", session.id);

    stopCamera();
    await forgetExpected(session.id);
    setBusy(false);
    setResult(data as Result);
    setSession(null);
  }

  async function showResult(id: string) {
    setBusy(true);
    const { data, error } = await createClient().rpc("verification_result", { p_session_id: id });
    setBusy(false);
    if (error) {
      toast.error("Could not load that result", error.message);
      return;
    }
    setResult(data as Result);
  }

  // ---- A finished exercise ----------------------------------------------
  if (result) {
    const complete = result.missing.length === 0 && result.elsewhere.length === 0;
    return (
      <div className="space-y-4">
        <div className="card space-y-3">
          <div className="flex items-start gap-3">
            <span
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                complete ? "bg-nsuk-green-50" : "bg-nsuk-gold-50"
              }`}
            >
              {complete ? (
                <CheckCircle2 className="h-5 w-5 text-nsuk-green" />
              ) : (
                <AlertCircle className="h-5 w-5 text-nsuk-gold-deep" />
              )}
            </span>
            <div>
              <h2 className="font-semibold text-nsuk-ink">
                {complete ? "Everything accounted for" : "Discrepancies found"}
              </h2>
              <p className="mt-0.5 text-sm text-nsuk-muted">
                {result.seen_total} of {result.expected_total} recorded items were found.
              </p>
            </div>
          </div>

          <dl className="grid grid-cols-3 gap-2">
            {[
              ["Found", result.seen_total, "text-nsuk-green"],
              ["Missing", result.missing.length, "text-nsuk-danger"],
              ["Wrong place", result.elsewhere.length, "text-nsuk-gold-deep"],
            ].map(([label, value, tone]) => (
              <div key={label as string} className="rounded-xl bg-nsuk-cream px-3 py-2">
                <dt className="text-[11px] font-semibold tracking-wide text-nsuk-faint uppercase">
                  {label}
                </dt>
                <dd className={`tabular text-2xl font-bold ${tone}`}>{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <ResultList
          title="Missing"
          hint="Recorded against this unit but not found during the walk."
          empty="Nothing missing."
          rows={result.missing.map((m) => ({
            key: m.id,
            primary: m.name,
            secondary: `${m.barcode}${m.location ? ` · ${m.location}` : ""}`,
          }))}
        />
        <ResultList
          title="In the wrong place"
          hint="Found here, but the register has them against another unit."
          empty="Nothing out of place."
          rows={result.elsewhere.map((e) => ({
            key: e.id,
            primary: e.name,
            secondary: `${e.barcode} · registered to ${e.unit ?? "another unit"}`,
          }))}
        />
        {result.unknown.length > 0 && (
          <ResultList
            title="Not in the register"
            hint="Codes that were scanned but match no recorded asset."
            empty=""
            rows={result.unknown.map((code) => ({ key: code, primary: code, secondary: "" }))}
          />
        )}

        <button onClick={() => setResult(null)} className="btn-ghost w-full">
          Done
        </button>
      </div>
    );
  }

  // ---- An exercise in progress -------------------------------------------
  if (session) {
    const counts = lines.reduce(
      (acc, l) => ({ ...acc, [l.outcome]: (acc[l.outcome] ?? 0) + 1 }),
      {} as Record<Outcome, number>,
    );

    return (
      <div className="space-y-4">
        <div className="card space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold tracking-wide text-nsuk-faint uppercase">
                Verifying
              </p>
              <p className="font-semibold text-nsuk-blue">{unitName(session.org_unit_id)}</p>
            </div>
            <button onClick={finish} className="btn-primary btn-sm" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
              Finish
            </button>
          </div>

          {(!online || queued > 0) && (
            <div
              className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${
                online
                  ? "border-nsuk-blue/25 bg-nsuk-blue-50 text-nsuk-blue"
                  : "border-nsuk-gold/40 bg-nsuk-gold-50 text-nsuk-gold-deep"
              }`}
            >
              {syncing ? (
                <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
              ) : (
                <CloudOff className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <div className="flex-1">
                <p className="font-semibold">
                  {online ? "Catching up" : "No signal — carry on scanning"}
                </p>
                <p className="mt-0.5 leading-relaxed">
                  {queued > 0
                    ? `${queued} scan${queued === 1 ? "" : "s"} saved on this device${
                        online
                          ? ", being sent now."
                          : ", they will be sent when the signal returns."
                      }`
                    : "Scans are saved on this device and sent when the signal returns."}
                </p>
              </div>
              {online && queued > 0 && !syncing && (
                <button onClick={flush} className="btn-ghost btn-sm shrink-0">
                  Send now
                </button>
              )}
            </div>
          )}

          <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-nsuk-ink">
            <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
            {!cameraOn && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/60">
                <CameraOff className="h-9 w-9" />
                <p className="text-sm">Camera is off</p>
              </div>
            )}
          </div>

          <button
            onClick={cameraOn ? stopCamera : startCamera}
            className={cameraOn ? "btn-ghost w-full" : "btn-gold w-full"}
          >
            <Camera className="h-4 w-4" /> {cameraOn ? "Stop the camera" : "Start the camera"}
          </button>

          {cameraError && (
            <p className="flex items-start gap-2 rounded-xl border border-nsuk-danger/25 bg-nsuk-danger-soft p-3 text-sm text-nsuk-danger">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {cameraError}
            </p>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              record(manual);
              setManual("");
            }}
            className="flex gap-2"
          >
            <input
              className="field font-mono"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="Or type a code"
              aria-label="Asset code"
            />
            <button type="submit" className="btn-ghost shrink-0">
              Add
            </button>
          </form>
        </div>

        <div className="card">
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="text-nsuk-green">{counts.expected ?? 0} accounted for</span>
            <span className="text-nsuk-gold-deep">{counts.elsewhere ?? 0} wrong place</span>
            <span className="text-nsuk-danger">{counts.unknown ?? 0} unrecognised</span>
          </div>

          {lines.length === 0 ? (
            <p className="py-6 text-center text-sm text-nsuk-muted">
              Nothing scanned yet. Every item you scan appears here.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-nsuk-line-soft">
              {lines.map((l) => (
                <li key={`${l.barcode}-${l.at}`} className="flex items-center gap-3 py-2">
                  <MapPinOff
                    className={`h-4 w-4 shrink-0 ${OUTCOME[l.outcome].tone} ${
                      l.outcome === "expected" ? "hidden" : ""
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-nsuk-ink">{l.name ?? l.barcode}</p>
                    <p className="truncate font-mono text-xs text-nsuk-faint">{l.barcode}</p>
                  </div>
                  <span className={`shrink-0 text-xs font-semibold ${OUTCOME[l.outcome].tone}`}>
                    {OUTCOME[l.outcome].label}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  // ---- Nothing in progress -----------------------------------------------
  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-nsuk-blue-50">
            <ClipboardCheck className="h-5 w-5 text-nsuk-blue" />
          </span>
          <div>
            <h2 className="font-semibold text-nsuk-ink">Start a verification</h2>
            <p className="mt-0.5 text-sm text-nsuk-muted">
              Choose the unit you are standing in, then scan everything you can see.
            </p>
          </div>
        </div>

        <div>
          <label className="label" htmlFor="verify-unit">
            Unit
          </label>
          <select
            id="verify-unit"
            className="field"
            value={unitId}
            onChange={(e) => setUnitId(e.target.value)}
          >
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {" ".repeat(u.depth * 2)}
                {u.name}
              </option>
            ))}
          </select>
        </div>

        <button onClick={start} className="btn-green w-full" disabled={busy || !unitId}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Start
        </button>
      </div>

      {recentSessions.length > 0 && (
        <div className="card">
          <h2 className="section-title">Earlier verifications</h2>
          <ul className="mt-2 divide-y divide-nsuk-line-soft">
            {recentSessions.map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-nsuk-ink">{unitName(s.org_unit_id)}</p>
                  <p className="text-xs text-nsuk-faint">
                    {new Date(s.closed_at ?? s.started_at).toLocaleString("en-NG")}
                  </p>
                </div>
                <button onClick={() => showResult(s.id)} className="btn-ghost btn-sm shrink-0">
                  Result
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ResultList({
  title,
  hint,
  empty,
  rows,
}: {
  title: string;
  hint: string;
  empty: string;
  rows: { key: string; primary: string; secondary: string }[];
}) {
  if (rows.length === 0 && !empty) return null;
  return (
    <section className="card">
      <h2 className="section-title">
        {title} {rows.length > 0 && <span className="tabular">({rows.length})</span>}
      </h2>
      <p className="text-xs text-nsuk-muted">{hint}</p>
      {rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-nsuk-green">{empty}</p>
      ) : (
        <ul className="mt-2 divide-y divide-nsuk-line-soft">
          {rows.map((r) => (
            <li key={r.key} className="py-2">
              <p className="truncate text-sm text-nsuk-ink">{r.primary}</p>
              {r.secondary && (
                <p className="truncate font-mono text-xs text-nsuk-faint">{r.secondary}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
