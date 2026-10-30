begin;
-- These helpers depend on the caller, not the asset row. InitPlans evaluate
-- them once per statement while preserving all existing unit and role checks.
alter policy assets_select on public.assets
 using ((select public.is_admin()) or org_unit_id in (select public.my_unit_ids()));
alter policy assets_insert on public.assets
 with check ((select public.can_write_assets()) and
 ((select public.is_admin()) or org_unit_id in (select public.my_unit_ids())));
alter policy assets_update on public.assets
 using ((select public.can_write_assets()) and
 ((select public.is_admin()) or org_unit_id in (select public.my_unit_ids())))
 with check ((select public.can_write_assets()));
alter policy assets_delete on public.assets using ((select public.is_admin()));
commit;

