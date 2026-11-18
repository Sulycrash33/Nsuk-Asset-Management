-- Staff delete the assets they recorded themselves. Asked for on 18 Nov 2026
-- ("allow the users to delete only what they uploaded"); the user chose own
-- records only, over own records plus their assigned units.
--
-- * Administrators still delete any asset.
-- * Staff delete an asset only when created_by is their own id. created_by is
--   set from the caller on insert and never changes on update
--   (assets_before_insert / assets_before_update), so it cannot be claimed.
--   An asset in their unit that someone else recorded stays out of reach.
-- * Auditors delete nothing: can_write_assets() is false for them.
--
-- What a deletion leaves is unchanged: the activity log keeps a "deleted"
-- entry, accounting events are kept (no foreign key, by design), and stock
-- count scans keep their saved identity with the link nulled.

alter policy assets_delete on public.assets using (
  (select public.is_admin())
  or ((select public.can_write_assets()) and created_by = (select auth.uid()))
);
