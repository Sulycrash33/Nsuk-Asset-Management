-- An edit must leave the asset where the editor may still edit it. Until
-- every_account_reads_whole_register this held only by accident: Postgres also
-- checks an updated row against the read policy, and the read policy was the
-- editor's scope, so moving an asset out of reach failed. Once everyone could
-- read everything, a staff officer could transfer an asset in their unit to any
-- other unit, which nobody asked for. The update's own check now states the
-- scope, so editing is exactly what it was before the read widened.
alter policy assets_update on public.assets
 using ((select public.can_write_assets()) and
   ((select public.is_admin())
    or org_unit_id in (select public.my_unit_ids())
    or created_by = (select auth.uid())))
 with check ((select public.can_write_assets()) and
   ((select public.is_admin())
    or org_unit_id in (select public.my_unit_ids())
    or created_by = (select auth.uid())));
