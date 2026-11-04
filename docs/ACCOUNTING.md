# Asset accounting

The administrator-only **Asset accounting** page supports historical cost, class-wide
current-value revaluation, straight-line depreciation, opening balances, reviewed corrections,
impairment, financial history, Excel/PDF exports and immutable annual report snapshots.

Staff keep the asset-entry/import/photo/label workflow. They record purchase cost when known
and the date available for use. Blank cost is unknown; any cost above zero is known, and the
"cost is known" box confirms a zero cost. Cost recognition, and with it depreciation, is
automatic as soon as the asset has an active cost-model class, a known cost and a start date
outside finalized periods. The start date is the date available for use, or the acquisition
date when that is blank (1 January for a year-only acquisition). Otherwise the administrator
report flags the asset for review. Once recognized, these facts are locked and only an
administrator adjusts them. Administrators also see each asset's cost, annual and year-to-date
depreciation, accumulated depreciation and book value on its own page (`asset_depreciation`).

## Institutional classifications

The nine active categories follow the supplied policy: Buildings 2%; Plant & Machinery 10%;
Furniture & Fittings 20%; Motor Vehicles 20%; Office Equipment 25%; Specialised Equipment 10%;
IT Equipment 33%; Library books 10%; Infrastructure 10%. Land (code LD) is added at 0% and is
never depreciated: a 0% class has a zero annual charge in automatic recognition, opening
balances, corrections, impairment and revaluation alike, whatever remaining useful life is
entered. Legacy category rows remain inactive
for compatibility; known old categories are mapped without changing existing printed codes.

Initial policy uses historical cost, zero residual value and actual calendar-day proration
within each calendar year. Depreciation begins on the date available for use, includes that
day, uses numeric arithmetic and stops at residual value. The exact 33% rate is retained.
Calendar years use their actual 365/366 days. A reviewed opening, correction, impairment or
revaluation records balances at the end of its effective date; subsequent depreciation starts
the following day. Only one financial event per asset per effective date is allowed.

Rate changes require an administrator reason and apply to future acquisitions. Existing
events retain their charges. Opening balances and subsequent adjustments require evidence,
remaining useful life and a reason. Corrections and impairment preserve the last established
valuation basis (cost, fair value or current operational value); they do not silently change it.
Residual value, impairment and remaining life are reviewed
explicitly rather than inferred from the asset's physical condition.

## Revaluation and reporting

A revaluation must cover every current asset in its classification once, in one transaction.
Each requires prior cost recognition, an updated value, residual amount, remaining useful
life and measurement basis (current operational value or fair value). The class switches
to current-value measurement; original costs and previous events remain available.
New entries into a current-value class need administrator opening/revaluation review.

Reports are administrator-only, in NGN, with an explicit as-of date. Unknown amounts are
exported as blank, not zero. The annual depreciation calculation includes all event segments
in that year, including depreciation before a revaluation. Current draft reports reflect the
current physical register and current units; they are not a reconstruction of every past
physical transfer. Finalized December 31 snapshots retain the exact rows, units and amounts
saved then. Future years and incomplete reports cannot be finalized. Events dated in or
before a finalized period are refused. An administrator may delete an accounted asset after
typing "delete" to confirm; its accounting events are kept and finalized snapshots are unchanged.

This module provides asset schedules and evidence trails, not general-ledger journal posting.
Revaluation-surplus and surplus/deficit postings require the institution's accounting review.
Dedicated disposal/derecognition and inventory valuation are separate workflows. The provided
document does not supply a land class, so Land was added at 0% at the user's request rather
than assigned an equipment rate.

## Verification

`supabase/tests/automatic_depreciation.sql` checks the start-date fallback, typed and unknown
costs, a confirmed zero, recognition on a later edit, and that the asset page figures match the
report and are refused to staff. `supabase/tests/accounting.sql` runs rollback-only assertions for full/leap years, rate
changes, the exact 33% rate, residual limits, full-class coverage, revaluation history,
annual charges spanning events, corrections, impairment, finalized snapshots, deletion
that keeps accounting events, grants and role refusals. Use an unused Office Equipment class for the fixture.
`supabase/tests/accounting_finite_amounts.sql` checks that non-finite numeric values
cannot enter opening balances, accumulated depreciation, impairment or revaluation,
while valid finite amounts still post. Database constraints protect all six ledger
amount columns, including requests made directly to accounting functions.
`npm run test:accounting` verifies exports preserve unknown amounts and separate value bases.

[IPSAS 45](https://www.ipsasb.org/publications/ipsas-45-property-plant-and-equipment)
describes historical cost and current-value measurement. The rates above come from the
user-supplied institutional document; they are not claimed to be prescribed by IPSAS.



