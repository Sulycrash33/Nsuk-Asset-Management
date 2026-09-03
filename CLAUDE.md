# NSUK Asset Management System

A digital register and barcode tracking system for the physical assets of
Nasarawa State University, Keffi. Every non-human asset is recorded once, given
a printed label, and thereafter tracked by scanning it with an ordinary phone.

Not yet in production use. The register is deliberately empty: the pilot has not
loaded real data. **That makes now the cheap moment for anything that would
later require relabelling physical items.**

## Stack

Next.js 16.3 (App Router, Turbopack) · React 19.2 · TypeScript strict ·
Tailwind v4 · Supabase (Postgres, Auth, RLS) · Vercel.

- Routing middleware lives in `proxy.ts` (Next 16 renamed it from
  `middleware.ts`). Public paths are listed in `src/lib/supabase/middleware.ts`.
- `npm run check` runs the lot: `typecheck`, `lint`, then `build`. Run it before
  pushing. The build alone does **not** lint — Next 16 dropped that step, so a
  green build says nothing about the hook rules below.
- Linting is flat-config ESLint (`eslint.config.mjs`) on `eslint-config-next`.
  Next 16 removed `next lint`, and the config it used to generate, so the config
  is checked in and `npm run lint` calls `eslint` directly.
- `next/core-web-vitals` brings the React Compiler's hook rules, which are
  stricter than the old ones: no `setState` in an effect body, no writing a ref
  or reassigning a variable during render. Where state has to follow a prop or
  the URL, adjust it during render behind an `if (next !== last)` guard rather
  than in an effect, and read outside state — the reduced-motion setting, the
  network signal — through `useSyncExternalStore`.

## The things that are easy to get wrong

**Security is enforced in the database, never only on screen.** Row level
policies decide what each person may read. A `SECURITY DEFINER` function
bypasses them, so every one of those carries its own explicit check. If you add
one, revoke `execute` from `public` and `anon` and grant only what is needed —
the Supabase advisor will otherwise flag it, and it has caught real holes here
before.

**Never trust client-supplied role metadata.** An early version let anyone sign
up as an administrator by putting `role: admin` in signup metadata. Fixed in
migration 12: `handle_new_user()` always assigns `staff` unless no administrator
exists at all. Do not reintroduce a path that reads a role from the client.

**A serial number belongs to one asset, and the database is what says so.**
Migration 20 puts a unique index on `lower(serial_number)`, partial on
`serial_number is not null` — most assets have no serial, and those must not
collide with each other. Before it, duplicate detection lived only in the import
screen, which asked and then inserted: two officers importing the same serial at
once both passed, and the single-asset form did not check at all. Any new screen
that writes an asset gets this for free; what it still owes the person is a
readable refusal, via `isDuplicateSerialError` in `src/lib/serials.ts`. Fold case
with `normaliseSerial` when comparing, or the screen will accept what the index
then rejects.

**Database functions pin their `search_path`.** Migration 21 set it on the three
asset-code functions the advisor caught after migration 19. It matters most on a
`SECURITY DEFINER` function, where an unpinned path is privilege escalation, but
the convention here is every function: `set search_path = public`, matching the
rest of the schema. Prefer `alter function ... set search_path` for an existing
one — it leaves a working body alone.

**The last administrator cannot be removed.** Enforced by trigger *and* checked
in the delete endpoint, because deleting an auth user cascades past the trigger.

**Asset codes read like matriculation numbers**: `NSU/ADM/ACC/CP/T/001` —
University / faculty or school / department / item type / segment / running
number. Built in the database by `next_barcode(unit, category)` from
`org_units.short_code` and `asset_categories.code`, both editable by an
administrator because no rule derives ACC from "Accounting" and CSC from
"Computer Science" at once.

The fifth segment is a placeholder whose meaning the University has not settled.
It is isolated in `asset_code_segment()` so it is a one line change.

**Labels are QR, not barcodes.** Phones are the only scanners this University
will own. The Code 128 encoder (`src/lib/code128.ts`) and `BarcodeImage` are
kept but unused — the payload is unchanged, so restoring a printed barcode is
small work if handheld laser scanners are ever bought.

Print size matters more than error correction level: measured against a fixed
speck of wear, a 17mm QR failed every attempt where 22mm mostly survived. The
label prints at 22mm for that reason. Do not shrink it to gain layout room.

**A faculty stands for everything beneath it.** Assets live in departments, so
filtering by a faculty must use `descendantIds` rather than matching one unit.
Getting this wrong made the faculty filter silently return nothing.

## Verifying work

Claims about generated documents get checked by rendering and reading them
back, not by trusting the generator:

- PDFs: render with `pypdfium2`, inspect the image.
- Barcodes and QR: decode with `zxing-cpp` and assert an exact round trip.

This has repeatedly caught things reasoning alone missed — a Naira sign printing
as a black box, a total orphaned onto its own page, and a durability claim that
turned out to be false. Prefer measuring to asserting.

## Working agreement

- Develop on `claude/nsuk-asset-management-spec-hthp6l`, branched fresh from
  `origin/main` each time. Open a draft PR; the user says "merge" when ready.
- Migrations are applied to the live database **and** written to
  `supabase/migrations/`. Keep the two in step.
- The repository is public. Never commit keys. The service role key belongs only
  in a server environment variable, never in a `NEXT_PUBLIC_` name.

## Open items

- What the `T` segment stands for.
- Lafia, Gudi and Pyanku exist as campuses with **zero units**. They need the
  University's real list; inventing structure would be worse than leaving them
  empty.
- Whether to print both a QR and a barcode. On the measurements that is the most
  robust option.
- In Supabase: leaked password protection is still off and needs a Pro plan.
  Public signup **is** off — `/auth/v1/settings` reports `disable_signup: true`,
  email provider only, no external OAuth. Confirmed 3 Sep 2026.
- The security advisor is clean apart from that, and a row per `SECURITY
  DEFINER` function saying signed-in users can call it. Those are the point of
  the functions — each carries its own check — so they are expected, not a
  backlog. Read them as a list to recognise, and look for anything that is not
  on it.
- The performance advisor reports most indexes as unused and will keep doing so
  until real data arrives: nothing has queried an empty register. Two findings
  are real and outlive that — `verification_scans.asset_id` and
  `verification_sessions.started_by` are foreign keys with no covering index.
  Unfixed; they cost nothing until verification runs at scale. It also flags a
  read and a write policy both being permissive for `SELECT` on five tables,
  which is a real if small cost on every read — worth folding together only with
  care, because they are the access rules.
- Agreed but unbuilt: bulk actions, Excel export, a read only auditor role. The
  custodian feature was started and deliberately removed at the user's request.
- Staff can only record assets into units assigned to them
  (`assets_insert`: `is_admin() or org_unit_id in (my_unit_ids())`). Several
  people recording "across the University" therefore means either administrator
  accounts or units assigned to each one — worth checking before a pilot day.

## Things that are not this project

A multi-tenant platform serving many institutions was discussed at length and
then withdrawn as raised in error. Do not build towards it unless the user
raises it again.
