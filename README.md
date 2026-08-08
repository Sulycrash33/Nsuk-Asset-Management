# NSUK Asset Register

Asset inventory and barcode-tracking system for **Nasarawa State University, Keffi**.

A single digital register for every non-human physical asset the University owns — air
conditioners, vehicles, desks, computers, laboratory equipment, generators — across all campuses,
faculties, departments and administrative units. Assets do not arrive tagged, so the system issues
each one a unique barcode and QR code, prints the label, and turns verification into a scan.

**Stack:** Next.js (App Router) · Supabase (Postgres, Auth, Storage) · Tailwind CSS v4 · Vercel

---

## What it does

| Area | Detail |
|---|---|
| **Entry** | One-by-one from a phone (with camera photo capture) **or** bulk CSV import — both always available |
| **Barcodes** | Auto-generated `NSUK-{unit}-{seq}` codes, rendered as Code 128 + QR, printed as A4 label sheets (12 per page) |
| **Scanning** | Phone camera (ZXing) or any handheld scanner — the latter works as keyboard input with no integration |
| **Scope** | Staff see only their assigned units (and everything nested beneath them); admins see the whole University |
| **Transfers** | Moving an asset between units records from, to, reason, who and when |
| **Exports** | Printable per-unit asset register PDF for audits and Bursary |
| **Audit** | University-wide activity log of every create, edit, transfer and delete |

### Roles

**Administrator** — full CRUD on the org tree, campuses and categories; staff account management;
university-wide dashboard, global search and activity log; assets in any unit.

**Staff** — scoped strictly to assigned unit(s): add, edit, transfer, scan, print labels and export
their unit's register. Cannot create accounts, edit the org tree, or see other units.

---

## Getting started

```bash
git clone https://github.com/Sulycrash33/Nsuk-Asset-Management.git
cd Nsuk-Asset-Management
npm install
cp .env.example .env.local   # fill in your Supabase values
npm run dev
```

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Supabase anon / publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | no | Lets **Admin → Staff accounts** create pre-confirmed accounts and delete accounts. Without it, new staff must confirm their email before signing in, and account deletion is unavailable. Server-side only — never expose it to the browser. |

Set the same variables in the Vercel project settings; every push to `main` redeploys.

### Database

The schema lives in `supabase/migrations/` and is already applied to the linked project. To set up
a fresh project, run them in filename order (Supabase CLI: `supabase db push`). They create the
tables, the barcode/audit triggers, row-level security, the `asset-photos` storage bucket, and seed
the real NSUK org tree: 4 campuses, 11 faculties with their departments, 16 top-level
administrative units, and 9 asset categories.

### First sign-in

The login screen offers a one-time **"Create the first administrator"** form while no account
exists — the database makes the first account an administrator regardless of what the client asks
for. Once that account exists the form disappears permanently, and all further accounts are created
from **Admin → Staff accounts**.

---

## How the barcodes work

1. An asset record is saved (single entry or CSV import).
2. A Postgres trigger issues `NSUK-{unit_code}-{seq}` — unique, sequential per unit — and mirrors it
   into the QR payload.
3. The label sheet is generated client-side as a PDF: Code 128 bars drawn as **vector** rects (not a
   bitmap, so they stay scannable at any size), the QR code, and the human-readable code.
4. Staff print and stick the label on the physical item.
5. Scanning the barcode or QR — by camera or handheld scanner — opens the full record.

The Code 128 encoder in `src/lib/code128.ts` is dependency-free and verified against ZXing's
decoder:

```bash
node --experimental-strip-types scripts/verify-barcode.mjs
```

---

## Project layout

```
src/
  app/
    page.tsx                  public landing page
    login/                    sign-in + first-administrator bootstrap
    (app)/                    everything behind auth
      dashboard/              role-scoped totals, value, condition breakdown
      assets/                 list, detail, add, edit, CSV import
      scan/                   camera + manual code lookup
      labels/                 batch label sheet generation
      units/                  org tree, campuses, categories   (admin)
      users/                  staff accounts and unit assignment (admin)
      activity/               university-wide audit trail        (admin)
      search/                 global asset search                (admin)
    api/admin/users/          account creation and deletion      (admin)
  components/                 shared UI (app shell, forms, unit picker, barcodes)
  lib/                        Supabase clients, session scope, org tree, Code 128, PDF
  proxy.ts                    session refresh + route protection
supabase/migrations/          schema, RLS, seed data
scripts/verify-barcode.mjs    Code 128 round-trip check
```

---

## Design

Mobile-first throughout — most real use is on a phone, standing in front of the item — with a
thumb-reachable bottom tab bar, a raised Scan key, large tap targets and camera-first photo capture.
It is installable as a PWA, and the data layer is structured so offline sync can be added later
without restructuring.

Brand colours are taken from the University badge: NSUK Blue `#1A3C6E`, Green `#1F7A3D`,
Gold `#F2B705`, on a cream `#FAF7F0` ground.

---

## Not included

Depreciation, maintenance scheduling and disposal/write-off workflows are deliberately out of scope
for this build.
