-- Staff delete the assets they recorded, and nothing else; auditors delete
-- nothing; administrators delete anything. What a deletion leaves behind is
-- unchanged. Rolls back.
begin;
select set_config('request.jwt.claim.sub',(select id::text from public.profiles where role='admin' order by id limit 1),true);
set local role authenticated;
do $$
declare admin_id uuid:=auth.uid(); staff_id uuid; u uuid; ff uuid;
 own uuid; kept uuid; unit_asset uuid; affected integer;
begin
 select id into staff_id from public.profiles where id<>admin_id order by id limit 1;
 select x.id into u from public.org_units x where not exists(select 1 from public.org_units c where c.parent_id=x.id) limit 1;
 select id into ff from public.asset_categories where name='Furniture & Fittings' and active;

 -- The administrator records an asset in the unit the officer will hold.
 insert into public.assets(name,org_unit_id,barcode,qr_payload)
  values('ROLLBACK recorded by the administrator',u,'','') returning id into unit_asset;
 perform public.assign_account_scope(staff_id,'staff',array[u]);
 perform set_config('request.jwt.claim.sub',staff_id::text,true);

 -- An own record with depreciation, and a second one kept for the auditor.
 insert into public.assets(name,category_id,org_unit_id,value,acquisition_date,barcode,qr_payload)
  values('ROLLBACK own record',ff,u,10000,'2024-01-01','','') returning id into own;
 insert into public.assets(name,org_unit_id,barcode,qr_payload)
  values('ROLLBACK own record kept',u,'','') returning id into kept;

 -- In the officer's unit, so editable, but not theirs to delete.
 update public.assets set notes='Edited by the officer' where id=unit_asset; get diagnostics affected=row_count;
 if affected<>1 then raise exception 'Fixture: the unit asset should be editable'; end if;
 delete from public.assets where id=unit_asset; get diagnostics affected=row_count;
 if affected<>0 then raise exception 'Staff deleted an asset someone else recorded'; end if;

 delete from public.assets where id=own; get diagnostics affected=row_count;
 if affected<>1 then raise exception 'Staff could not delete their own record'; end if;

 -- An auditor deletes nothing, not even what it once recorded as staff.
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 perform public.assign_account_scope(staff_id,'auditor',array[u]);
 perform set_config('request.jwt.claim.sub',staff_id::text,true);
 delete from public.assets where id=kept; get diagnostics affected=row_count;
 if affected<>0 then raise exception 'An auditor deleted an asset'; end if;

 -- The administrator still deletes anything.
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 delete from public.assets where id=kept; get diagnostics affected=row_count;
 if affected<>1 then raise exception 'The administrator could not delete an asset'; end if;

 perform set_config('test.own',own::text,true);
 perform set_config('test.unit_asset',unit_asset::text,true);
end $$;
reset role;
do $$
declare own uuid:=current_setting('test.own')::uuid; unit_asset uuid:=current_setting('test.unit_asset')::uuid;
begin
 if exists(select 1 from public.assets where id=own) then raise exception 'Own record still present'; end if;
 if not exists(select 1 from public.asset_logs where asset_id=own and action='deleted') then raise exception 'Deletion was not logged'; end if;
 if not exists(select 1 from public.accounting_events where asset_id=own) then raise exception 'Deleting removed accounting events'; end if;
 if not exists(select 1 from public.assets where id=unit_asset) then raise exception 'Unit asset was deleted'; end if;
end $$;
select 'staff delete-own assertions passed' as result;
rollback;
