-- Synthetic fixtures and policy changes always roll back.
begin;
do $$
declare
  admin_id uuid; unit_id uuid; class_id uuid; a uuid; b uuid;
  previous public.accounting_events; latest public.accounting_events;
  before_count integer; dep numeric; entries jsonb;
begin
  select id into admin_id from public.profiles where role='admin' limit 1;
  select id into unit_id from public.org_units limit 1;
  select id into class_id from public.asset_categories where name='Office Equipment' and active;
  if exists(select 1 from public.assets where category_id=class_id) then
    raise exception 'Fixture requires an unused Office Equipment class';
  end if;
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  insert into public.assets(name,category_id,org_unit_id,value,cost_known,available_for_use_date,acquisition_date,barcode,qr_payload)
  values('ROLLBACK adjustment A',class_id,unit_id,1000,true,'2020-01-01','2020-01-01','','') returning id into a;
  insert into public.assets(name,category_id,org_unit_id,value,cost_known,available_for_use_date,acquisition_date,barcode,qr_payload)
  values('ROLLBACK adjustment B',class_id,unit_id,2000,true,'2020-01-01','2020-01-01','','') returning id into b;
  select count(*) into before_count from public.accounting_events;
  -- The first valid row must not survive when the second row is invalid.
  entries:=jsonb_build_array(
    jsonb_build_object('asset_id',a,'amount',800,'residual',0,'years',5,'basis','fair_value'),
    jsonb_build_object('asset_id',b,'amount',-1,'residual',0,'years',5,'basis','fair_value'));
  begin
    perform public.revalue_accounting_class(class_id,'2022-01-01',entries,'Test valuer','Test evidence','Rollback atomicity');
    raise exception 'Invalid class revaluation accepted';
  exception when check_violation then null;
  end;
  if (select count(*) from public.accounting_events)<>before_count
    or (select measurement_model from public.asset_categories where id=class_id)<>'cost' then
    raise exception 'Failed revaluation left partial history or policy changes';
  end if;
  entries:=jsonb_build_array(
    jsonb_build_object('asset_id',a,'amount',800,'residual',0,'years',5,'basis','fair_value'),
    jsonb_build_object('asset_id',b,'amount',1600,'residual',0,'years',5,'basis','current_operational'));
  perform public.revalue_accounting_class(class_id,'2022-01-01',entries,'Test valuer','Test evidence','Rollback complete class');
  select * into previous from public.accounting_events where asset_id=a order by effective_date desc limit 1;
  dep:=previous.gross_amount-previous.impairment_open-public.accounting_amount(previous,'2022-01-02');
  perform public.record_accounting_event(a,'2022-01-02','correction',class_id,1000,800,dep,0,0,5,'Correction evidence','Rollback correction');
  select * into latest from public.accounting_events where asset_id=a order by effective_date desc limit 1;
  if latest.valuation_basis<>'fair_value' or latest.model<>'current_value' then
    raise exception 'Correction lost fair-value basis';
  end if;
  select * into previous from public.accounting_events where asset_id=b order by effective_date desc limit 1;
  dep:=previous.gross_amount-previous.impairment_open-public.accounting_amount(previous,'2022-01-02');
  perform public.record_accounting_event(b,'2022-01-02','impairment',class_id,2000,1600,dep,100,0,5,'Impairment evidence','Rollback impairment');
  select * into latest from public.accounting_events where asset_id=b order by effective_date desc limit 1;
  if latest.valuation_basis<>'current_operational' or latest.model<>'current_value' then
    raise exception 'Impairment lost current operational basis';
  end if;
end $$;
select 'Atomic revaluation and preserved adjustment bases passed' as result;
rollback;

