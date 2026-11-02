-- Small list thumbnails are stored beside each photo as '<photo key>.thumb.jpg'.
-- A thumbnail is readable by exactly whoever may read its photo, and may only
-- be uploaded for a photo the same account uploaded (or by an administrator),
-- so nobody can attach a misleading picture to someone else's asset.

create function public.asset_photo_base_key(p_name text) returns text
language sql immutable set search_path = public as $$
  select case when p_name like '%.thumb.jpg' then left(p_name, length(p_name) - 10) else p_name end
$$;
revoke all on function public.asset_photo_base_key(text) from public, anon;
grant execute on function public.asset_photo_base_key(text) to authenticated;

-- Reads resolve a thumbnail to its photo; for any other name the result is
-- unchanged, since the base key of a non-thumbnail name is the name itself.
create or replace function public.can_read_asset_photo(p_name text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare k text := public.asset_photo_base_key(p_name);
begin
  if auth.uid() is null then return false; end if;
  if public.is_admin() then return true; end if;
  if exists(select 1 from public.assets a where public.asset_photo_key(a.photo_url)=k) then
    return exists(select 1 from public.assets a where public.asset_photo_key(a.photo_url)=k
      and a.org_unit_id in(select public.my_unit_ids()));
  end if;
  return exists(select 1 from storage.objects o where o.bucket_id='asset-photos' and o.name=p_name and o.owner_id=auth.uid()::text);
end $$;

-- A thumbnail upload needs its photo to exist already, uploaded by the same
-- account. Ordinary photo names are unaffected.
create function public.can_upload_asset_photo(p_name text)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then return false; end if;
  if p_name not like '%.thumb.jpg' then return true; end if;
  return exists(select 1 from storage.objects o where o.bucket_id='asset-photos'
    and o.name=public.asset_photo_base_key(p_name)
    and (public.is_admin() or o.owner_id=auth.uid()::text));
end $$;
revoke all on function public.can_upload_asset_photo(text) from public, anon;
grant execute on function public.can_upload_asset_photo(text) to authenticated;

alter policy "asset photos authenticated write" on storage.objects
  with check (bucket_id = 'asset-photos' and public.can_write_assets()
    and (public.is_admin() or owner_id = (auth.uid())::text)
    and public.can_upload_asset_photo(name));
