# NSUK Asset Management System

A digital register and barcode tracking system for the physical assets of
Nasarawa State University, Keffi. Every non-human asset is recorded once, given
a printed label, and thereafter tracked by scanning it with an ordinary phone.

Not yet in production use. The pilot has not loaded real data. **That makes now
the cheap moment for anything that would later require relabelling physical
items.** The register is **empty** again (3 Nov 2026, 11:11 UTC; re-checked
11:14, unchanged): the four trial
records were deleted in the app by the user (an administrator account) at
11:05–11:09, as a deliberate clean-up, which also
removed their photos, and at the user's choice the two automatic accounting
entries they left were deleted too. Kept, also at the user's choice: four trial
stock counts (`verification_sessions`), and the used running numbers — the next
asset in Bursar's Office is `…/004`, Fixed Assets Unit `…/007`, and VC's Office,
Conference Room and Economics `…/002`. Codes are never reused, by design.

The unit tree is the University's own as of migration 22 — 191 units across all
four campuses. Six accounts exist (3 Nov 2026): two administrators and four
staff, and none of the four staff has a unit assigned. That no longer stops them
recording (see below). The next step is the people: ten officers who will record
assets across the institution. Supabase is on the **Pro plan** since 2 Nov 2026.

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

**Creating an account needs the service role key. There is no fallback.**
`POST /api/admin/users` uses the Supabase admin API only when the server service key is set.
Missing configuration returns an explicit error; there is no ordinary signup fallback.
Creation validates inputs and references first, then provisions profile and units atomically.
Failed password-account setup compensates by deleting only the newly created Auth user;
failed invitation setup retains the recipient and reports the incomplete account for repair.
Role/unit changes use `assign_account_scope` as one transaction.

**A staff account records into any unit, and reads its units plus its own
records** (since 3 Nov 2026, migration `staff_record_into_any_unit`). The
officer picks the unit while tagging, assigned or not: `assets_insert` checks
only `can_write_assets()`. What they may then read and correct is assets in
their assigned units (`user_units`; a faculty's unit covers the departments
under it via `my_unit_ids()`) **plus** the assets they recorded themselves
(`created_by = auth.uid()`, extended to history, photo and the accounting lock).
`created_by` therefore grants access, so the insert trigger always sets it from
the caller and the update trigger never lets it change — do not loosen either.
Auditors are excluded from the own-record branch and stay strictly unit-scoped.
The register list and the labels page leave scope to row level security rather
than filtering by assigned units, or an officer's own records elsewhere would
vanish from them. An account with no units can record, but sees only what it
recorded. Test: `supabase/tests/staff_record_any_unit.sql`.

**The last administrator cannot be removed.** Enforced by trigger *and* checked
in the delete endpoint, because deleting an auth user cascades past the trigger.

**The unit tree is the University's, not ours.** Migration 22 replaced the
seeded structure with the 191 units of the official *Arrangement of Assets
Register*, and that document is the authority on what exists. Faculty of
Agriculture sits at Lafia, Faculty of Engineering at Gudi, and Pyanku holds a
library and its buildings, so no campus is empty any more. Section 20 of the
document is not in the tree on purpose: generators, a water pump and a tank are
assets, not places to put assets.

**Two units under one faculty must not abbreviate alike.** The asset code is
built from the faculty's code and the unit's, and `asset_seq` counts per unit,
so a shared abbreviation means a shared code — and `barcode` is unique, so the
second item cannot be saved at all. Eight codes are stated outright in migration
22 for that reason. Check a new unit by issuing codes and counting the distinct
results, not by reading the derivation: that is how migration 23's bug was
found, and reading the function had missed it.

**A foreign key that nulls on delete needs an index.** Both verification
foreign keys are `on delete set null`, so Postgres has to find the children
before it can null them, and with no index that is a full scan of the child
table per deleted row — deleting one asset scanned every verification scan ever
recorded. Migration 24 covers both, partially, since the nullable rows are never
what is being searched for. Prove a new index is actually reachable by planning
the query against realistic rows rather than by reasoning: a partial index the
planner will not use is worse than none.

The same goes the other way. A unique constraint is an index, and it answers
queries on its leading column, so a separate index on that column alone is dead
weight paid for on every write — migration 25 removed one from
`verification_scans`, the busiest write path there is during a count. When
planning to check that, watch selectivity: a first attempt gave one session half
the table, where a sequential scan was genuinely cheaper and the plan proved
nothing.

**Asset codes read like matriculation numbers**: `NSU/ADM/ACC/CP/001` —
University / faculty or school / department / item type / running number. Built in the database by `next_barcode(unit, category)` from
`org_units.short_code` and `asset_categories.code`, both editable by an
administrator because no rule derives ACC from "Accounting" and CSC from
"Computer Science" at once.

The old placeholder `T` segment was removed on 16 Oct 2026
(`remove_unused_asset_tag_segment`); `asset_code_segment()` no longer exists.
The running number counts per unit and is never reused after a deletion.

**Labels are QR, not barcodes.** Phones are the only scanners this University
will own. The Code 128 encoder (`src/lib/code128.ts`) and `BarcodeImage` are
kept but unused — the payload is unchanged, so restoring a printed barcode is
small work if handheld laser scanners are ever bought.

Print size matters more than error correction level: measured against a fixed
speck of wear, a 17mm QR failed every attempt where 22mm mostly survived. The
label keeps the QR at 22 mm or more for that reason, on any sticker size that
allows it (`labelLayout`, `DURABLE_QR_MM`): on a small sticker the title and
then the crest give way first. Do not shrink it to gain layout room.

**An upload is not necessarily a CSV.** `/assets/import` takes CSV, Excel
(`.xlsx .xlsm .xls .ods`), Word (`.docx`) and PDF. Everything is reduced to one
grid of strings in `src/lib/import-file.ts`, so the mapping, the validation and
the serial checks never learn what was uploaded. Three things there were found
by measuring rather than by reading the code, and each would have corrupted
data quietly:

- A spreadsheet date is read from the cell's **value**, not its displayed text.
  A cell showing `02/08/2019` is the second of August to the officer who typed
  it and the eighth of February to `Date.parse`. Same for money: the number
  behind `₦18,500,000`, not the punctuation.
- A PDF's columns are measured **per page**. A schedule is laid out afresh on
  each page, and using the first page's column positions on the second put every
  asset's condition into the value column — plausibly, and silently.
- Anything a reader returns is checked for control characters before it reaches
  the screen. Four kilobytes of random bytes named `.xlsx` did not fail: the
  spreadsheet library sniffed its way to a text reading and filled the preview
  with mojibake.

PDF is the one format with no cells of its own — columns are inferred from the
bands of the page no word ever occupies — so it is the one that sets `caution`
and asks the person to read the preview. A cell that wrapped onto a second line
reads as a row of its own; it surfaces as a row with no asset name, which the
importer already blocks, so it cannot get in unnoticed. A scanned PDF holds
pictures of words and is refused by name.

The fixtures and the browser harness that established all of this are not in the
repository. Rebuild them rather than trusting this list: generate a file in each
format, read it back through `readTable` in a real browser, and assert an exact
round trip.

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

- Develop on the branch the session names, branched fresh from `origin/main`
  each time. If its previous pull request was merged, start the branch again
  from `origin/main` rather than stacking on merged history. Open a draft PR; the user says "merge" when ready.
- Migrations are applied to the live database **and** written to
  `supabase/migrations/`. Keep the two in step.
- The repository is public. Never commit keys. The service role key belongs only
  in a server environment variable, never in a `NEXT_PUBLIC_` name.

## Open items

- The unit tree is the University's own. Two gaps in
  the source document are worth putting back to the Fixed Assets Unit: its
  numbered sections skip **6** and **11**, so two groups may have been left out
  when it was typed.
- Whether to print both a QR and a barcode. On the measurements that is the most
  robust option.
- In Supabase: the project is now on Pro, so leaked password protection can be
  turned on (Authentication → password settings). Not confirmed on as of
  2 Nov 2026 — check the setting itself. Public signup **is** off — `/auth/v1/settings` reports `disable_signup: true`,
  email provider only, no external OAuth. Confirmed 3 Sep 2026.
- The security advisor is clean apart from that, and a row per `SECURITY
  DEFINER` function saying signed-in users can call it. Those are the point of
  the functions — each carries its own check — so they are expected, not a
  backlog. Read them as a list to recognise, and look for anything that is not
  on it.
- The performance advisor reports most indexes as unused and will keep doing so
  until real data arrives: nothing has queried an empty register. Read that
  section as noise for now. Its two foreign key findings were real and are
  fixed in migration 24.
- Still open there: a read policy and a write policy are both permissive for
  `SELECT` on five tables, so both run on every read. Real, if small. Folding
  them together means rewriting access rules, so it wants more care than an
  index does.
- Bulk actions, Excel export and the read-only auditor role are built. The
  custodian feature was started and deliberately removed at the user's request.
- `TOP_TIERS` in `src/lib/types.ts` is declared and never read. Either the
  schedule grouping it was meant to drive went elsewhere, or it was left behind.
  Worth deciding rather than leaving as furniture.
- The bulk importer now reads Excel, Word and PDF as well as CSV, and each was
  verified by round trip in a real browser — but nobody has clicked through
  `/assets/import` in the app itself since. `xlsx` is pinned to the SheetJS
  vendor tarball (0.20.3) rather than the npm registry, which still serves the
  abandoned 0.18.5; `npm install` therefore needs to reach cdn.sheetjs.com.
- Nothing in this session was exercised against a running app. The hook changes
  in the scanner, the importer and the filters, and the serial number checks on
  the asset form, all pass typecheck, lint and build and were read back against
  the original — but no one has clicked through `/verify`, `/assets/import` or
  `/assets/new`. Worth doing on the preview before the pilot.
- Staff record into any unit (3 Nov 2026). They see other people's assets only
  in units assigned to them, so an officer checking a whole department's count
  still needs that unit assigned.

## Things that are not this project

A multi-tenant platform serving many institutions was discussed at length and
then withdrawn as raised in error. Do not build towards it unless the user
raises it again.


## Accounting scope update (14 October 2026)

The user expanded scope to include valuation/depreciation using the supplied policy. Administrator accounting controls and the nine document classifications (plus Land at 0%, added 2 Nov 2026, never depreciated) supersede earlier depreciation exclusions. See docs/ACCOUNTING.md. Staff only supply acquisition facts; financial events are immutable and period-locked. No general-ledger journal/disposal workflow has been introduced.


## Handoff: changes on 1–3 November 2026 (#66–#79)

**How the user works.** Do only what is asked. Anything extra — even an obvious
improvement — is described first and waits for approval. Where a request leaves
a real choice open (for example who may see what), ask one short question with
a recommended option, then build exactly that. Open a draft PR; merge only when
the user says "merge" (usually "merge when it passes": wait for both `check` and
`Isolated database integration`, then mark ready and squash-merge). A "merge"
covers the PR it was said about, not the next one. The user often relays the
University's wishes ("they said…") and refines them over several messages:
build the latest instruction exactly, drop what it supersedes, and send a
rendered picture of anything visual so they can judge it before merging.

**3 November — merged in #73** (`20261103083911_staff_record_into_any_unit`,
applied live and committed):

- **Staff record into any unit.** The user asked that an account be able to add
  assets whether or not it has units assigned, since the unit is chosen while
  tagging. `assets_insert` now checks only `can_write_assets()`. The unit
  picker on the asset form and the importer list every unit, and the "not
  assigned to a unit yet" block on `/assets/new` is gone.
- **Afterwards: own records only** — the option the user chose. An officer can
  open, label, see the history and photo of, and correct the assets they
  recorded, wherever those are. Other people's assets stay hidden unless they
  are in the officer's units. Auditors stay strictly unit-scoped, and only
  administrators delete. Rejected alternatives: view-only own records, and the
  whole register visible to all staff.
- **`created_by` now grants access**, so the insert trigger sets it from the
  caller (a client-supplied value is ignored) and the update trigger keeps it
  fixed. The register list (`register-scope.ts`) and `/labels` no longer filter
  by assigned units; row level security decides.
- Verified: `supabase/tests/staff_record_any_unit.sql` passed against the live
  database in a rolled-back transaction, and failed without the migration (the
  control). It also passed in CI. The security advisor showed nothing new.
  After the merge, staff accounts with no units saved three records with photos
  (by 10:35 UTC) — the add form works in the app. The importer and `/labels` as such an
  account have not been seen working.

**3 November — label redesign, merged in #75**, at the University's request, after two
intermediate versions (University name beside the QR; then item details in the
spare room). Settled layout, centred top to bottom: the NSUK crest, "NSUK ASSET
MANAGEMENT SYSTEM", the QR (still 22 mm), and the asset code under it. Nothing
about the item is printed — no name, unit, category or campus; scanning the QR
shows them — so `LabelInput` is just `{ barcode }`. If the crest cannot load,
the label still prints without it. Verified by rendering with `pypdfium2` and
decoding every QR exactly with `zxing-cpp` at the printer's 203 dpi.
`scripts/verify-labels.mjs` asserts the system name and that item details are
absent. The crest is in colour; on the monochrome XP-365B it prints as greys —
not yet seen on a real sticker.

**3 November — any sticker size, merged in #77** (asked for after #75: "adjust to any surface,
60 × 40 or smaller or larger"). `labelLayout(size)` in `src/lib/pdf.ts` scales
the approved 60 × 40 layout to any width × height, keeps the same top-to-bottom
order, and gives the QR whatever room is left (45 mm on 100 × 75, 93 mm on
100 × 150). If a 22 mm QR does not fit with everything, the title goes, then the
crest; below that the QR shrinks and the size picker warns. On a tall sticker
the crest grows into spare height. The size is chosen in **Label size**
(`label-paper-select.tsx`) wherever labels are printed: presets from 40 × 30 to
100 × 150, or custom 20–300 mm a side, stored per browser under
`nsuk-label-size` — a new key, so the pre-#65 `nsuk-label-paper` value cannot
return. 60 × 40 stays the default and its layout is unchanged. Verified by
rendering seven sizes with `pypdfium2` and decoding each QR exactly at 203 and
600 dpi; `scripts/verify-labels.mjs` checks every preset and several odd sizes
for bounds, order and the QR-first rule. The picker itself has not been clicked
through in the running app.

**3 November — small label PDFs, in #79.** The QR is drawn as filled squares
(`drawQr` in `src/lib/pdf.ts`) instead of an embedded picture, page streams are
compressed, and the crest is embedded once with compression. A 100-label batch
went from 88 MB and 4.3 s to 208 KB and 0.15 s. The module grid and its
four-module quiet zone are unchanged, so `labelLayout` sizes hold. Verified:
seven sizes decode exactly at 150, 203, 300 and 600 dpi, and all 100 batch labels
decode to their own code at 203 dpi; `verify-labels.mjs` keeps 100 labels under
1 MB. Rendered to one bit, as the thermal printer does, the colour crest comes
out as a recognisable grey crest.

**1–2 November — merged in #66–#71**, migrations applied live and committed:

- **Accounts**: assigning units at creation is optional (form and
  `parseAccountInput`). An account with no units sees only what it records itself.
- **Asset form**: only Unit is required (the asset code is built from it). A
  blank name saves as "Unnamed asset"; "Purchase cost is known" ticked with a
  blank cost saves as a confirmed ₦0. The importer still refuses rows with no
  name, deliberately (it catches PDF wrapped lines).
- **Year-only acquisition date**: opt-in "I only know the year". Stored as
  1 January with `assets.acquisition_year_only`, checked by constraint, shown as
  the year alone on the record, export and history. Acquisition date only, not
  "available for use".
- **Deleting assets**: any asset, including one with accounting records, after
  "Are you sure?" plus typing `delete` (`useConfirm({ typeToConfirm })`). The
  `protect_accounted_asset_delete` trigger is gone; accounting events are kept
  (no FK, by design). Deletion also removes the photo and thumbnail via the
  Storage API unless another asset uses the photo (`removeUnusedAssetPhoto`).
- **Photos**: reduced in the browser to ≤300 KB, 1600 px, JPEG
  (`src/lib/photo-compress.ts`), plus a ~6 KB 192 px thumbnail stored as
  `<photo>.thumb.jpg`. The asset list shows thumbnails, falling back to the
  photo. Storage rules: `can_read_asset_photo` resolves a thumbnail to its
  photo; `can_upload_asset_photo` only allows a thumbnail for a photo the same
  account uploaded. Bucket limit lowered from 10 MB to 1 MB.
- **Land**: active class `LD` at 0%. A 0% class has a zero annual charge in
  automatic recognition and in `record_accounting_event` /
  `revalue_accounting_class`, whatever useful life is typed.

Tests added: `supabase/tests/land_classification.sql`,
`supabase/tests/photo_thumbnails.sql`, and cases in
`scripts/verify-asset-photos.mjs` and `verify-account-provisioning.mjs`.

**Before the pilot** — the user asked (3 Nov) whether the system is solid and
what could go wrong. The answer: the foundation is sound (rules enforced in the
database and tested in CI, codes and serials unique by constraint, documents
verified by reading them back); the risks are operational. In order of cost:

1. Nobody has used it end to end. Hold one rehearsal on the preview with two or
   three officers, their phones and the XP-365B: add, import, print, scan,
   verify, delete.
2. Double recording. Officers record into any unit but see only their own
   records, so two can tag the same item. Give each officer a written list of
   rooms or units, and have an administrator review new records weekly.
3. Wrong unit. The unit is part of the asset code, so a wrong pick means a
   relabel. Confirm the unit codes, and the missing sections 6 and 11, with the
   Fixed Assets Unit before tagging starts.
4. Label wear. Print and stick a test label somewhere hot; use thermal-transfer
   or laminated stock outdoors.
5. Lock-outs and weak logins: SMTP, leaked password protection, one account per
   person, leavers removed the same day (all listed below).

Items 7–9 of that answer (label size, backups, trial data) were dealt with on
3 Nov: see the sections above and the backup note below.

**Waiting on the user**

- Delete the six leftover photos in Supabase → Storage → `asset-photos`. With
  the register empty (3 Nov, 11:11 UTC) these six are the **only** files in the
  bucket and none is referenced, so the bucket can simply be emptied. They are
  dated 9 Aug–1 Nov: two `.jpg` from 9 Aug, two `.png` from
  13 Oct, and one `.png` and one `.jpg` from 1 Nov. Check each against `assets.photo_url` before
  deleting. Direct SQL deletion is blocked by `storage.protect_delete` and would
  leave the files, so it must be the dashboard or the Storage API.
- Turn on leaked password protection.
- Decide, with the University, whether small stickers keep the logo at the cost
  of a QR under 22 mm. Asked on 3 Nov after #77, not yet answered. Today the QR
  comes first: on 40 × 30 and 50 × 30 the crest is left off, and below about
  50 × 25 the header goes and the picker warns. Swapping the order is a small
  change to the option list in `labelLayout`.
- Backups (checked against Supabase's docs, 3 Nov): Pro takes a **daily**
  database backup automatically and keeps 7 days, under Database → Backups.
  Confirm the list shows recent days. Two gaps: a restore can lose up to a day
  of recording (Point-in-Time Recovery closes that, ~US$100/month extra), and
  **backups do not include Storage — the asset photos**, which need their own
  periodic download. Rehearse a restore only with **Restore to a New Project**
  (a separate, billed copy; delete it after checking); an in-place restore takes
  the live app down and rewinds it.
- Before using email invitations or "forgot password": set up custom SMTP.
  Supabase's built-in email only reaches organisation team members, a few per
  hour. Until then, create officer accounts with a password.

**Not built — needs approval first**

- Removing the old photo (and thumbnail) when a photo is replaced on the edit
  form; today it stays in storage.
- Year-only option for "Date available for use".
**Not yet confirmed on a real phone or printer**: the typed delete confirmation,
saving an asset with blank fields, and — as a staff account with no units —
importing a file and printing labels. The new label has not been printed on a
real sticker of any size, and the Label size picker has not been used in the
app. The records in the register show that photo upload
with thumbnail and the year-only date have saved in the app, but nobody has
said whether that was on a phone. Worth doing on the preview before the
pilot.
