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
  title: { absolute: "NSUK Asset Register | Nasarawa State University, Keffi" },
  description:
    "The official inventory of physical assets owned by Nasarawa State University, Keffi. Every item is registered, barcoded and traceable to the unit responsible for it.",
};

const STEPS = [
  {
    icon: ClipboardList,
    title: "Record the asset",
    body: "Assets are entered individually from a phone, tablet or computer, or imported in bulk from a spreadsheet. Faculties, departments and categories are pre-loaded, so most fields are selected rather than typed.",
  },
  {
    icon: QrCode,
    title: "Issue the asset code",
    body: "A unique University asset code is generated the moment the record is saved, together with a matching barcode and QR code. No item needs to arrive pre-tagged.",
  },
  {
    icon: Printer,
    title: "Print and affix the label",
    body: "Labels are printed singly or as a full sheet, then affixed to the item itself.",
  },
  {
    icon: ScanLine,
    title: "Scan to retrieve the record",
    body: "Scanning the label with a device camera or a handheld scanner opens the full record, showing the unit, location, condition, value and history of the item.",
  },
];

const FEATURES = [
  {
    icon: Building2,
    title: "One structure for every unit",
    body: "Faculties, departments, directorates and offices are recorded under a single structure, nested to whatever depth the University requires.",
  },
  {
    icon: ShieldCheck,
    title: "Access limited to assigned units",
    body: "Departmental staff manage only the assets of the units assigned to them. Administrators hold University-wide access, together with a complete audit trail of every change.",
  },
  {
    icon: FileSpreadsheet,
    title: "Registers prepared for audit",
    body: "A printable asset register can be produced for any unit, suitable for submission to the Bursary, internal audit and verification exercises.",
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
            <img src="/nsuk-crest.png" alt="" className="h-9 w-9" />
            <div className="leading-tight">
              <p className="text-sm font-bold text-nsuk-blue">NSUK Asset Register</p>
              <p className="text-[11px] text-nsuk-faint">Nasarawa State University, Keffi</p>
            </div>
          </div>
          <Link href="/login" className="btn-primary btn-sm">
            Sign in
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
            A complete and verifiable record
            <span className="block text-nsuk-green">of University property.</span>
          </h1>

          <p className="mt-5 max-w-2xl text-base leading-relaxed text-nsuk-muted sm:text-lg">
            The NSUK Asset Register maintains a central inventory of the physical assets owned by
            Nasarawa State University, Keffi, across every campus, faculty and administrative unit.
            Each recorded item carries a printed barcode, so verification is carried out by scanning
            rather than by manual search.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/login" className="btn-primary btn-lg w-full sm:w-auto">
              Sign in
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a href="#how-it-works" className="btn-ghost btn-lg w-full sm:w-auto">
              How it works
            </a>
          </div>
        </div>
      </section>

      {/* ---- How it works, immediately after the introduction ---- */}
      <section id="how-it-works" className="scroll-mt-16 border-y border-nsuk-line bg-white">
        <div className="mx-auto max-w-5xl px-4 py-12 sm:py-16">
          <h2 className="text-2xl font-bold text-nsuk-blue sm:text-3xl">How it works</h2>
          <p className="mt-1.5 text-sm text-nsuk-muted">
            Four steps, from first entry to verification.
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

      {/* ---- Coverage ---- */}
      <section className="mx-auto max-w-5xl px-4 py-12 sm:py-16">
        <h2 className="text-2xl font-bold text-nsuk-blue sm:text-3xl">
          Built for the whole University
        </h2>
        <p className="mt-1.5 max-w-2xl text-sm text-nsuk-muted">
          Academic and administrative units are treated alike, from the largest faculty to a single
          office.
        </p>

        <dl className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {STATS.map(([value, label]) => (
            <div key={label} className="card">
              <dt className="tabular text-3xl leading-none font-bold text-nsuk-blue">{value}</dt>
              <dd className="mt-1.5 text-xs text-nsuk-muted">{label}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
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

      <footer className="border-t border-nsuk-line bg-white">
        <div className="mx-auto max-w-5xl px-4 py-7 text-center text-xs text-nsuk-faint">
          <p className="font-semibold text-nsuk-blue">Nasarawa State University, Keffi</p>
          <p className="mt-1">Knowledge for Development</p>
          <p className="mt-2">Asset Management System</p>
        </div>
      </footer>
    </main>
  );
}
