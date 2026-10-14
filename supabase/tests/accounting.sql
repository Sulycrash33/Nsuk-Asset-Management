-- Run after the accounting migration; all fixtures are rolled back.
begin;
do $$
declare admin_id uuid; unit_id uuid; class_id uuid; it_class uuid; a_id uuid; it_id uuid; event public.accounting_events; report jsonb; before_count integer; doc uuid;
begin
 select id into admin_id from public.profiles where role='admin' limit 1;
 select id into unit_id from public.org_units limit 1;
 select id into class_id from public.asset_categories where name='Office Equipment' and active;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 if public.accounting_charge(250000,'2026-01-01','2026-12-31')<>250000 then raise exception 'Full year calculation failed'; end if;
 if public.accounting_charge(36600,'2024-02-29','2024-02-29')<>100 then raise exception 'Leap-year proration failed'; end if;
 if public.accounting_charge(100,'2026-12-31','2026-01-01')<>0 then raise exception 'Negative period failed'; end if;
 if has_table_privilege('authenticated','public.accounting_events','INSERT') or has_table_privilege('authenticated','public.asset_categories','UPDATE') or has_function_privilege('anon','public.accounting_report(date)','EXECUTE') then raise exception 'Financial grants are unsafe'; end if;
 select id into it_class from public.asset_categories where name='IT Equipment';
 insert into public.assets(name,category_id,org_unit_id,value,cost_known,available_for_use_date,acquisition_date,barcode,qr_payload)
 values('ROLLBACK 33 percent fixture',it_class,unit_id,100,true,'2020-01-01','2020-01-01','','') returning id into it_id;
 select * into event from public.accounting_events where asset_id=it_id;
 if public.accounting_amount(event,'2022-12-31')<>1 or public.accounting_amount(event,'2023-12-31')<>0 then raise exception 'Exact 33 percent rate or cap failed'; end if;
 insert into public.assets(name,category_id,org_unit_id,value,cost_known,available_for_use_date,acquisition_date,barcode,qr_payload)
 values('ROLLBACK accounting fixture',class_id,unit_id,1000000,true,'2020-01-01','2020-01-01','','') returning id into a_id;
 select * into event from public.accounting_events where asset_id=a_id;
 if event.id is null or event.annual_charge<>250000 then raise exception 'Automatic cost recognition failed'; end if;
 if public.accounting_amount(event,'2020-12-31')<>750000 or public.accounting_amount(event,'2028-12-31')<>0 then raise exception 'Annual amount or depreciation cap failed'; end if;
 begin update public.assets set value=900000 where id=a_id; raise exception 'Locked cost accepted'; exception when raise_exception then if sqlerrm='Locked cost accepted' then raise; end if; end;
 perform public.set_accounting_rate(class_id,20,'Rollback policy change');
 select * into event from public.accounting_events where asset_id=a_id;
 if event.annual_charge<>250000 then raise exception 'Rate change rewrote financial history'; end if;
 begin perform public.revalue_accounting_class(class_id,'2022-01-01','[]','Valuer','Reference','Reason'); raise exception 'Incomplete class accepted'; exception when raise_exception then if sqlerrm='Incomplete class accepted' then raise; end if; end;
 -- Use a class that contains only this fixture; fixture aborts if real data needs a different test class.
 select count(*) into before_count from public.assets where category_id=class_id;
 if before_count<>1 then raise exception 'Fixture requires an unused Office Equipment class'; end if;
 perform public.revalue_accounting_class(class_id,'2022-01-01',jsonb_build_array(jsonb_build_object('asset_id',a_id,'amount',800000,'residual',100000,'years',7,'basis','current_operational')),'Test valuer','Test reference','Rollback revaluation');
 select * into event from public.accounting_events where asset_id=a_id order by effective_date desc limit 1;
 if event.original_cost<>1000000 or event.gross_amount<>800000 or public.accounting_amount(event,'2022-01-01')<>800000 then raise exception 'Revaluation cost preservation failed'; end if;
 if public.accounting_amount(event,'2040-12-31')<>100000 then raise exception 'Residual cap failed'; end if;
 if public.accounting_year_charge(a_id,'2022-12-31')<>100410.96 then raise exception 'Year charges lost pre-revaluation depreciation'; end if;
 report:=public.accounting_report('2021-12-31');
 if not exists(select 1 from jsonb_array_elements(report->'rows') r where r->>'id'=a_id::text and r->>'status'='Valued' and (r->>'carrying_amount')::numeric=500000) then raise exception 'Historical report failed'; end if;
 doc:=public.finalize_accounting_year('2021-12-31');
 if not exists(select 1 from public.accounting_reports where id=doc and snapshot=report) then raise exception 'Finalized snapshot failed'; end if;
 perform public.record_accounting_event(it_id,'2023-01-02','correction',it_class,120,120,99,0,0,1,'Corrected receipt','Rollback correction');
 perform public.record_accounting_event(it_id,'2023-01-03','impairment',it_class,120,120,99.06,5,0,1,'Damage review','Rollback impairment');
 select * into event from public.accounting_events where asset_id=it_id order by effective_date desc limit 1;
 if public.accounting_amount(event,'2023-01-03')<>15.94 then raise exception 'Impairment balances failed'; end if;
 begin delete from public.assets where id=it_id; raise exception 'Accounted asset deleted'; exception when raise_exception then if sqlerrm='Accounted asset deleted' then raise; end if; end;
 if not exists(select 1 from public.accounting_reports where id=doc and snapshot=report) then raise exception 'Later changes rewrote finalized report'; end if;
 begin perform public.record_accounting_event(a_id,'2021-12-31','impairment',class_id,1000000,800000,0,1000,0,7,'Ref','Reason'); raise exception 'Closed period accepted'; exception when raise_exception then if sqlerrm='Closed period accepted' then raise; end if; end;
 -- Existing original administrator is temporarily demoted inside this rollback-only transaction.
 perform set_config('request.jwt.claim.sub','',true);
 update public.profiles set role='staff' where id=admin_id;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 begin perform public.accounting_report('2022-12-31'); raise exception 'Staff financial access accepted'; exception when raise_exception then if sqlerrm='Staff financial access accepted' then raise; end if; end;
 begin perform public.set_accounting_rate(class_id,1,'Not authorized'); raise exception 'Staff policy write accepted'; exception when raise_exception then if sqlerrm='Staff policy write accepted' then raise; end if; end;
 perform set_config('request.jwt.claim.sub','',true);
 update public.profiles set role='auditor' where id=admin_id;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 begin perform public.revalue_accounting_class(class_id,'2023-01-01','[]','Valuer','Ref','Reason'); raise exception 'Auditor revaluation accepted'; exception when raise_exception then if sqlerrm='Auditor revaluation accepted' then raise; end if; end;
end $$;
select 'Accounting calculations, immutable periods and role refusals passed' as result;
rollback;

