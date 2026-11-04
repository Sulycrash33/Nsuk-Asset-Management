-- Every account reads the whole register (assets, their history and their
-- photos) so that anyone near a printer can print any label. Editing is not
-- widened: staff still correct only their own records and their units' assets,
-- auditors change nothing, only administrators delete. Rolls back.
begin;
insert into auth.users(id,email,raw_user_meta_data) values
 (gen_random_uuid(),'register-reader-none@example.invalid','{"name":"Reader No Units"}'),
 (gen_random_uuid(),'register-reader-other@example.invalid','{"name":"Reader Other Unit"}'),
 (gen_random_uuid(),'register-reader-auditor@example.invalid','{"name":"Reader Auditor"}');
select set_config('request.jwt.claim.sub',(select id::text from public.profiles where role='admin' limit 1),true);
set local role authenticated;
do $$
declare admin_id uuid:=auth.uid(); no_units uuid; other_staff uuid; auditor uuid; reader uuid;
 u uuid; other_u uuid; a uuid; affected integer;
 photo text:='fixture-'||gen_random_uuid()||'.jpg'; thumb text; loose text:='fixture-'||gen_random_uuid()||'.jpg';
begin
 thumb:=photo||'.thumb.jpg';
 select id into no_units from public.profiles where email='register-reader-none@example.invalid';
 select id into other_staff from public.profiles where email='register-reader-other@example.invalid';
 select id into auditor from public.profiles where email='register-reader-auditor@example.invalid';
 select x.id into u from public.org_units x where not exists(select 1 from public.org_units c where c.parent_id=x.id) limit 1;
 select x.id into other_u from public.org_units x where x.id<>u and not exists(select 1 from public.org_units c where c.parent_id=x.id) limit 1;
 perform public.assign_account_scope(no_units,'staff','{}'::uuid[]);
 perform public.assign_account_scope(other_staff,'staff',array[other_u]);
 perform public.assign_account_scope(auditor,'auditor','{}'::uuid[]);

 -- The administrator records an asset with a photo in u, and leaves one
 -- uploaded file that no asset shows.
 -- A thumbnail is accepted only once its photo exists, so one at a time.
 insert into storage.objects(bucket_id,name,owner_id) values('asset-photos',photo,admin_id::text);
 insert into storage.objects(bucket_id,name,owner_id) values('asset-photos',thumb,admin_id::text);
 insert into storage.objects(bucket_id,name,owner_id) values('asset-photos',loose,admin_id::text);
 insert into public.assets(name,org_unit_id,barcode,qr_payload,photo_url)
  values('Register fixture',u,'','',photo) returning id into a;

 foreach reader in array array[no_units,other_staff,auditor] loop
  perform set_config('request.jwt.claim.sub',reader::text,true);
  if not exists(select 1 from public.assets where id=a) then raise exception 'Asset unreadable for %',reader; end if;
  if not exists(select 1 from public.asset_logs where asset_id=a and action='created') then raise exception 'History unreadable for %',reader; end if;
  if not public.can_read_asset_photo(photo) or not public.can_read_asset_photo(thumb) then raise exception 'Photo unreadable for %',reader; end if;
  if (select count(*) from storage.objects where name in(photo,thumb))<>2 then raise exception 'Photo files unreadable for %',reader; end if;
  if public.can_read_asset_photo(loose) or exists(select 1 from storage.objects where name=loose) then raise exception 'Unlinked file readable for %',reader; end if;

  update public.assets set name='Forbidden' where id=a; get diagnostics affected=row_count;
  if affected<>0 then raise exception 'Asset edited by %',reader; end if;
  delete from public.assets where id=a; get diagnostics affected=row_count;
  if affected<>0 then raise exception 'Asset deleted by %',reader; end if;
  begin
   perform public.bulk_update_assets(array[a],'Faulty',null,null);
   raise exception 'Bulk change by %',reader;
  exception when insufficient_privilege then null; end;
  -- move_asset refuses an auditor outright and moves nothing for staff, since
  -- the update runs under the edit policy; the final check below proves it.
  begin perform public.move_asset(a,other_u,'Forbidden');
  exception when insufficient_privilege then null; end;
 end loop;

 -- Control: a signed-in identity with no account reads nothing.
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 if exists(select 1 from public.assets where id=a) then raise exception 'Identity without an account reads assets'; end if;
 if exists(select 1 from public.asset_logs where asset_id=a) then raise exception 'Identity without an account reads history'; end if;
 if public.can_read_asset_photo(photo) then raise exception 'Identity without an account reads photos'; end if;

 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 if not exists(select 1 from public.assets where id=a and name='Register fixture' and org_unit_id=u and condition='Working')
  then raise exception 'A reader changed or removed the asset'; end if;
end $$;
-- Nobody signed out reads the register.
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
 if exists(select 1 from public.assets) or exists(select 1 from public.asset_logs) then raise exception 'Anonymous register read'; end if;
end $$;
select 'every-account register read assertions passed' as result;
rollback;
