begin;
select set_config('request.jwt.claim.sub',(select id::text from public.profiles where role='admin' limit 1),true);
set local role authenticated;
do $$
declare admin_id uuid:=auth.uid(); staff_id uuid; u uuid; other_u uuid; a uuid;
 own_key text:='fixture-'||gen_random_uuid()||'.jpg'; orphan_key text:='fixture-'||gen_random_uuid()||'.jpg'; foreign_key text:='fixture-'||gen_random_uuid()||'.jpg';
begin
 select id into staff_id from public.profiles where id<>admin_id limit 1;
 select x.id into u from public.org_units x where not exists(select 1 from public.org_units child where child.parent_id=x.id) limit 1;select id into other_u from public.org_units where id<>u limit 1;
 perform public.assign_account_scope(staff_id,'staff',array[u]);
 insert into storage.objects(bucket_id,name,owner_id) values('asset-photos',own_key,staff_id::text),('asset-photos',orphan_key,staff_id::text),('asset-photos',foreign_key,admin_id::text);
 insert into public.assets(name,org_unit_id,barcode,qr_payload,photo_url) values('Photo fixture',u,'fixture-'||gen_random_uuid(),'',own_key) returning id into a;
 perform set_config('request.jwt.claim.sub',staff_id::text,true);
 update public.assets set photo_url='https://legacy.example/storage/v1/object/public/asset-photos/'||own_key where id=a;
 if (select photo_url from public.assets where id=a)<>own_key then raise exception 'Legacy URL was not normalized'; end if;
 if not public.can_read_asset_photo(own_key) or not public.can_read_asset_photo(orphan_key) or public.can_read_asset_photo(foreign_key) then raise exception 'Incorrect staff object scope'; end if;
 if (select count(*) from storage.objects where name in(own_key,orphan_key,foreign_key))<>2 then raise exception 'Storage RLS failed'; end if;
 begin
   update public.assets set photo_url='https://legacy.example/storage/v1/object/public/asset-photos/'||foreign_key where id=a;
   raise exception 'Linked another account photo';
 exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 update public.assets set org_unit_id=other_u where id=a;
 perform set_config('request.jwt.claim.sub',staff_id::text,true);
 if public.can_read_asset_photo(own_key) or exists(select 1 from storage.objects where name=own_key) then raise exception 'Original uploader retained linked out-of-scope access'; end if;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 if not public.can_read_asset_photo(foreign_key) then raise exception 'Administrator lost object access'; end if;
 if (select public from storage.buckets where id='asset-photos') then raise exception 'Bucket is still public'; end if;
 if has_function_privilege('anon','public.can_read_asset_photo(text)','execute') then raise exception 'Anonymous read helper access'; end if;
end $$;
select 'private photo assertions passed' as result;
rollback;

