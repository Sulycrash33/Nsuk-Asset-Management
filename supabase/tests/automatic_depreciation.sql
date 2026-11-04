-- Depreciation is recognised automatically from a known cost, an active
-- classification and a start date: the date available for use, or else the
-- acquisition date. A typed cost is a known cost. Rolls back.
begin;
do $$
declare admin_id uuid; other_admin uuid; u uuid; ff uuid;
 a_acq uuid; a_both uuid; a_year uuid; a_unknown uuid; a_zero uuid; a_late uuid; a_nocat uuid;
 e public.accounting_events; d jsonb; r jsonb;
begin
 select id into admin_id from public.profiles where role='admin' order by id limit 1;
 select id into other_admin from public.profiles where role='admin' and id<>admin_id order by id limit 1;
 select id into u from public.org_units limit 1;
 select id into ff from public.asset_categories where name='Furniture & Fittings' and active and annual_rate=20;
 if ff is null then raise exception 'Furniture & Fittings at 20%% missing'; end if;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);

 -- Acquisition date only, cost typed with the box left unticked.
 insert into public.assets(name,category_id,org_unit_id,value,cost_known,acquisition_date,barcode,qr_payload)
 values('ROLLBACK acquisition only',ff,u,100000,false,'2024-03-01','','') returning id into a_acq;
 if not (select cost_known from public.assets where id=a_acq) then raise exception 'A typed cost was not treated as known'; end if;
 select * into e from public.accounting_events where asset_id=a_acq;
 if e.id is null then raise exception 'No depreciation without a date available for use'; end if;
 if e.charge_from<>'2024-03-01' or e.effective_date<>'2024-03-01' or e.annual_charge<>20000 or e.original_cost<>100000 then
   raise exception 'Wrong recognition from the acquisition date: %',to_jsonb(e); end if;

 -- A date available for use still wins.
 insert into public.assets(name,category_id,org_unit_id,value,cost_known,acquisition_date,available_for_use_date,barcode,qr_payload)
 values('ROLLBACK both dates',ff,u,50000,true,'2024-03-01','2024-06-15','','') returning id into a_both;
 if (select charge_from from public.accounting_events where asset_id=a_both)<>'2024-06-15' then raise exception 'Date available for use was overridden'; end if;

 -- Year-only acquisition starts on 1 January, as #80 does for the other date.
 insert into public.assets(name,category_id,org_unit_id,value,acquisition_date,acquisition_year_only,barcode,qr_payload)
 values('ROLLBACK year only',ff,u,10000,'2023-01-01',true,'','') returning id into a_year;
 if (select charge_from from public.accounting_events where asset_id=a_year)<>'2023-01-01' then raise exception 'Year-only acquisition did not start on 1 January'; end if;

 -- No cost typed and the box unticked: still unknown, nothing recognised.
 insert into public.assets(name,category_id,org_unit_id,value,cost_known,acquisition_date,barcode,qr_payload)
 values('ROLLBACK unknown cost',ff,u,0,false,'2024-03-01','','') returning id into a_unknown;
 if (select cost_known from public.assets where id=a_unknown) or exists(select 1 from public.accounting_events where asset_id=a_unknown) then
   raise exception 'An unknown cost was recognised'; end if;

 -- A confirmed zero is still a known cost.
 insert into public.assets(name,category_id,org_unit_id,value,cost_known,acquisition_date,barcode,qr_payload)
 values('ROLLBACK confirmed zero',ff,u,0,true,'2024-03-01','','') returning id into a_zero;
 if not exists(select 1 from public.accounting_events where asset_id=a_zero and original_cost=0) then raise exception 'Confirmed zero cost not recognised'; end if;

 -- No classification: nothing to depreciate at.
 insert into public.assets(name,org_unit_id,value,acquisition_date,barcode,qr_payload)
 values('ROLLBACK no class',u,10000,'2024-03-01','','') returning id into a_nocat;
 if exists(select 1 from public.accounting_events where asset_id=a_nocat) then raise exception 'Unclassified asset recognised'; end if;

 -- No date at first; recognised when an edit supplies the acquisition date.
 insert into public.assets(name,category_id,org_unit_id,value,barcode,qr_payload)
 values('ROLLBACK date later',ff,u,10000,'','') returning id into a_late;
 if exists(select 1 from public.accounting_events where asset_id=a_late) then raise exception 'Recognised with no start date'; end if;
 update public.assets set acquisition_date='2025-01-10' where id=a_late;
 if (select charge_from from public.accounting_events where asset_id=a_late) is distinct from '2025-01-10' then raise exception 'Edit did not recognise depreciation'; end if;

 -- The asset page figures match the report. 306 of 366 days of 20,000 in 2024.
 d:=public.asset_depreciation(a_acq,'2025-12-31');
 if (d->>'accumulated_depreciation')::numeric<>36721.31 or (d->>'carrying_amount')::numeric<>63278.69
   or (d->>'year_depreciation')::numeric<>20000 or (d->>'annual_charge')::numeric<>20000
   or d->>'starts'<>'2024-03-01' or d->>'status'<>'Valued' then raise exception 'Wrong asset figures: %',d; end if;
 select x into r from jsonb_array_elements(public.accounting_report('2025-12-31')->'rows') x where x->>'id'=a_acq::text;
 if (r->>'accumulated_depreciation')::numeric<>(d->>'accumulated_depreciation')::numeric
   or (r->>'carrying_amount')::numeric<>(d->>'carrying_amount')::numeric
   or (r->>'year_depreciation')::numeric<>(d->>'year_depreciation')::numeric then raise exception 'Asset page disagrees with the report'; end if;
 d:=public.asset_depreciation(a_acq,'2024-12-31');
 if (d->>'accumulated_depreciation')::numeric<>16721.31 or (d->>'year_depreciation')::numeric<>16721.31 then raise exception 'Wrong part-year figures: %',d; end if;
 d:=public.asset_depreciation(a_acq,'2024-01-01');
 if d->>'status'<>'Not yet in use' then raise exception 'Asset not yet in use reported as valued: %',d; end if;
 if public.asset_depreciation(a_unknown) is not null then raise exception 'Unvalued asset returned figures'; end if;

 -- Administrators only.
 if has_function_privilege('anon','public.asset_depreciation(uuid,date)','execute') then raise exception 'Anonymous can read depreciation'; end if;
 if has_function_privilege('authenticated','public.assets_cost_known_from_value()','execute') then raise exception 'Trigger function callable'; end if;
 update public.profiles set role='staff' where id=other_admin;
 perform set_config('request.jwt.claim.sub',other_admin::text,true);
 begin
   perform public.asset_depreciation(a_acq);
   raise exception 'Staff read depreciation';
 exception when raise_exception then if sqlerrm<>'Administrator access required' then raise; end if; end;
end $$;
select 'automatic depreciation assertions passed' as result;
rollback;
