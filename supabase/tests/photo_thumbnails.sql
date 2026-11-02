-- Thumbnails ('<photo>.thumb.jpg') follow their photo's read scope and can only
-- be uploaded for a photo the same account uploaded. All changes roll back.
begin;
-- Two synthetic staff accounts besides the administrator (privileged setup).
insert into auth.users(id,email,raw_user_meta_data) values
 (gen_random_uuid(),'thumb-owner@example.invalid','{"name":"Thumb Owner"}'),
 (gen_random_uuid(),'thumb-colleague@example.invalid','{"name":"Thumb Colleague"}'),
 (gen_random_uuid(),'thumb-outsider@example.invalid','{"name":"Thumb Outsider"}');
select set_config('request.jwt.claim.sub',(select id::text from public.profiles where role='admin' limit 1),true);
set local role authenticated;
do $$
declare admin_id uuid:=auth.uid(); owner_id uuid; colleague_id uuid; outsider_id uuid; u uuid; other_u uuid;
 photo text:='fixture-'||gen_random_uuid()||'.jpg'; thumb text; foreign_photo text:='fixture-'||gen_random_uuid()||'.jpg';
begin
 thumb:=photo||'.thumb.jpg';
 select id into owner_id from public.profiles where email='thumb-owner@example.invalid';
 select id into colleague_id from public.profiles where email='thumb-colleague@example.invalid';
 select id into outsider_id from public.profiles where email='thumb-outsider@example.invalid';
 select x.id into u from public.org_units x where not exists(select 1 from public.org_units c where c.parent_id=x.id) limit 1;
 select x.id into other_u from public.org_units x where x.id<>u and not exists(select 1 from public.org_units c where c.parent_id=x.id) limit 1;
 perform public.assign_account_scope(owner_id,'staff',array[u]);
 perform public.assign_account_scope(colleague_id,'staff',array[u]);
 perform public.assign_account_scope(outsider_id,'staff',array[other_u]);
 if public.asset_photo_base_key(thumb)<>photo or public.asset_photo_base_key(photo)<>photo then raise exception 'Base key mapping failed'; end if;

 -- The owner uploads a photo, then its thumbnail, through the storage policy.
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 begin
   insert into storage.objects(bucket_id,name,owner_id) values('asset-photos',thumb,owner_id::text);
   raise exception 'Thumbnail accepted before its photo';
 exception when insufficient_privilege then null; end;
 insert into storage.objects(bucket_id,name,owner_id) values('asset-photos',photo,owner_id::text);
 insert into storage.objects(bucket_id,name,owner_id) values('asset-photos',thumb,owner_id::text);
 insert into public.assets(name,org_unit_id,barcode,qr_payload,photo_url) values('Thumb fixture',u,'fixture-'||gen_random_uuid(),'',photo);

 -- A colleague in the unit reads both; an outsider reads neither.
 perform set_config('request.jwt.claim.sub',colleague_id::text,true);
 if not public.can_read_asset_photo(photo) or not public.can_read_asset_photo(thumb) then raise exception 'Colleague cannot read photo or thumbnail'; end if;
 if (select count(*) from storage.objects where name in(photo,thumb))<>2 then raise exception 'Colleague storage read failed'; end if;
 perform set_config('request.jwt.claim.sub',outsider_id::text,true);
 if public.can_read_asset_photo(thumb) or exists(select 1 from storage.objects where name=thumb) then raise exception 'Outsider read thumbnail'; end if;

 -- Nobody may attach a thumbnail to a photo they did not upload.
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 insert into storage.objects(bucket_id,name,owner_id) values('asset-photos',foreign_photo,admin_id::text);
 perform set_config('request.jwt.claim.sub',colleague_id::text,true);
 begin
   insert into storage.objects(bucket_id,name,owner_id) values('asset-photos',foreign_photo||'.thumb.jpg',colleague_id::text);
   raise exception 'Thumbnail accepted for another account photo';
 exception when insufficient_privilege then null; end;

 if has_function_privilege('anon','public.can_upload_asset_photo(text)','execute') then raise exception 'Anonymous upload helper access'; end if;
end $$;
select 'photo thumbnail assertions passed' as result;
rollback;
