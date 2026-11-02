-- Land (0%) is never depreciated, however its value is recorded. Rolls back.
begin;
do $$
declare admin_id uuid; unit_id uuid; land uuid; oe uuid; a1 uuid; a2 uuid; a3 uuid; e public.accounting_events;
begin
 select id into admin_id from public.profiles where role='admin' limit 1;
 select id into unit_id from public.org_units limit 1;
 select id into land from public.asset_categories where name='Land' and active and annual_rate=0 and code='LD';
 if land is null then raise exception 'Land classification missing'; end if;
 select id into oe from public.asset_categories where name='Office Equipment' and active;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);

 insert into public.assets(name,category_id,org_unit_id,value,cost_known,available_for_use_date,acquisition_date,barcode,qr_payload)
 values('ROLLBACK land A',land,unit_id,50000000,true,'2015-01-01','2015-01-01','','') returning id into a1;
 select * into e from public.accounting_events where asset_id=a1;
 if e.annual_charge<>0 or public.accounting_amount(e,'2040-12-31')<>50000000 then raise exception 'Automatic land recognition depreciated'; end if;

 insert into public.assets(name,category_id,org_unit_id,value,cost_known,barcode,qr_payload)
 values('ROLLBACK land B',land,unit_id,0,false,'','') returning id into a2;
 perform public.record_accounting_event(a2,'2020-06-30','opening',land,20000000,20000000,0,0,0,10,'Title deed','Opening');
 select * into e from public.accounting_events where asset_id=a2;
 if e.annual_charge<>0 or public.accounting_amount(e,'2040-12-31')<>20000000 then raise exception 'Land opening balance depreciated'; end if;

 perform public.revalue_accounting_class(land,'2021-01-01',jsonb_build_array(
   jsonb_build_object('asset_id',a1,'amount',80000000,'residual',0,'years',5,'basis','fair_value'),
   jsonb_build_object('asset_id',a2,'amount',30000000,'residual',0,'years',5,'basis','fair_value')),'Valuer','Ref','Rollback');
 select * into e from public.accounting_events where asset_id=a1 order by effective_date desc limit 1;
 if e.annual_charge<>0 or public.accounting_amount(e,'2040-12-31')<>80000000 then raise exception 'Land revaluation depreciated'; end if;

 -- A depreciating class is unaffected.
 insert into public.assets(name,category_id,org_unit_id,value,cost_known,barcode,qr_payload)
 values('ROLLBACK OE',oe,unit_id,0,false,'','') returning id into a3;
 perform public.record_accounting_event(a3,'2020-06-30','opening',oe,1000,1000,0,0,0,4,'Receipt','Opening');
 select * into e from public.accounting_events where asset_id=a3;
 if e.annual_charge<>250 then raise exception 'Depreciating class opening changed'; end if;
end $$;
select 'Land is never depreciated' as result;
rollback;
