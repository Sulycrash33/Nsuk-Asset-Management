# NSUK Asset Management System

A digital register and barcode tracking system for the physical assets of
Nasarawa State University, Keffi. Every non-human asset is recorded once, given
a printed label, and thereafter tracked by scanning it with an ordinary phone.

Not yet in production use, but **real recording has begun**: after the morning
wipe below, officers recorded 69 assets on 4 Nov 2026 (10:56–14:30 UTC), all
by hand on `/assets/new`, none imported; on 5 Nov they corrected units, and 25
assets were re-coded (#88). Treat the register as live data from
here on. Unit codes are still unconfirmed, so a wrong unit now means a relabel.
The register was wiped completely on 4 Nov 2026 (~09:15 UTC), at the user's
request ("delete every asset and clear every remnant"): the three trial
assets recorded that morning, all asset history, all accounting entries, and
the four trial stock counts with their scans. At the user's choice the running
numbers were **reset too** (`org_units.asset_seq` = 0 everywhere), so every
unit starts again at `…/001` — checked by issuing `NSU/BUR/BUS/IT/001` in a
rolled-back transaction. Any trial sticker already printed must be destroyed,
since its code will be issued again. Outside that one deliberate reset, codes
are never reused, by design. The user then emptied the `asset-photos` bucket
in the dashboard (~09:28 UTC); all that is left is a 0-byte
`.emptyFolderPlaceholder` the dashboard writes itself, which no asset uses.

The unit tree is the University's own as of migration 22 — 191 units across all
four campuses, 194 since 9 Nov 2026 (#90 and then the Head Operation and
Investment Division PR added three offices under the Vice-Chancellor's Office
at the University's request). Six accounts exist (3 Nov 2026): two administrators and four
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

**Every account reads the whole register; editing is narrower** (since 4 Nov
2026, migration `every_account_reads_whole_register`, asked for so that anyone
near one of the few printers can print any label). `assets_select`,
`asset_logs_select` and the photo check `can_read_asset_photo` allow any
signed-in caller with a profile — staff and auditors alike, assigned units or
not. A photo file no asset shows still belongs only to its uploader. Not
widened: accounting events (admin only), verification counts and the
dashboard's `unit_asset_stats` (still unit-scoped). The user chose "view &
print only" over letting everyone edit.

A staff account records into any unit (since 3 Nov, migration
`staff_record_into_any_unit`): `assets_insert` checks only
`can_write_assets()`. What they may **correct** is assets in their assigned
units (`user_units`; a faculty's unit covers the departments under it via
`my_unit_ids()`) plus the assets they recorded themselves (`created_by =
auth.uid()`). `created_by` therefore grants edit access, so the insert trigger
always sets it from the caller and the update trigger never lets it change — do
not loosen either. Auditors edit nothing; only administrators delete. An edit must
also leave the asset inside the editor's scope, so staff cannot transfer an
asset to a unit they do not hold: `assets_update`'s `with check` states that
scope (migration `keep_asset_edits_in_scope`). Before the read widened this held
only by accident, because Postgres also checks an updated row against the read
policy; CI's `bulk_assets.sql` caught the gap. Because
reading is wider than editing, the screens must not offer an edit to someone
who only reads: the asset page shows Edit and Transfer only when `canEdit`, and
Print label always; the register shows a bulk-change checkbox only on rows the
person can change. Tests: `supabase/tests/every_account_reads_register.sql`
(including the control: an identity with no profile, and `anon`, read
nothing) and `staff_record_any_unit.sql`.

**The last administrator cannot be removed.** Enforced by trigger *and* checked
in the delete endpoint, because deleting an auth user cascades past the trigger.

**The unit tree is the University's, not ours.** Migration 22 replaced the
seeded structure with the 191 units of the official *Arrangement of Assets
Register*, and that document is the authority on what exists. Faculty of
Agriculture sits at Lafia, Faculty of Engineering at Gudi, and Pyanku holds a
library and its buildings, so no campus is empty any more. Section 20 of the
document is not in the tree on purpose: generators, a water pump and a tank are
assets, not places to put assets. Units the University asks for later are
added by migration, outside the document: so far TetFund Desk Office (TED),
Mail Office (MAI) (#90) and Head Operation and Investment Division (HOI), all
under the Vice-Chancellor's Office.

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

**A code is fixed at first save, but an administrator can re-issue it** (since
#88). Moving an asset or changing its category leaves its code alone, so a
printed sticker never goes wrong by itself. `reissue_asset_code(asset)`
(admin only) issues a code from the current unit and category, refuses when
the prefix already matches (the raise undoes the running number), and keeps
the old code in `asset_code_history`. An old code names one asset for good, so
it keeps resolving: `asset_for_code(code)` (invoker, under RLS) for the
scanner and `record_verification_scan` for stock counts. Any new screen that
looks an asset up by its code must go through one of those, or an old
sticker reads as unknown. The asset page lists previous codes and offers
**Issue new code** to administrators only when `codeIsOutOfDate`
(`src/lib/asset-code.ts`, which mirrors `next_barcode` and is not the
authority). Test: `supabase/tests/reissue_asset_code.sql`.

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
- In Supabase: leaked password protection (Authentication → password
  settings). On 4 Nov the security advisor no longer listed it as disabled,
  which suggests the user turned it on, but nobody has looked at the setting
  itself — confirm it. Public signup **is** off — `/auth/v1/settings` reports `disable_signup: true`,
  email provider only, no external OAuth. Confirmed 3 Sep 2026.
- The security advisor is clean apart from that, and a row per `SECURITY
  DEFINER` function saying signed-in users can call it. Those are the point of
  the functions — each carries its own check — so they are expected, not a
  backlog. Read them as a list to recognise, and look for anything that is not
  on it. Since #80 that list includes `can_remove_asset_photo`. It also shows
  `needs_bootstrap()` as callable by `anon`. #80 did not add it and it has not
  been looked into; it is presumably the first-administrator check made before
  anyone can sign in, but confirm that rather than assume it.
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
- Every account reads the whole register (4 Nov 2026), but a stock count
  (`/verify`) is still started only for an assigned unit, and the dashboard
  totals still cover assigned units only. Neither was asked to change. With no
  staff account holding a unit (checked 4 Nov), only administrators can start
  a stock count today: assign units, or ask whether counts should follow the
  wider read.

## Things that are not this project

A multi-tenant platform serving many institutions was discussed at length and
then withdrawn as raised in error. Do not build towards it unless the user
raises it again.


## Accounting scope update (14 October 2026)

The user expanded scope to include valuation/depreciation using the supplied policy. Administrator accounting controls and the nine document classifications (plus Land at 0%, added 2 Nov 2026, never depreciated) supersede earlier depreciation exclusions. See docs/ACCOUNTING.md. Staff only supply acquisition facts; financial events are immutable and period-locked. No general-ledger journal/disposal workflow has been introduced.


## Handoff: changes on 1–9 November 2026 (#66–#90)

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

**9 November — Head Operation and Investment Division** (migration
`20261109100229_head_operation_and_investment_division`, applied live and
committed). Asked for after #90 ("add this under the vc office as well"), as
"Head operation and investment division"; stored title-cased to match the
other names. An Office on Keffi (Main), code **HOI** (the `derive_short_code`
result, stated in the migration), no sibling clash. Verified live: 194 units;
`NSU/VCS/HOI/OE/001` and `…/002` issued in a rolled-back transaction, neither
already a barcode, running number back at 0. Not yet seen in the unit picker.

**9 November — merged in #90** (migration
`20261109120000_tetfund_desk_and_mail_offices`, applied live before the merge
and committed; the user said "merge it when it pass", and it was squash-merged
at 09:04 UTC once `check` and `Isolated database integration` passed on the
final commit, a `CLAUDE.md` update). The user asked for two
departments under the V.C Office: **TetFund Desk Office** and **Mail Office**,
both Offices on Keffi (Main), names spelt as the user gave them. Codes are the
`derive_short_code` result, stated outright in the migration: **TED** and
**MAI**. TFD was offered as more readable for TetFund; the user chose to keep
TED and MAI. Additive only: no existing unit, code or running number changed.
The migration refuses if two units under the VC's Office then share a short
code. Verified live: 193 units, sibling codes distinct, and codes issued in a
rolled-back transaction were `NSU/VCS/TED/OE/001`, `NSU/VCS/MAI/OE/001` and
`…/002`, none already a barcode, with both running numbers back at 0 after.
Not yet seen: either office in the unit picker in the running app.

**5 November — merged in #88** (migration
`20261105083152_reissue_asset_codes`, applied live before the merge and
committed). The user relayed two pilot issues and asked whether each was the
officers' hardware or the system; both were the system's, and the user chose
the recommended fixes:

- **"I changed the department but it did not change."** 25 assets were moved
  to Directorate of Academic Planning (14 from Physical Planning &
  Development on 4 Nov 14:43–14:55 by chikasteph1859, 10 from Academic Affairs
  Division on 5 Nov 05:43–06:07 by saboson1986, 1 from the Vice-Chancellor's
  Office). The move saved; the code, fixed at first save, still named the old
  unit. Likely cause: "Physical Planning", "Academic Planning" and "Academic
  Affairs" sit close in the unit picker. Chosen: **A** — re-code the 25 and
  add the administrator button, keeping old codes scannable. Rejected: leave
  the codes. The migration re-coded them as "System", oldest code first:
  AAD/OE/001–010 → ACP/OE/009–018, GEN/FF/002 → ACP/FF/019, PPD/OE/001–014 →
  ACP/OE/020–033. Not asked yet: whether stickers had been printed for them;
  old ones still scan, but new labels should go on.
- **"It logs out if the picture is greater than 300 KB."** There is no limit:
  every photo is reduced on the phone (72 stored, largest 298 KB). The logs
  showed each "Unable to load unit assignments" page in the same second as
  that person's token renewal (401 on `user_units` at 10:48:31 and 16:32:25 on
  4 Nov), on Samsung Internet / Android 10, which reloads the tab after the
  camera; saboson1986 then pressed Sign out five times. Fixed three ways:
  `requireSession` asks once more when a request fails and sends a 401 that
  persists to `/login`; a camera JPEG over 1600 px is decoded straight to
  1600 px (`decodeReduced`, size and EXIF orientation read by `jpegInfo` from
  the first 256 KB), falling back to the whole decode if the browser returns
  other dimensions; and the form no longer says "300 KB". The 300 KB target
  is unchanged.
- Verified: the old-code lookup did not exist before (control, read-only);
  `reissue_asset_code.sql` passed in CI's isolated database (a rolled-back
  live run stalled twice on an unanswered confirmation, so the user chose the
  CI route); after applying, all 25 mapped as previewed, `asset_seq` for ACP
  went 8 → 33, no duplicate or reused codes, 25 history rows as "System", no
  new accounting events, and as a staff identity an old code
  (NSU/VCS/PPD/OE/001) resolved to its asset flagged old while 25 history rows
  were readable. The photo decode was measured in Chromium (Samsung Internet
  30's engine): 4000×3000 → 1600×1200 via the reduced path, an EXIF
  orientation-6 photo → 1200×1600 upright, a PNG on the old path.
  `scripts/verify-asset-code.mjs` covers the 5 Nov cases. The security
  advisor added only `reissue_asset_code`, an expected SECURITY DEFINER row.
- **Not verified:** the token-renewal race was not reproduced; the retry is a
  mitigation fitted to the log timings. Nobody has used Issue new code or
  scanned an old sticker in the running app.
- **Found, not raised as work:** signed photo URLs last 15 minutes, so the
  asset list's thumbnails break if a page stays open longer (a burst of 400s
  at 12:34–12:35 on 4 Nov). Also, `authenticated` holds column UPDATE on
  `assets.barcode`, so an editor could set a code directly through the API;
  nothing in the app does. Worth a decision.
- The Supabase MCP `execute_sql` asks the user to confirm DDL or bulk changes
  even inside a rolled-back transaction, and the confirmation did not reach
  them. Read-only queries run without it; `apply_migration` ran once the user
  said "apply and merge".

**4 November — merged in #85** (migration
`20261104133049_automatic_depreciation_from_acquisition_date`, applied live
before the merge because officers were still recording, and committed):

- **Depreciation is calculated automatically.** The user reported it was not.
  The cause was the recognition rule in `accounting_capture()`: it needed
  "Date available for use" *and* the "Purchase cost is known" box. Of the first
  59 real assets, 50 had no depreciation: 35 gave only an acquisition date, and
  5 typed a cost but left the box unticked. Asked, the user chose all four
  recommended options:
  1. **Start date falls back to the acquisition date** (so 1 January for a
     year-only acquisition, the same day #80 chose). A date available for use
     still wins when it is given. Rejected: keeping that date required.
  2. **A cost above ₦0 is a known cost.** `assets_cost_known_from_value()`, a
     `SECURITY DEFINER` before trigger with execute revoked, sets `cost_known`
     — but only while the asset has no accounting record, because after that
     the facts are locked and changing `cost_known` would trip the lock. The
     box now only confirms ₦0; the form ticks and greys it once a cost is
     typed, and sends `cost_known || value > 0`.
  3. **Existing assets were caught up** in the migration: 40 recognised. Those
     5 had `cost_known` set by an update (field history does not track it, so
     no history rows were written; `updated_at` did change); the rest were
     inserted with `recorded_by` null, the same reason and evidence as the
     trigger.
  4. **Administrators see depreciation on the asset page**
     (`src/components/depreciation-panel.tsx`): cost, annual charge, start
     date, this year so far, accumulated, book value today. It comes from the
     new `asset_depreciation(asset, date)`, admin-only, same arithmetic as
     `accounting_report`. Staff and auditors do not see it. Without an
     accounting record, the panel names what is missing (`depreciationGaps`).
     Rejected: showing it to everyone, or keeping it on `/accounting` only.
- **Consequence to know:** an asset recognised from its acquisition date is
  locked as before, so a date available for use found later is an
  administrator correction, not an officer edit.
- **Live after the migration:** 61 assets, 50 valued, 11 flagged "Needs
  accounting details" (7 with no date at all, 3 with no cost, 1 with no
  category). Totals on 4 Nov: cost ₦15.70M, accumulated ₦15.57M, book
  ₦0.13M. That is correct, not a bug: 38 are Office Equipment at 25% acquired
  2020–2022, so fully written off. Spot check by hand: NSU/VCS/ACP/FF/001,
  ₦350,000 at 20% from 1 Jan 2022, is ₦339,068.49 accumulated on 4 Nov 2026
  (4 × 70,000 + 70,000 × 308/365).
- Verified: `supabase/tests/automatic_depreciation.sql` failed against the
  live database before the migration (control) and passed with it, rolled
  back; CI green on both jobs. In the app: the first asset an officer saved
  after the migration (13:36 UTC) was valued on save — 62 assets, 51 valued.
  The panel was rendered from the component with real figures and sent to the
  user; nobody has opened it signed in as an administrator in the running app.
- **Sandbox note:** `cdn.sheetjs.com` is denied by this cloud environment's
  network policy, so `npm ci` fails here on `xlsx`. To run `npm run check`
  locally, install with `xlsx` removed from `package.json`, restore the
  manifests, and put a typed stand-in in `node_modules/xlsx` (never
  committed). CI installs the real package. Running `next dev` also appends a
  block to `CLAUDE.md` and edits `next-env.d.ts`; revert both, and delete
  `.next` before the next typecheck.
- **Checked again after #86 merged** (the user asked whether everything was
  merged and depreciation working): `main` holds #85 and #86, and Vercel
  production is READY on #86's commit. Live: 63 assets, 52 valued; both assets
  saved after the migration were valued on save; no asset with a category, a
  known cost and a start date lacks depreciation; no typed cost left unknown;
  every acquisition event's cost and start date match its asset;
  `asset_depreciation` refused to `anon`. 2026 depreciation to date
  ₦430,567.11, book value ₦129,682.89. Still not seen in the running app: the
  panel as an administrator.
- **CI flake seen on #86:** `check` failed once in the build because
  `next/font/google` could not fetch JetBrains Mono ("next/font/google queries
  have exactly one entry"), on a `CLAUDE.md`-only change whose code had just
  passed on `main`. One re-run passed. Treat a repeat as real.

**4 November — the Fixed Assets Unit checklist** (asked for after a second
pilot-readiness question; not in the repository): a Claude Docs document,
[Pilot checklist for the Fixed Assets Unit](https://claude.ai/artifact/Cr7kR9jHqDttpbHh7ChrSh),
private to the user until they share it. Six sections: decide before more
tagging (codes of the five units in use — PRO, PPD, AAD, ACP under VCS/REG,
FXA under BUR — then the rest; sections 6 and 11; crest versus 22 mm QR);
accounts and units; six rules for officers; labels and a rehearsal day; a
weekly administrator review; what the first day's records show. Edit it
through the Claude Docs connector, never by publishing files into it.

What the first day's records show, found while writing it and new since the
readiness answer:

- **10 records each stand for several items** ("8 Office cabinet"
  NSU/VCS/PRO/OE/004, "5 office Window blinds" FF/030, four "2 Vistor Chair"
  records, "2 seater and 2 single sofa" PPD/OE/005, …). One label then covers
  several items. Nothing in the system stops it; the checklist asks officers
  for one record per item. Not raised as a code change.
- **The same kind of item is classified differently**: ceiling fans are
  Furniture & Fittings in Procurement Unit but Office Equipment in ACP and PPD;
  the PPD sofa is Office Equipment. The class sets the rate (20% vs 25%) and the
  item-type segment of the code (FF, OE), and is locked once depreciation
  exists.
- **A missing category is permanent in the code**: `next_barcode` writes `XX`
  and the code is fixed at insert (NSU/VCS/PRO/XX/023). Confirmed by reading
  `next_barcode` and `assets_before_insert`.
- No asset has a room (`location` is empty on all 63); no serial numbers.

The second readiness answer (4 Nov, ~13:45): **not yet for a proper pilot**, and
recording has started anyway, so confirming unit codes is now the most urgent
item; then units for staff, a rehearsal on real phones and the XP-365B, the six
missing officer accounts, and destroying trial stickers.

**4 November — merged in #82** (migrations
`20261104090954_every_account_reads_whole_register` and
`20261104092328_keep_asset_edits_in_scope`, applied live and committed):

- **Every account sees the whole register**, asked for "so that other users can
  also help print because of limited printer". Asked which way, the user chose
  **view & print only**: staff and auditors, with or without units, read every
  asset, its history and its photo, but edit exactly as before. Rejected:
  staff-only reading, and letting everyone edit. See the rule under "The
  things that are easy to get wrong".
- **The screens follow.** Print label on the asset page is no longer inside
  the edit-only block (it was, so a non-editor could not print from there); Edit
  and Transfer still need `canEdit`. The register and `/labels` unit filters
  list every unit; the register shows bulk-change checkboxes only on rows the
  person can change, and its export is titled "All units / All campuses".
  Dashboard totals and `/verify` were not asked about and stay unit-scoped.
- **A gap CI caught.** Widening the read let staff transfer an asset from their
  unit to any unit, because the old read policy had been the only thing
  stopping it (Postgres checks an updated row against the read policy too).
  `bulk_assets.sql` failed in CI, the failure was reproduced live, and
  `keep_asset_edits_in_scope` puts the scope into `assets_update`'s
  `with check`. The gap was live for about 15 minutes, with an empty register.
  Lesson: when widening a read policy, check what it was silently guarding on
  writes.
- Verified: `supabase/tests/every_account_reads_register.sql` failed against
  the live database before the migration (control) and passed after; the
  changed `staff_record_any_unit`, `private_photos`, `photo_thumbnails` and
  `bulk_assets` tests passed live, all rolled back; CI green on both jobs. The
  security advisor showed nothing new. Not yet used in the running app.

**4 November — register wiped** (asked for while #82 was in progress: "delete
every asset and clear every remnant so it will be clean and fresh"). Done
directly in the live database, not through a PR. Asked what to keep, the user
chose **everything goes, running numbers reset**. Deleted: 3 assets, 45 history
entries, 3 accounting entries, 4 verification sessions and their 5 scans
(deleting the sessions first lets `guard_verification_scan` accept the scan
deletion as a cascade). `org_units.asset_seq` set to 0. Kept: the 191 units,
the categories, the accounting classes and all 6 accounts. The photo files
needed the dashboard, and the user emptied the bucket.

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

**3 November — merged in #80** (three things asked for together; migrations
`20261103203814_remove_replaced_asset_photos` and
`20261103204007_year_only_available_for_use_date`, applied live and committed):

- **Label: asset code closer to the QR, larger and sharper.** The user said the
  gap was too big and asked for the code to be clearer. `codeGap` is now 0.6 mm
  at 60 × 40 (it was 2.4), so the visible white is 3.2 mm instead of 5.0. Nearly
  all of what is left is the QR's four-module quiet zone, which is kept on
  purpose: do not put text inside it. The code went from 11 to 14 pt, shrinking
  only to fit the width. It prints pure black, because near-black `INK` is
  dithered into grey dots by a thermal printer. It is letter-spaced
  (`CODE_CHAR_SPACE`) and drawn fill-then-stroke (`CODE_STROKE`) so the strokes
  stay solid at 203 dpi; both scale with the sticker. As always, the QR takes
  the height left over: 22.1 → 23.1 mm at 60 × 40. Verified: seven sizes
  rendered to one bit at 203 and 600 dpi, each QR decoded exactly.
  `verify-labels.mjs` checks the gap, the colour, the outline and the width,
  and fails on the old code. The title still prints in `INK`; making it pure
  black too was not asked for.
- **Replaced photos are removed from storage.** Replacing a photo on the form
  means tapping ✕ and then adding a new one, so the form remembers the photo it
  cleared (`clearedPhoto`) and collects whatever a new upload displaced
  (`replacedPhotos`), including uploads replaced before the first save. After a
  successful save it removes those through `removeUnusedAssetPhoto`. A photo
  that is only cleared, with nothing in its place, is **kept**: the approval
  was for "replaced". Extending it to cleared photos was offered and not taken
  up. Only administrators could delete photo files before, so the delete policy
  now uses `can_remove_asset_photo(name)`. An administrator may remove any file.
  Anyone else must be able to write assets (auditors never can), no asset may
  still show the photo, and they must either have uploaded it or be able to edit
  an asset whose history (`asset_logs.changes->photo_url->before`) shows it was
  that asset's photo. Postgres deletes only rows the caller can also read, so
  `can_read_asset_photo` gained the same case for unused photos. Tests:
  `supabase/tests/replaced_photo_removal.sql` (whose central case fails without
  the migration), and `photo_permissions.sql`, which now checks that deletion
  follows this rule rather than the administrator-only update rule. A test can
  delete from `storage.objects` only after
  `set_config('storage.allow_delete_query','true',true)`.
- **"I only know the year" for Date available for use.** Depreciation starts on
  that date, so the user was asked which day to store and chose **1 January**,
  or the acquisition date when the item was acquired later that same year
  (`yearOnlyAvailableDate` in `src/lib/asset-validation.ts`). The rejected
  options were 1 July and 31 December. A year before the acquisition year is
  refused, and the form says which day depreciation counts from. The checkbox
  is disabled under the accounting lock, like the date itself. The new column is
  `assets.available_for_use_year_only`. Its constraint only requires a date,
  because a stored acquisition date later in the year is legitimate. The date
  is shown nowhere but the form, so no other screen changed. The field history
  does not record this date (it never did), and the importer does not offer
  year-only for either date. Tests: `supabase/tests/available_year_only.sql`
  (automatic recognition charges from 1 January) and unit tests in
  `verify-asset-validation.mjs`.

**1–2 November — merged in #66–#71**, migrations applied live and committed:

- **Accounts**: assigning units at creation is optional (form and
  `parseAccountInput`). An account with no units sees only what it records itself.
- **Asset form**: only Unit is required (the asset code is built from it). A
  blank name saves as "Unnamed asset"; "Purchase cost is known" ticked with a
  blank cost saves as a confirmed ₦0. The importer still refuses rows with no
  name, deliberately (it catches PDF wrapped lines).
- **Year-only acquisition date**: opt-in "I only know the year". Stored as
  1 January with `assets.acquisition_year_only`, checked by constraint, shown as
  the year alone on the record, export and history. The same option for "Date
  available for use" followed in #80.
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

**Pilot readiness, asked again on 4 Nov after #82–#83** (before real
recording began that afternoon; see the top of this file) ("is the system ready
for the pilot now?"). The answer: **ready for a rehearsal, not yet for real
tagging.** Checked live that day: 0 assets, every unit's running number at 0,
191 units, 10 active categories, 2 administrators and 4 staff, no account with
a unit, advisor showing only the known list. What stood between it and the
pilot, in order:

1. One end-to-end rehearsal on the preview with real phones and the XP-365B —
   record, import, print, stick, scan, stock count, delete. None of it has been
   done on a real phone or sticker.
2. Unit codes, and sections 6 and 11, confirmed with the Fixed Assets Unit.
3. Units assigned to staff, or only administrators can run a stock count.
4. The rest of the ten officer accounts, one per person, with passwords (no
   SMTP yet).
5. Trial stickers destroyed.

Not blocking: backups exclude photos; the logo-versus-22 mm decision on small
stickers is still open. The one-page checklist for the Fixed Assets Unit that
was offered here was asked for and written the same afternoon (see above).

**Before the pilot** — the user asked (3 Nov) whether the system is solid and
what could go wrong. The answer: the foundation is sound (rules enforced in the
database and tested in CI, codes and serials unique by constraint, documents
verified by reading them back); the risks are operational. In order of cost:

1. Nobody has used it end to end. Hold one rehearsal on the preview with two or
   three officers, their phones and the XP-365B: add, import, print, scan,
   verify, delete.
2. Double recording. Officers record into any unit, so two can tag the same
   item. Since #82 everyone can see the whole register, so an officer can search
   before tagging; still give each officer a written list of rooms or units,
   and have an administrator review new records weekly.
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

- Destroy any trial stickers printed before the 4 Nov wipe. The running
  numbers were reset, so their codes will be issued again to real assets.
- Confirm leaked password protection is on (the advisor stopped flagging it
  on 4 Nov; the setting itself has not been looked at).
- Assign units to the staff accounts (none has one, 4 Nov), and create the
  remaining officer accounts — ten officers are planned, four staff exist.
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

- Nothing is waiting on approval. The two items listed here before were built
  in #80. Offered and not asked for: removing a photo that is only cleared with
  ✕, with nothing put in its place (kept today).

**Not yet confirmed on a real phone or printer**: whether any of the real
assets' labels have been printed and stuck, and in particular whether the 25
re-coded in #88 had stickers (old ones still scan; new labels are needed).
From #88: Issue new code, an old sticker in `/scan` and in a stock count, and
a large camera photo on a low-memory phone. From #85, the asset page's
Depreciation panel as an administrator, and the greyed "cost is known" box on
the form. Earlier: the typed delete confirmation,
saving an asset with blank fields, and — as a staff account with no units —
importing a file and printing labels. The new label has not been printed on a
real sticker of any size, and the Label size picker has not been used in the
app. From #80, nobody has yet replaced a photo in the app (check afterwards
that the old file has gone from Storage), saved a year-only date available for
use, or printed the larger asset code. The records in the register showed that photo upload
with thumbnail and the year-only date have saved in the app, but nobody has
said whether that was on a phone. From #82: nobody has yet signed in as
staff, opened an asset someone else recorded, and printed its label, or
checked that the same account gets no Edit, Transfer or bulk checkbox on it.
Worth doing on the preview before the pilot.
