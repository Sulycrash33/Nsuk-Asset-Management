# NSUK Asset Management System

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
| **Entry** | One-by-one from a phone (with camera photo capture) **or** bulk spreadsheet/CSV import — both always available |
| **Barcodes** | Auto-generated matric-style `NSU/...` codes, rendered as Code 128 + QR, printed as A4 label sheets (12 per page) |
| **Scanning** | Phone camera (ZXing) or any handheld scanner — the latter works as keyboard input with no integration |
| **Scope** | Staff see only their assigned units (and everything nested beneath them); admins see the whole University |
| **Transfers** | Moving an asset between units records from, to, reason, who and when |
| **Exports** | Complete filtered PDF registers, faculty/campus schedules and Excel workbooks |
| **Audit** | Activity log with previous/new field values for new edits, transfers and deletions |

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
npm ci
cp .env.example .env.local   # fill in your Supabase values
npm run dev
```

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Supabase anon / publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | for account management | Required for administrator-created accounts, invitations, password resets and deletion. Missing configuration returns an explicit error. Server-side only — never expose it to the browser. |

Set the same variables in the Vercel project settings; every push to `main` redeploys.

### Database

The schema lives in `supabase/migrations/` and is already applied to the linked project. To set up
a fresh project, run them in filename order (Supabase CLI: `supabase db push`). They create the
tables, the barcode/audit triggers, row-level security, the `asset-photos` storage bucket, and seed
the real NSUK org tree: 4 campuses, 11 faculties with their departments, 16 top-level
administrative units, and 9 asset categories.

### First sign-in

For a fresh project, create the initial Auth user through the Supabase Dashboard's
user-management screen. The database assigns the first profile the administrator role.
On the existing NSUK project, public signup is disabled and administrator accounts already exist;
use **Admin → Staff accounts**, with the server service key configured, to add officers.
Assign at least one unit to each new staff account. A faculty assignment covers its departments.
Do not grant privileges through signup metadata.

See [operations and recovery](docs/OPERATIONS.md) for deployment checks, test boundaries,
backup coverage and the phone pilot checklist.

---

## How the barcodes work

1. An asset record is saved (single entry or CSV import).
2. A Postgres trigger issues a matric-style code such as `NSU/ADM/ACC/CP/T/001` — unique, sequential per unit — and mirrors it
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
It is installable as a PWA, and verification scans can queue on an already-open exercise when connectivity drops.

Only public resources are cached by the service worker. A verification already open in a tab
can queue scans when the connection drops; reopening or reloading a page offline shows a public
connection notice. Saved scans remain on the device and can be sent by reopening the same
verification while signed in once the connection returns. Signed-in pages are never stored in
the service-worker cache, and upgrading the worker removes the previous page cache.

Queued scans and cached asset names are scoped to the signed-in account. Storage errors are
reported instead of being treated as an empty queue. Older unowned scans remain saved until
the officer explicitly uses **Recover older scans** for the matching verification; finishing
is blocked while those scans await recovery. Permission or closed-session refusals are shown
as errors rather than being misreported as a lost connection. Pending work is removed only
after the server confirms it, and concurrent replay attempts share one running task.

Run `npm run test:offline` for the service-worker privacy and offline fallback checks. These
checks are also included in `npm run check`.
Run `npm run test:scan-queue` for transaction-abort, account-isolation, duplicate and legacy-recovery checks.

Brand colours are taken from the University badge: NSUK Blue `#1A3C6E`, Green `#1F7A3D`,
Gold `#F2B705`, on a cream `#FAF7F0` ground. Type is Inter for the interface and JetBrains Mono for
barcodes and serial numbers, where the exact string has to be read or retyped.

The design system lives in one place, `src/app/globals.css`: colour, elevation, radii and motion
tokens, plus the shared `.btn` / `.card` / `.field` component classes. Everything layers and moves
the same way as a result.

Shared interaction primitives are in `src/components/ui/`:

| Primitive | Replaces |
|---|---|
| `toast` | silent successes and inline-only errors |
| `confirm` | `window.confirm` / `window.alert` |
| `modal` | ad-hoc dialogs — bottom sheet on phones, centred from `sm`, with Escape, scroll lock and focus handling |
| `skeleton` | blank waits while a server component streams |
| `empty-state` | bare "no results" text |
| `stat-card` | static dashboard figures (counts animate on mount) |

Every route has a `loading.tsx` skeleton, and there are `error.tsx` and `not-found.tsx` fallbacks.
`Ctrl`/`⌘`+`K` opens a command palette that jumps to any screen or finds an asset by name, barcode
or serial. Motion is disabled wholesale under `prefers-reduced-motion`, focus rings are visible for
keyboard users only, and dialogs carry proper `role`/`aria-modal` semantics.

---

## Not included

Depreciation, maintenance scheduling and disposal/write-off workflows are deliberately out of scope
for this build.


## Validation

Use Node 24 and `npm ci`, then run `npm run check`. It runs typecheck, lint, offline privacy,
scan-queue, import validation, account recovery, register-export tests and a production build.
GitHub Actions repeats this on Linux for pull requests and main with placeholder public settings;
it neither uses the production database nor deploys. Database regression scripts in
`supabase/tests/` use rollback-only fixtures and require a privileged test connection.

The asset register paginates while showing full matching totals. Export applies the same filters
and permission scope across every batch. Retry if the register changes or a batch fails; no partial
file is saved. These multi-request exports are not transactional snapshots during concurrent edits.
