-- A year-only date available for use needs a stored date, and depreciation is
-- recognised from the day stored for it. All changes roll back.
begin;
select set_config('request.jwt.claim.sub',(select id::text from public.profiles where role='admin' limit 1),true);
set local role authenticated;
do $$
declare u uuid; c uuid; a uuid; d date;
begin
 select x.id into u from public.org_units x where not exists(select 1 from public.org_units k where k.parent_id=x.id) limit 1;
 select id into c from public.asset_categories where active and measurement_model='cost' and annual_rate>0 limit 1;

 begin
   insert into public.assets(name,org_unit_id,barcode,qr_payload,available_for_use_year_only)
   values('Year-only fixture',u,'fixture-'||gen_random_uuid(),'',true);
   raise exception 'Year-only flag accepted without a date';
 exception when check_violation then null; end;

 insert into public.assets(name,org_unit_id,barcode,qr_payload,category_id,value,cost_known,acquisition_date,acquisition_year_only,available_for_use_date,available_for_use_year_only)
 values('Year-only fixture',u,'fixture-'||gen_random_uuid(),'',c,100000,true,'2025-01-01',true,'2025-01-01',true) returning id into a;
 if not (select available_for_use_year_only from public.assets where id=a) then raise exception 'Flag not stored'; end if;
 select charge_from into d from public.accounting_events where asset_id=a and kind='acquisition';
 if d is distinct from date '2025-01-01' then raise exception 'Depreciation starts on %, expected 1 January', d; end if;
end $$;
select 'year-only available for use assertions passed' as result;
rollback;
