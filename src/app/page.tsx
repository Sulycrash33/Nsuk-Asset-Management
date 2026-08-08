import Link from "next/link";
import {
  ArrowRight,
  Building2,
  ClipboardList,
  FileSpreadsheet,
  Printer,
  QrCode,
  ScanLine,
  ShieldCheck,
} from "lucide-react";

export const metadata = {
  title: { absolute: "NSUK Asset Register — Nasarawa State University, Keffi" },
  description:
    "Digital inventory and barcode tracking for every physical asset across Nasarawa State University, Keffi.",
};

const STEPS = [
  {
    icon: ClipboardList,
    title: "Record the asset",
    body: "Log it one-by-one from your phone, or upload a whole store room as a CSV. Faculty, department and category are pre-loaded, so it is mostly tapping, not typing.",
  },
  {
    icon: QrCode,
    title: "Get a barcode",
    body: "Every asset is issued a unique NSUK code with a matching barcode and QR the moment it is saved — nothing needs to arrive pre-tagged.",
  },
  {
    icon: Printer,
    title: "Print and stick",
    body: "Print a single label or a whole sheet, then stick it on the AC unit, the vehicle, the desk, the generator.",
  },
  {
    icon: ScanLine,
    title: "Scan to look it up",
    body: "Point a phone camera or a handheld scanner at the label and the full record opens — location, condition, value, history.",
  },
];

const FEATURES = [
  {
    icon: Building2,
    title: "Every unit, one structure",
    body: "Faculties, departments, Registry, Bursary, DICT, Works, Transport, the Clinic — all recorded the same way, nested as deeply as you need.",
  },
  {
    icon: ShieldCheck,
    title: "Staff see only their unit",
    body: "Departmental staff manage their own assets. Administrators see the whole University, plus an audit trail of who changed what.",
  },
  {
    icon: FileSpreadsheet,
    title: "Audit-ready registers",
    body: "Export a printable asset register for any unit — ready for Bursary, internal audit or verification exercises.",
  },
];

const STATS = [
  ["4", "Campuses"],
  ["11", "Faculties"],
  ["60+", "Departments"],
  ["16+", "Administrative units"],
];

export default function LandingPage() {
  return (
    <main className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-nsuk-line/70 bg-nsuk-cream/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/nsuk-logo.svg" alt="" className="h-9 w-9" />
            <div className="leading-tight">
              <p className="text-sm font-bold text-nsuk-blue">NSUK Asset Register</p>
              <p className="text-[11px] text-nsuk-faint">Nasarawa State University, Keffi</p>
            </div>
          </div>
          <Link href="/login" className="btn-primary btn-sm">
            Login
          </Link>
        </div>
      </header>

      {/* ---- Hero ---- */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 -right-24 h-96 w-96 rounded-full bg-nsuk-blue/8 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute top-40 -left-32 h-80 w-80 rounded-full bg-nsuk-green/8 blur-3xl"
        />

        <div className="animate-fade-up relative mx-auto max-w-5xl px-4 pt-12 pb-10 sm:pt-20">
          <p className="chip border-nsuk-gold/40 bg-nsuk-gold-50 text-nsuk-gold-deep">
            <span className="h-1.5 w-1.5 rounded-full bg-nsuk-gold" />
            Official asset inventory system
          </p>

          <h1 className="mt-5 text-4xl leading-[1.08] font-bold tracking-tight text-nsuk-blue sm:text-6xl">
            Every asset the University owns,
            <span className="block text-nsuk-green">tagged, tracked and accounted for.</span>
          </h1>

          <p className="mt-5 max-w-2xl text-base leading-relaxed text-nsuk-muted sm:text-lg">
            A single register for all non-human physical property across NSUK — air conditioners,
            vehicles, desks, computers, laboratory equipment, generators — from the Keffi main
            campus to Lafia, Gudi and Pyanku. Each item gets a printed barcode, so verification
            takes a scan instead of a search.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/login" className="btn-primary btn-lg w-full sm:w-auto">
              Login to the register
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a href="#how-it-works" className="btn-ghost btn-lg w-full sm:w-auto">
              How it works
            </a>
          </div>

          <dl className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {STATS.map(([value, label]) => (
              <div key={label} className="card">
                <dt className="tabular text-3xl leading-none font-bold text-nsuk-blue">{value}</dt>
                <dd className="mt-1.5 text-xs text-nsuk-muted">{label}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ---- How it works ---- */}
      <section id="how-it-works" className="scroll-mt-16 border-y border-nsuk-line bg-white">
        <div className="mx-auto max-w-5xl px-4 py-12 sm:py-16">
          <h2 className="text-2xl font-bold text-nsuk-blue sm:text-3xl">How it works</h2>
          <p className="mt-1.5 text-sm text-nsuk-muted">
            Four steps, done from a phone while standing in front of the item.
          </p>

          <ol className="mt-8 grid gap-4 sm:grid-cols-2">
            {STEPS.map((step, i) => (
              <li key={step.title} className="card card-interactive flex gap-4">
                <div className="relative shrink-0">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-nsuk-blue text-white">
                    <step.icon className="h-5 w-5" />
                  </div>
                  <span className="tabular absolute -top-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-nsuk-gold text-xs font-bold text-nsuk-ink">
                    {i + 1}
                  </span>
                </div>
                <div>
                  <h3 className="font-semibold text-nsuk-ink">{step.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-nsuk-muted">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---- Features ---- */}
      <section className="mx-auto max-w-5xl px-4 py-12 sm:py-16">
        <h2 className="text-2xl font-bold text-nsuk-blue sm:text-3xl">
          Built for the whole University
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="card card-interactive">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-nsuk-green-50">
                <f.icon className="h-5 w-5 text-nsuk-green" />
              </span>
              <h3 className="mt-4 font-semibold text-nsuk-ink">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-nsuk-muted">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---- CTA ---- */}
      <section className="mx-auto max-w-5xl px-4 pb-16">
        <div className="relative overflow-hidden rounded-2xl bg-nsuk-blue p-6 text-white shadow-[var(--shadow-e3)] sm:p-10">
          <div
            aria-hidden
            className="absolute -top-20 -right-16 h-64 w-64 rounded-full bg-nsuk-blue-light/40 blur-3xl"
          />
          <div aria-hidden className="absolute inset-x-0 bottom-0 h-1 bg-nsuk-gold" />
          <div className="relative">
            <h2 className="text-xl font-bold sm:text-2xl">Ready to start tagging?</h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/75">
              Administrators manage the University-wide register and staff accounts. Unit staff sign
              in to record and verify the assets in their own faculty, department or office.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link href="/login" className="btn-gold w-full sm:w-auto">
                Administrator login
              </Link>
              <Link
                href="/login"
                className="btn w-full border border-white/25 text-white hover:bg-white/10 sm:w-auto"
              >
                Staff login
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-nsuk-line bg-white">
        <div className="mx-auto max-w-5xl px-4 py-7 text-center text-xs text-nsuk-faint">
          <p className="font-semibold text-nsuk-blue">Nasarawa State University, Keffi</p>
          <p className="mt-1">Knowledge for Development — Asset Management System</p>
        </div>
      </footer>
    </main>
  );
}
