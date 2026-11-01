-- An administrator may delete any asset after confirming on screen. The
-- accounting events for it are kept: accounting_events.asset_id has no foreign
-- key, by design, so the financial history outlives the physical record, and
-- finalized reports are stored snapshots that a deletion cannot touch.
drop trigger if exists protect_accounted_asset_delete on public.assets;
drop function if exists public.protect_accounted_asset_delete();
