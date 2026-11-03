-- A staff officer records an asset into whichever unit they choose while
-- tagging, assigned to them or not. Afterwards they keep the records they made:
-- they can open them, print their labels, see their history and photo, and
-- correct them. Assets other people recorded stay scoped to assigned units, and
-- auditors stay strictly unit-scoped (the own-record branch requires write access).

-- created_by now grants access, so the database sets it and nobody changes it.
create or replace function public.assets_before_insert()
 returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.barcode is null or new.barcode = '' then
    new.barcode := public.next_barcode(new.org_unit_id, new.category_id);
  end if;
  new.qr_payload := new.barcode;
  -- A signed-in caller is always the recorder; only a server-side job with no
  -- caller may supply one.
  if auth.uid() is not null or new.created_by is null then
    new.created_by := auth.uid();
  end if;
  return new;
end $$;

create or replace function public.assets_before_update()
 returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  new.qr_payload := new.barcode;
  new.created_by := old.created_by;
  return new;
end $$;

alter policy assets_insert on public.assets
 with check ((select public.can_write_assets()));

alter policy assets_select on public.assets
 using ((select public.is_admin())
   or org_unit_id in (select public.my_unit_ids())
   or ((select public.can_write_assets()) and created_by = (select auth.uid())));

alter policy assets_update on public.assets
 using ((select public.can_write_assets()) and
   ((select public.is_admin())
    or org_unit_id in (select public.my_unit_ids())
    or created_by = (select auth.uid())))
 with check ((select public.can_write_assets()));

-- History of an asset the officer recorded. The subquery runs under the
-- assets policies, so it only ever reaches rows the caller may already read.
alter policy asset_logs_select on public.asset_logs
 using (public.is_admin()
   or from_unit_id in (select public.my_unit_ids())
   or to_unit_id in (select public.my_unit_ids())
   or asset_id in (select a.id from public.assets a
                    where a.created_by = (select auth.uid())));

create or replace function public.can_read_asset_photo(p_name text)
 returns boolean language plpgsql stable security definer set search_path = public as $$
declare k text := public.asset_photo_base_key(p_name);
begin
  if auth.uid() is null then return false; end if;
  if public.is_admin() then return true; end if;
  if exists(select 1 from public.assets a where public.asset_photo_key(a.photo_url)=k) then
    return exists(select 1 from public.assets a where public.asset_photo_key(a.photo_url)=k
      and (a.org_unit_id in(select public.my_unit_ids())
           or (public.can_write_assets() and a.created_by=auth.uid())));
  end if;
  return exists(select 1 from storage.objects o where o.bucket_id='asset-photos' and o.name=p_name and o.owner_id=auth.uid()::text);
end $$;

-- The edit form asks this to lock accounting fields; it must answer for an
-- officer's own record too, not only for assets in their units.
create or replace function public.asset_accounting_locked(p_asset uuid)
 returns boolean language sql stable security definer set search_path = public as $$
 select auth.uid() is not null and exists(select 1 from public.assets a where a.id=p_asset
   and (public.can_access_unit(a.org_unit_id) or (public.can_write_assets() and a.created_by=auth.uid())))
 and exists(select 1 from public.accounting_events where asset_id=p_asset)
$$;
