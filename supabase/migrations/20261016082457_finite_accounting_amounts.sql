-- PostgreSQL numeric NaN compares greater than finite amounts and passes >= 0.
-- Existing nonnegative and balance checks still apply; exclude special values too.
alter table public.accounting_events
  add constraint accounting_events_finite_amounts check (
    original_cost < 'Infinity'::numeric
    and gross_amount < 'Infinity'::numeric
    and depreciation_open < 'Infinity'::numeric
    and impairment_open < 'Infinity'::numeric
    and residual_value < 'Infinity'::numeric
    and annual_charge < 'Infinity'::numeric
  );

