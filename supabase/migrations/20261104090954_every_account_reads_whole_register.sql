-- Every account reads the whole register, so that whoever is next to a printer
-- can find any asset and print its label. Labels are printed on a few shared
-- printers, and an officer could otherwise print only what they recorded or
-- what sits in their units.
--
-- Reading widens; nothing else does. Staff still correct only the assets they
-- recorded or that sit in their assigned units (assets_update is unchanged),
-- only administrators delete, and auditors remain read-only. Accounting
-- events, verification counts and the dashboard's unit statistics keep their
-- own rules. created_by still grants edit access, so the insert and update
-- triggers that protect it are left alone.

-- "Has an account" is a profile row. profiles_read lets a caller see their own
-- row, and the subquery does not depend on the asset row, so it is evaluated
-- once per statement rather than once per asset.
alter policy assets_select on public.assets
 using (exists(select 1 from public.profiles p where p.id = (select auth.uid())));

-- An asset's history goes with the asset.
alter policy asset_logs_select on public.asset_logs
 using (exists(select 1 from public.profiles p where p.id = (select auth.uid())));

-- A photo an asset shows is readable by anyone who can read the asset. A file
-- no asset uses keeps the rule it had: its uploader, or someone entitled to
-- remove it as a replaced photo.
create or replace function public.can_read_asset_photo(p_name text)
 returns boolean language plpgsql stable security definer set search_path = public as $$
declare k text := public.asset_photo_base_key(p_name);
begin
  if auth.uid() is null then return false; end if;
  if public.is_admin() then return true; end if;
  if exists(select 1 from public.assets a where public.asset_photo_key(a.photo_url)=k) then
    return exists(select 1 from public.profiles p where p.id=auth.uid());
  end if;
  return exists(select 1 from storage.objects o where o.bucket_id='asset-photos' and o.name=p_name and o.owner_id=auth.uid()::text)
    or public.can_remove_asset_photo(p_name);
end $$;
