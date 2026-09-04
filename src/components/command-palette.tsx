"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Boxes,
  Building2,
  CornerDownLeft,
  LayoutDashboard,
  Loader2,
  Package,
  Plus,
  Printer,
  ScanLine,
  Search,
  Upload,
  Users,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ASSET_WITH_REFS, CONDITION_STYLES, formatNaira, type AssetWithRefs } from "@/lib/types";

/** Stable empty list, so a term with no rows yet does not remount the results. */
const EMPTY_ROWS: AssetWithRefs[] = [];

type Command = { label: string; href: string; icon: typeof Boxes; adminOnly?: boolean };

const COMMANDS: Command[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "All assets", href: "/assets", icon: Boxes },
  { label: "Scan an asset", href: "/scan", icon: ScanLine },
  { label: "Add an asset", href: "/assets/new", icon: Plus },
  { label: "Bulk CSV import", href: "/assets/import", icon: Upload },
  { label: "Print labels", href: "/labels", icon: Printer },
  { label: "Organisational units", href: "/units", icon: Building2, adminOnly: true },
  { label: "Staff accounts", href: "/users", icon: Users, adminOnly: true },
  { label: "Activity log", href: "/activity", icon: Activity, adminOnly: true },
];

/**
 * Ctrl/Cmd-K palette: jump to any screen, or find an asset by name, asset code or
 * serial without leaving the current page. Results respect the caller's scope,
 * because the query runs through the same RLS-protected client as everything else.
 */
export default function CommandPalette({ isAdmin }: { isAdmin: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [fetched, setFetched] = useState<{ term: string; rows: AssetWithRefs[] }>({
    term: "",
    rows: EMPTY_ROWS,
  });
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useMemo(
    () => COMMANDS.filter((c) => isAdmin || !c.adminOnly),
    [isAdmin],
  );

  const matchedCommands = useMemo(() => {
    const needle = term.trim().toLowerCase();
    if (!needle) return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(needle));
  }, [commands, term]);

  const close = useCallback(() => {
    setOpen(false);
    setTerm("");
    setFetched({ term: "", rows: EMPTY_ROWS });
    setCursor(0);
  }, []);

  // Global shortcut.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [close]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const needle = term.trim();
  const longEnough = needle.length >= 2;

  // Rows are only shown while they still answer what is in the box, so a
  // changed term empties the list by itself and there is nothing to reset.
  const results = fetched.term === needle ? fetched.rows : EMPTY_ROWS;
  const searching = longEnough && fetched.term !== needle;

  // Debounced asset lookup.
  useEffect(() => {
    if (!longEnough) return;

    const timer = window.setTimeout(async () => {
      const safe = needle.replace(/[%,()]/g, " ").trim();
      const { data } = await createClient()
        .from("assets")
        .select(ASSET_WITH_REFS)
        .or(`name.ilike.%${safe}%,barcode.ilike.%${safe}%,serial_number.ilike.%${safe}%`)
        .limit(6);
      setFetched({ term: needle, rows: (data ?? []) as AssetWithRefs[] });
    }, 220);

    return () => window.clearTimeout(timer);
  }, [needle, longEnough]);

  const items = useMemo(
    () => [
      ...matchedCommands.map((c) => ({ kind: "command" as const, href: c.href, data: c })),
      ...results.map((a) => ({ kind: "asset" as const, href: `/assets/${a.id}`, data: a })),
    ],
    [matchedCommands, results],
  );

  // A new term means a new first result to highlight.
  const [cursorTerm, setCursorTerm] = useState(term);
  if (term !== cursorTerm) {
    setCursorTerm(term);
    setCursor(0);
  }

  function onListKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter" && items[cursor]) {
      e.preventDefault();
      router.push(items[cursor].href);
      close();
    }
  }

  return (
    <>
      {/* Desktop affordance — phones use the bottom tab bar instead. */}
      <button
        onClick={() => setOpen(true)}
        className="hidden items-center gap-2 rounded-xl border border-nsuk-line bg-white px-3 py-2 text-sm text-nsuk-faint shadow-[var(--shadow-e1)] transition hover:border-nsuk-blue/30 hover:text-nsuk-blue lg:flex"
      >
        <Search className="h-4 w-4" />
        <span>Search or jump to…</span>
        <kbd className="ml-2 rounded border border-nsuk-line bg-nsuk-cream px-1.5 py-0.5 font-mono text-[10px] text-nsuk-muted">
          ⌘K
        </kbd>
      </button>

      {open && (
        <div className="no-print fixed inset-0 z-[70] flex items-start justify-center p-4 pt-[8vh]">
          <button
            aria-label="Close search"
            onClick={close}
            className="animate-fade-in absolute inset-0 cursor-default bg-nsuk-ink/45 backdrop-blur-[2px]"
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-label="Search and navigate"
            className="animate-pop-in relative flex max-h-[70dvh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-[var(--shadow-e3)]"
          >
            <div className="flex items-center gap-3 border-b border-nsuk-line px-4">
              <Search className="h-4.5 w-4.5 shrink-0 text-nsuk-faint" />
              <input
                ref={inputRef}
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                onKeyDown={onListKeyDown}
                placeholder="Search assets, or jump to a screen…"
                className="w-full bg-transparent py-4 text-base outline-none placeholder:text-nsuk-faint"
                aria-label="Search assets or screens"
              />
              {searching && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-nsuk-faint" />}
            </div>

            <div className="scroll-slim flex-1 overflow-y-auto p-2">
              {matchedCommands.length > 0 && (
                <>
                  <p className="px-3 py-1.5 text-[11px] font-bold tracking-wide text-nsuk-faint uppercase">
                    Go to
                  </p>
                  {matchedCommands.map((command, i) => (
                    <button
                      key={command.href}
                      onMouseEnter={() => setCursor(i)}
                      onClick={() => {
                        router.push(command.href);
                        close();
                      }}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm ${
                        cursor === i ? "bg-nsuk-blue text-white" : "text-nsuk-ink hover:bg-nsuk-cream"
                      }`}
                    >
                      <command.icon className="h-4 w-4 shrink-0" />
                      <span className="flex-1">{command.label}</span>
                      {cursor === i && <CornerDownLeft className="h-3.5 w-3.5 opacity-70" />}
                    </button>
                  ))}
                </>
              )}

              {results.length > 0 && (
                <>
                  <p className="px-3 pt-3 pb-1.5 text-[11px] font-bold tracking-wide text-nsuk-faint uppercase">
                    Assets
                  </p>
                  {results.map((asset, i) => {
                    const index = matchedCommands.length + i;
                    return (
                      <button
                        key={asset.id}
                        onMouseEnter={() => setCursor(index)}
                        onClick={() => {
                          router.push(`/assets/${asset.id}`);
                          close();
                        }}
                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${
                          cursor === index
                            ? "bg-nsuk-blue text-white"
                            : "text-nsuk-ink hover:bg-nsuk-cream"
                        }`}
                      >
                        <Package className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{asset.name}</span>
                          <span
                            className={`block truncate font-mono text-xs ${
                              cursor === index ? "text-white/70" : "text-nsuk-faint"
                            }`}
                          >
                            {asset.barcode} · {asset.org_units?.name ?? "—"}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          {cursor !== index && (
                            <span className={`chip ${CONDITION_STYLES[asset.condition]}`}>
                              {asset.condition}
                            </span>
                          )}
                          <span
                            className={`tabular mt-0.5 block text-xs ${
                              cursor === index ? "text-white/70" : "text-nsuk-faint"
                            }`}
                          >
                            {formatNaira(asset.value)}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </>
              )}

              {!searching && term.trim().length >= 2 && items.length === 0 && (
                <p className="px-3 py-8 text-center text-sm text-nsuk-muted">
                  Nothing matched “{term.trim()}”.
                </p>
              )}
            </div>

            <div className="flex items-center gap-4 border-t border-nsuk-line bg-nsuk-cream/60 px-4 py-2 text-[11px] text-nsuk-faint">
              <span>
                <kbd className="font-mono">↑↓</kbd> navigate
              </span>
              <span>
                <kbd className="font-mono">↵</kbd> open
              </span>
              <span>
                <kbd className="font-mono">esc</kbd> close
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
