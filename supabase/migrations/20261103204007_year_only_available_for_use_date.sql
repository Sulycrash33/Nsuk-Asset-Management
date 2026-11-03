-- An officer may know only the year an item was first ready for use, as with
-- the acquisition date. The column still needs a whole date, and depreciation
-- starts on it, so the form stores 1 January of that year, or the acquisition
-- date when the item was acquired later in that same year (the user's choice,
-- 3 Nov 2026). The flag lets screens show the year rather than a day nobody
-- recorded. Unlike the acquisition flag, the day is not pinned here: a full
-- acquisition date later in the year is a legitimate stored value.
alter table public.assets add column available_for_use_year_only boolean not null default false;
comment on column public.assets.available_for_use_year_only is
  'True when only the year the asset became available for use is known; available_for_use_date then holds 1 January of that year, or the acquisition date if that is later in the same year.';
alter table public.assets add constraint assets_available_for_use_year_only check (
  not available_for_use_year_only or available_for_use_date is not null);
