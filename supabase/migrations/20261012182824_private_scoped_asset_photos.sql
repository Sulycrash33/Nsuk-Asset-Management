create function public.asset_photo_key(p_reference text) returns text
language sql immutable security invoker set search_path=public as $$
select case when p_reference like 'http%' then nullif(split_part(p_reference,'/storage/v1/object/public/asset-photos/',2),'') else nullif(p_reference,'') end;
$$;
revoke all on function public.asset_photo_key(text) from public,anon;
grant execute on function public.asset_photo_key(text) to authenticated;
create function public.can_read_asset_photo(p_name text) returns boolean
language plpgsql stable security definer set search_path=public as $$
begin
  if auth.uid() is null then return false; end if;
  if public.is_admin() then return true; end if;
  if exists(select 1 from public.assets a where public.asset_photo_key(a.photo_url)=p_name) then
    return exists(select 1 from public.assets a where public.asset_photo_key(a.photo_url)=p_name
      and a.org_unit_id in(select public.my_unit_ids()));
  end if;
  return exists(select 1 from storage.objects o where o.bucket_id='asset-photos' and o.name=p_name and o.owner_id=auth.uid()::text);
end $$;
revoke all on function public.can_read_asset_photo(text) from public,anon;
grant execute on function public.can_read_asset_photo(text) to authenticated;
create function public.validate_asset_photo_reference() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.photo_url is null or new.photo_url='' then return new; end if;
  if tg_op='UPDATE' and new.photo_url is not distinct from old.photo_url then return new; end if;
  if not exists(select 1 from storage.objects o where o.bucket_id='asset-photos' and o.name=new.photo_url
    and (public.is_admin() or o.owner_id=auth.uid()::text)) then
    raise exception 'Choose a photo uploaded by this account.' using errcode='insufficient_privilege';
  end if;
  return new;
end $$;
revoke all on function public.validate_asset_photo_reference() from public,anon,authenticated;
create trigger validate_asset_photo_reference before insert or update of photo_url on public.assets
for each row execute function public.validate_asset_photo_reference();
drop policy "asset photos public read" on storage.objects;
create policy "asset photos scoped read" on storage.objects for select to authenticated
using(bucket_id='asset-photos' and public.can_read_asset_photo(name));
alter policy "asset photos authenticated write" on storage.objects to authenticated
with check(bucket_id='asset-photos' and (public.is_admin() or owner_id=auth.uid()::text));
update storage.buckets set public=false where id='asset-photos';
