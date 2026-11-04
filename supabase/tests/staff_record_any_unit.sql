-- A staff officer records into any unit and corrects the records they made,
-- and nothing else outside their units. Since every account reads the whole
-- register (every_account_reads_whole_register), reading reaches further than
-- editing. Rolls back.
begin;
select set_config('request.jwt.claim.sub',(select id::text from public.profiles where role='admin' limit 1),true);
set local role authenticated;
do $$
declare admin_id uuid:=auth.uid(); staff_id uuid; u uuid; other_u uuid;
 own uuid; foreign_a uuid; imported uuid; affected integer; who uuid;
 photo_key text:='fixture-'||gen_random_uuid()||'.jpg';
begin
 select id into staff_id from public.profiles where id<>admin_id limit 1;
 select x.id into u from public.org_units x where not exists(select 1 from public.org_units c where c.parent_id=x.id) limit 1;
 -- A unit outside u's subtree, so assignment to u can never reach it.
 select x.id into other_u from public.org_units x
  where not exists(select 1 from public.org_units c where c.parent_id=x.id) and x.id<>u limit 1;
 insert into public.assets(name,org_unit_id,barcode,qr_payload) values('Foreign fixture',other_u,'','') returning id into foreign_a;

 -- No units at all: still records, and reads back what it recorded.
 perform public.assign_account_scope(staff_id,'staff','{}'::uuid[]);
 perform set_config('request.jwt.claim.sub',staff_id::text,true);
 if exists(select 1 from public.my_unit_ids()) then raise exception 'Fixture staff has units'; end if;
 insert into public.assets(name,org_unit_id,barcode,qr_payload,created_by)
  values('Unassigned officer record',other_u,'','',admin_id) returning id,created_by into own,who;
 if who<>staff_id then raise exception 'Recorder was taken from the client'; end if;
 if not exists(select 1 from public.assets where id=own) then raise exception 'Own record unreadable'; end if;
 if not exists(select 1 from public.assets where id=foreign_a) then raise exception 'Foreign asset unreadable'; end if;
 if not exists(select 1 from public.asset_logs where asset_id=own and action='created') then raise exception 'Own history unreadable'; end if;
 if not exists(select 1 from public.asset_logs where asset_id=foreign_a) then raise exception 'Foreign history unreadable'; end if;

 update public.assets set name='Corrected', created_by=admin_id where id=own; get diagnostics affected=row_count;
 if affected<>1 then raise exception 'Own record not editable'; end if;
 if (select created_by from public.assets where id=own)<>staff_id then raise exception 'Recorder was rewritten'; end if;
 update public.assets set name='Forbidden' where id=foreign_a; get diagnostics affected=row_count;
 if affected<>0 then raise exception 'Foreign asset edited'; end if;
 delete from public.assets where id=own; get diagnostics affected=row_count;
 if affected<>0 then raise exception 'Staff deleted an asset'; end if;

 -- Photo on an own record in an unassigned unit stays readable to its recorder.
 insert into storage.objects(bucket_id,name,owner_id) values('asset-photos',photo_key,staff_id::text);
 update public.assets set photo_url=photo_key where id=own;
 if not public.can_read_asset_photo(photo_key) then raise exception 'Own photo unreadable'; end if;

 -- Import into an unassigned unit returns the recorded rows.
 select id into imported from public.import_asset_rows(jsonb_build_array(jsonb_build_object(
   'import_key',repeat(md5(gen_random_uuid()::text),2),'name','Imported elsewhere','org_unit_id',other_u,'value',0)));
 if imported is null then raise exception 'Import into another unit failed'; end if;

 -- Assigned units behave as before.
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 perform public.assign_account_scope(staff_id,'staff',array[u]);
 perform set_config('request.jwt.claim.sub',staff_id::text,true);
 if not exists(select 1 from public.assets where id=own) then raise exception 'Own record lost on assignment'; end if;
 update public.assets set name='Forbidden' where id=foreign_a; get diagnostics affected=row_count;
 if affected<>0 then raise exception 'Assignment widened edit reach'; end if;

 -- An auditor reads everything and edits nothing, even records it once made.
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 perform public.assign_account_scope(staff_id,'auditor',array[u]);
 perform set_config('request.jwt.claim.sub',staff_id::text,true);
 if not exists(select 1 from public.assets where id=own) then raise exception 'Auditor cannot read the register'; end if;
 if not public.can_read_asset_photo(photo_key) then raise exception 'Auditor cannot read a register photo'; end if;
 update public.assets set name='Forbidden' where id=own; get diagnostics affected=row_count;
 if affected<>0 then raise exception 'Auditor edited its old record'; end if;
 begin
  insert into public.assets(name,org_unit_id,barcode,qr_payload) values('Forbidden',other_u,'','');
  raise exception 'Auditor recorded an asset';
 exception when insufficient_privilege then null; end;
end $$;
select 'staff record-anywhere assertions passed' as result;
rollback;
