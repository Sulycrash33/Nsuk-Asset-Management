-- A replaced photo can be removed from storage by whoever may edit the asset,
-- once no asset shows it. Nobody else may remove it, and a photo still in use
-- stays. All changes roll back.
begin;
insert into auth.users(id,email,raw_user_meta_data) values
 (gen_random_uuid(),'replace-owner@example.invalid','{"name":"Replace Owner"}'),
 (gen_random_uuid(),'replace-colleague@example.invalid','{"name":"Replace Colleague"}'),
 (gen_random_uuid(),'replace-outsider@example.invalid','{"name":"Replace Outsider"}'),
 (gen_random_uuid(),'replace-auditor@example.invalid','{"name":"Replace Auditor"}');
-- The Storage API sets this for its own deletes; here it lets the row level
-- policy, which is what is under test, decide.
select set_config('storage.allow_delete_query','true',true);
select set_config('request.jwt.claim.sub',(select id::text from public.profiles where role='admin' limit 1),true);
set local role authenticated;
do $$
declare owner_id uuid; colleague_id uuid; outsider_id uuid; auditor_id uuid; u uuid; other_u uuid; a uuid; n int;
 old_photo text:='fixture-'||gen_random_uuid()||'.jpg'; new_photo text:='fixture-'||gen_random_uuid()||'.jpg';
 unsaved text:='fixture-'||gen_random_uuid()||'.jpg'; stranger text:='fixture-'||gen_random_uuid()||'.jpg';
begin
 select id into owner_id from public.profiles where email='replace-owner@example.invalid';
 select id into colleague_id from public.profiles where email='replace-colleague@example.invalid';
 select id into outsider_id from public.profiles where email='replace-outsider@example.invalid';
 select id into auditor_id from public.profiles where email='replace-auditor@example.invalid';
 select x.id into u from public.org_units x where not exists(select 1 from public.org_units c where c.parent_id=x.id) limit 1;
 select x.id into other_u from public.org_units x where x.id<>u and not exists(select 1 from public.org_units c where c.parent_id=x.id) limit 1;
 perform public.assign_account_scope(owner_id,'staff',array[u]);
 perform public.assign_account_scope(colleague_id,'staff',array[u]);
 perform public.assign_account_scope(outsider_id,'staff',array[other_u]);
 perform public.assign_account_scope(auditor_id,'auditor',array[u]);

 -- The owner records an asset with a photo and thumbnail.
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 insert into storage.objects(bucket_id,name,owner_id) values('asset-photos',old_photo,owner_id::text);
 insert into storage.objects(bucket_id,name,owner_id) values('asset-photos',old_photo||'.thumb.jpg',owner_id::text);
 insert into public.assets(name,org_unit_id,barcode,qr_payload,photo_url) values('Replace fixture',u,'fixture-'||gen_random_uuid(),'',old_photo) returning id into a;

 -- A photo in use stays, even for its uploader.
 delete from storage.objects where bucket_id='asset-photos' and name in(old_photo,old_photo||'.thumb.jpg');
 get diagnostics n=row_count;
 if n<>0 then raise exception 'Photo in use was removed (% rows)',n; end if;

 -- The owner replaces it; the old one is no longer shown by any asset.
 insert into storage.objects(bucket_id,name,owner_id) values('asset-photos',new_photo,owner_id::text);
 update public.assets set photo_url=new_photo where id=a;

 -- Someone outside the unit, and a read-only auditor inside it, may not remove it.
 perform set_config('request.jwt.claim.sub',outsider_id::text,true);
 delete from storage.objects where bucket_id='asset-photos' and name in(old_photo,old_photo||'.thumb.jpg');
 get diagnostics n=row_count;
 if n<>0 then raise exception 'Outsider removed a replaced photo'; end if;
 perform set_config('request.jwt.claim.sub',auditor_id::text,true);
 if public.can_remove_asset_photo(old_photo) then raise exception 'Auditor may remove a photo'; end if;
 delete from storage.objects where bucket_id='asset-photos' and name in(old_photo,old_photo||'.thumb.jpg');
 get diagnostics n=row_count;
 if n<>0 then raise exception 'Auditor removed a replaced photo'; end if;

 -- A colleague who may edit the asset removes the old photo and its thumbnail,
 -- though someone else uploaded them; the photo still in use stays.
 perform set_config('request.jwt.claim.sub',colleague_id::text,true);
 delete from storage.objects where bucket_id='asset-photos' and name in(old_photo,old_photo||'.thumb.jpg',new_photo);
 get diagnostics n=row_count;
 if n<>2 then raise exception 'Colleague removed % files, expected the old photo and thumbnail',n; end if;

 -- A photo uploaded on the form and replaced before saving was never on an
 -- asset: its uploader may remove it, nobody else.
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 insert into storage.objects(bucket_id,name,owner_id) values('asset-photos',unsaved,owner_id::text),('asset-photos',stranger,owner_id::text);
 perform set_config('request.jwt.claim.sub',colleague_id::text,true);
 delete from storage.objects where bucket_id='asset-photos' and name=stranger;
 get diagnostics n=row_count;
 if n<>0 then raise exception 'Colleague removed an upload that was never on an asset'; end if;
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 delete from storage.objects where bucket_id='asset-photos' and name=unsaved;
 get diagnostics n=row_count;
 if n<>1 then raise exception 'Uploader could not remove an unsaved photo'; end if;

 if (select count(*) from storage.objects where name=new_photo)<>1 then raise exception 'Photo in use is missing'; end if;
 if has_function_privilege('anon','public.can_remove_asset_photo(text)','execute') then raise exception 'Anonymous removal helper access'; end if;
end $$;
select 'replaced photo removal assertions passed' as result;
rollback;
