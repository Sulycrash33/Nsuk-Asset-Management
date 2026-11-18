-- After automatic depreciation has started, an editor can still correct the
-- cost and dates, and the depreciation is recalculated at the rate it was
-- first charged at. The category stays locked. Once an administrator has
-- recorded an adjustment, or the year is closed, the facts are locked again.
-- Rolls back.
begin;
do $$
declare admin_id uuid; staff_id uuid; u uuid; ff uuid; oe uuid;
 a uuid; b uuid; c uuid; z uuid; e public.accounting_events; prev public.accounting_events; dep numeric; n integer;
begin
 select id into admin_id from public.profiles where role='admin' order by id limit 1;
 select id into staff_id from public.profiles where id<>admin_id order by id limit 1;
 select x.id into u from public.org_units x where not exists(select 1 from public.org_units k where k.parent_id=x.id) limit 1;
 select id into ff from public.asset_categories where name='Furniture & Fittings' and active and annual_rate=20;
 select id into oe from public.asset_categories where name='Office Equipment' and active;
 if ff is null or oe is null then raise exception 'Fixture classes missing'; end if;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 perform public.assign_account_scope(staff_id,'staff','{}'::uuid[]);

 -- The officer records it; the system depreciates it.
 perform set_config('request.jwt.claim.sub',staff_id::text,true);
 insert into public.assets(name,category_id,org_unit_id,value,acquisition_date,barcode,qr_payload)
  values('ROLLBACK cost correction',ff,u,100000,'2024-03-01','','') returning id into a;
 if (select count(*) from public.accounting_events where asset_id=a)<>1 then raise exception 'Fixture: not recognised'; end if;
 if not public.asset_accounting_locked(a) then raise exception 'Category should be locked'; end if;
 if public.asset_figures_locked(a) then raise exception 'Cost and dates should be open to correction'; end if;

 -- A new cost: one record, the new cost, 20% of it.
 update public.assets set value=150000 where id=a;
 select count(*) into n from public.accounting_events where asset_id=a;
 select * into e from public.accounting_events where asset_id=a;
 if n<>1 or e.original_cost<>150000 or e.gross_amount<>150000 or e.annual_charge<>30000
   or e.charge_from<>'2024-03-01' or e.kind<>'acquisition' or e.recorded_by<>staff_id
   or e.evidence<>'Asset entry, recalculated after an edit' then
   raise exception 'Cost correction not recalculated: % records, %',n,to_jsonb(e); end if;
 if (select (changes->'value'->>'before')::numeric from public.asset_logs where asset_id=a and action='edited' order by created_at desc limit 1)<>100000 then
   raise exception 'Old cost missing from the activity log'; end if;

 -- New dates move the start; the date available for use still wins.
 update public.assets set acquisition_date='2023-06-01' where id=a;
 if (select effective_date from public.accounting_events where asset_id=a)<>'2023-06-01' then raise exception 'Acquisition date correction ignored'; end if;
 update public.assets set available_for_use_date='2023-07-01' where id=a;
 if (select charge_from from public.accounting_events where asset_id=a)<>'2023-07-01' then raise exception 'Date available for use correction ignored'; end if;
 if (select count(*) from public.accounting_events where asset_id=a)<>1 then raise exception 'Recalculation left two records'; end if;

 -- The category stays locked.
 begin
  update public.assets set category_id=oe where id=a;
  raise exception 'Category change accepted';
 exception when raise_exception then if sqlerrm not like 'The category is locked%' then raise; end if; end;

 -- A later rate change is not slipped in by an edit.
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 perform public.set_accounting_rate(ff,10,'Rollback rate change');
 perform set_config('request.jwt.claim.sub',staff_id::text,true);
 update public.assets set value=200000 where id=a;
 if (select annual_charge from public.accounting_events where asset_id=a)<>40000 then raise exception 'Edit applied the new rate'; end if;

 -- Clearing the cost is saved as it would be on a new record: no depreciation.
 update public.assets set value=null, cost_known=false where id=a;
 if exists(select 1 from public.accounting_events where asset_id=a) then raise exception 'Unknown cost still depreciated'; end if;
 if public.asset_figures_locked(a) or public.asset_accounting_locked(a) then raise exception 'Nothing should be locked without a record'; end if;

 -- A cost above zero cannot be marked unknown after recognition either.
 insert into public.assets(name,category_id,org_unit_id,value,acquisition_date,barcode,qr_payload)
  values('ROLLBACK typed cost stays known',ff,u,5000,'2024-01-01','','') returning id into z;
 update public.assets set cost_known=false where id=z;
 if not (select cost_known from public.assets where id=z) or not exists(select 1 from public.accounting_events where asset_id=z) then
   raise exception 'A typed cost was marked unknown'; end if;

 -- After an administrator's correction the facts are locked again.
 insert into public.assets(name,category_id,org_unit_id,value,acquisition_date,barcode,qr_payload)
  values('ROLLBACK administrator adjusted',ff,u,1000,'2022-01-01','','') returning id into b;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 select * into prev from public.accounting_events where asset_id=b;
 dep:=prev.gross_amount-public.accounting_amount(prev,'2022-01-02');
 perform public.record_accounting_event(b,'2022-01-02','correction',ff,1000,1000,dep,0,0,4,'Receipt','Rollback correction');
 perform set_config('request.jwt.claim.sub',staff_id::text,true);
 if not public.asset_figures_locked(b) then raise exception 'Adjusted asset shown as open'; end if;
 begin
  update public.assets set value=2000 where id=b;
  raise exception 'Locked cost accepted';
 exception when raise_exception then if sqlerrm not like 'Accounting facts are locked%' then raise; end if; end;

 -- A closed year locks it too, and a correction cannot move into one.
 insert into public.assets(name,category_id,org_unit_id,value,acquisition_date,barcode,qr_payload)
  values('ROLLBACK closed year',ff,u,1000,'2021-03-01','','') returning id into c;
 insert into public.accounting_reports(period_end,snapshot) values('2020-12-31','{}');
 if public.asset_figures_locked(c) then raise exception 'Open year shown as locked'; end if;
 begin
  update public.assets set acquisition_date='2020-05-01' where id=c;
  raise exception 'Moved into a closed year';
 exception when raise_exception then if sqlerrm not like 'This change cannot be depreciated automatically%' then raise; end if; end;
 insert into public.accounting_reports(period_end,snapshot) values('2021-12-31','{}');
 if not public.asset_figures_locked(c) then raise exception 'Closed year shown as open'; end if;
 begin
  update public.assets set value=2000 where id=c;
  raise exception 'Closed-year cost accepted';
 exception when raise_exception then if sqlerrm not like 'Accounting facts are locked%' then raise; end if; end;

 -- Grants.
 if has_function_privilege('authenticated','public.asset_figures_recalculable(uuid)','execute') then raise exception 'Internal rule callable'; end if;
 if has_function_privilege('anon','public.asset_figures_locked(uuid)','execute') then raise exception 'Anonymous can read the lock'; end if;
end $$;
select 'cost and date correction assertions passed' as result;
rollback;
