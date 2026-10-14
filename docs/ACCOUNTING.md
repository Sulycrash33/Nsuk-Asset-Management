# Asset accounting

The administrator-only **Asset accounting** page supports historical cost, class-wide
current-value revaluation, straight-line depreciation, opening balances, reviewed corrections,
impairment, financial history, Excel/PDF exports and immutable annual report snapshots.

Staff keep the asset-entry/import/photo/label workflow. They record purchase cost when known
and the date available for use. Blank cost is unknown; confirmed zero cost is distinct.
Cost recognition is automatic when the class, known cost and service date are complete and
the service date is outside finalized periods. Otherwise the administrator report flags the
asset for review. Existing legacy values are never silently interpreted as recognized cost.

## Institutional classifications

The nine active categories follow the supplied policy: Buildings 2%; Plant & Machinery 10%;
Furniture & Fittings 20%; Motor Vehicles 20%; Office Equipment 25%; Specialised Equipment 10%;
IT Equipment 33%; Library books 10%; Infrastructure 10%. Legacy category rows remain inactive
for compatibility; known old categories are mapped without changing existing printed codes.

Initial policy uses historical cost, zero residual value and actual calendar-day proration
within each calendar year. Depreciation begins on the date available for use, includes that
day, uses numeric arithmetic and stops at residual value. The exact 33% rate is retained.
Calendar years use their actual 365/366 days. A reviewed opening, correction, impairment or
revaluation records balances at the end of its effective date; subsequent depreciation starts
the following day. Only one financial event per asset per effective date is allowed.

Rate changes require an administrator reason and apply to future acquisitions. Existing
events retain their charges. Opening balances and subsequent adjustments require evidence,
remaining useful life and a reason. Residual value, impairment and remaining life are reviewed
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
before a finalized period are refused. Accounted physical assets cannot be deleted.

This module provides asset schedules and evidence trails, not general-ledger journal posting.
Revaluation-surplus and surplus/deficit postings require the institution's accounting review.
Dedicated disposal/derecognition and inventory valuation are separate workflows. The provided
document does not supply a land class; land is not silently assigned an equipment rate.

## Verification

`supabase/tests/accounting.sql` runs rollback-only assertions for full/leap years, rate
changes, the exact 33% rate, residual limits, full-class coverage, revaluation history,
annual charges spanning events, corrections, impairment, finalized snapshots, deletion
protection, grants and role refusals. Use an unused Office Equipment class for the fixture.
`npm run test:accounting` verifies exports preserve unknown amounts and separate value bases.

[IPSAS 45](https://www.ipsasb.org/publications/ipsas-45-property-plant-and-equipment)
describes historical cost and current-value measurement. The rates above come from the
user-supplied institutional document; they are not claimed to be prescribed by IPSAS.

