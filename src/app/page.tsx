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
    body: "Departmental staff manage their own assets. Administrators see the whole university, plus an audit trail of who changed what.",
  },
  {
    icon: FileSpreadsheet,
    title: "Audit-ready registers",
    body: "Export a printable asset register for any unit — ready for Bursary, internal audit or verification exercises.",
  },
];

export default function LandingPage() {
  return (
    <main className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-nsuk-line/70 bg-nsuk-cream/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/nsuk-logo.svg" alt="" className="h-9 w-9" />
            <div className="leading-tight">
              <p className="text-sm font-bold text-nsuk-blue">NSUK Asset Register</p>
              <p className="text-[11px] text-neutral-500">Nasarawa State University, Keffi</p>
            </div>
          </div>
          <Link href="/login" className="btn-primary btn-sm">
            Login
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-4 pt-10 pb-8 sm:pt-16">
        <p className="chip border-nsuk-gold/50 bg-nsuk-gold/20 text-[#8A6A00]">
          Official asset inventory system
        </p>
        <h1 className="mt-4 text-3xl leading-tight font-bold text-nsuk-blue sm:text-5xl">
          Every asset the University owns,
          <span className="text-nsuk-green"> tagged, tracked and accounted for.</span>
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-neutral-700 sm:text-lg">
          A single register for all non-human physical property across NSUK — air conditioners,
          vehicles, desks, computers, laboratory equipment, generators — from the Keffi main campus
          to Lafia, Gudi and Pyanku. Each item gets a printed barcode, so verification takes a scan
          instead of a search.
        </p>

        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <Link href="/login" className="btn-primary w-full sm:w-auto">
            Login to the register
            <ArrowRight className="h-4 w-4" />
          </Link>
          <a href="#how-it-works" className="btn-ghost w-full sm:w-auto">
            How it works
          </a>
        </div>

        <dl className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["4", "Campuses"],
            ["11", "Faculties"],
            ["60+", "Departments"],
            ["16+", "Administrative units"],
          ].map(([value, label]) => (
            <div key={label} className="card">
              <dt className="text-2xl font-bold text-nsuk-blue">{value}</dt>
              <dd className="text-xs text-neutral-600">{label}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section id="how-it-works" className="border-y border-nsuk-line bg-white">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:py-14">
          <h2 className="text-2xl font-bold text-nsuk-blue">How it works</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Four steps, done from a phone while standing in front of the item.
          </p>
          <ol className="mt-6 grid gap-4 sm:grid-cols-2">
            {STEPS.map((step, i) => (
              <li key={step.title} className="card flex gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-nsuk-blue text-white">
                  <step.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-bold tracking-wide text-nsuk-gold-dark">
                    STEP {i + 1}
                  </p>
                  <h3 className="font-semibold text-nsuk-ink">{step.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-neutral-600">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-10 sm:py-14">
        <h2 className="text-2xl font-bold text-nsuk-blue">Built for the whole University</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="card">
              <f.icon className="h-6 w-6 text-nsuk-green" />
              <h3 className="mt-3 font-semibold text-nsuk-ink">{f.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-neutral-600">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-16">
        <div className="rounded-2xl bg-nsuk-blue p-6 text-white sm:p-10">
          <h2 className="text-xl font-bold sm:text-2xl">Ready to start tagging?</h2>
          <p className="mt-2 max-w-xl text-sm text-white/80">
            Administrators manage the University-wide register and staff accounts. Unit staff sign
            in to record and verify the assets in their own faculty, department or office.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link href="/login" className="btn-gold w-full sm:w-auto">
              Administrator login
            </Link>
            <Link
              href="/login"
              className="btn w-full border border-white/30 text-white hover:bg-white/10 sm:w-auto"
            >
              Staff login
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-nsuk-line bg-white">
        <div className="mx-auto max-w-5xl px-4 py-6 text-center text-xs text-neutral-500">
          <p className="font-semibold text-nsuk-blue">Nasarawa State University, Keffi</p>
          <p className="mt-1">Knowledge for Development — Asset Management System</p>
        </div>
      </footer>
    </main>
  );
}
