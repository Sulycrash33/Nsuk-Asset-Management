create or replace function public.validate_asset_photo_reference() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.photo_url is null or new.photo_url='' then return new; end if;
  if tg_op='UPDATE' and new.photo_url is not distinct from old.photo_url then return new; end if;
  -- Older clients submit public bucket URLs. Persist only the corresponding
  -- owned object key, so this transition never stores an external display URL.
  new.photo_url:=public.asset_photo_key(new.photo_url);
  if new.photo_url is null or not exists(select 1 from storage.objects o where o.bucket_id='asset-photos' and o.name=new.photo_url
    and (public.is_admin() or o.owner_id=auth.uid()::text)) then
    raise exception 'Choose a photo uploaded by this account.' using errcode='insufficient_privilege';
  end if;
  return new;
end $$;
revoke all on function public.validate_asset_photo_reference() from public,anon,authenticated;
