-- When a photo is replaced on the asset form, the old file (and its thumbnail)
-- is removed from storage instead of being left behind. Only administrators
-- could delete photo files until now, so an officer replacing a photo on their
-- own record had no way to clear the old one.
--
-- A non-administrator may remove a photo file only when no asset shows it any
-- more, and only if they uploaded it (a photo that was replaced before saving,
-- or their own record's old photo) or it was once the photo of an asset they
-- may edit (the field history says so). Auditors never may. Administrators keep
-- the right to remove any photo file, as before.

create function public.can_remove_asset_photo(p_name text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare k text := public.asset_photo_base_key(p_name);
begin
  if auth.uid() is null then return false; end if;
  if public.is_admin() then return true; end if;
  if not public.can_write_assets() then return false; end if;
  if exists(select 1 from public.assets a where public.asset_photo_key(a.photo_url) = k) then return false; end if;
  if exists(select 1 from storage.objects o where o.bucket_id = 'asset-photos'
      and o.name in (k, p_name) and o.owner_id = auth.uid()::text) then
    return true;
  end if;
  return exists(select 1 from public.asset_logs l join public.assets a on a.id = l.asset_id
    where public.asset_photo_key(l.changes -> 'photo_url' ->> 'before') = k
      and (a.org_unit_id in (select public.my_unit_ids()) or a.created_by = auth.uid()));
end $$;
revoke all on function public.can_remove_asset_photo(text) from public, anon;
grant execute on function public.can_remove_asset_photo(text) to authenticated;

alter policy "asset photos authenticated delete" on storage.objects
  using (bucket_id = 'asset-photos' and public.can_remove_asset_photo(name));

-- Postgres deletes only rows the caller can also read, so a photo that may be
-- removed must stay readable to whoever removes it. The final branch is the
-- only change: an unused photo was readable by its uploader alone.
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
  return exists(select 1 from storage.objects o where o.bucket_id='asset-photos' and o.name=p_name and o.owner_id=auth.uid()::text)
    or public.can_remove_asset_photo(p_name);
end $$;
