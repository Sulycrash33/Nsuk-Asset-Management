-- No fixture, financial event or policy change survives this test.
begin;
do $$
declare
  admin_id uuid; unit_id uuid; class_id uuid; a uuid; event_id uuid;
  before_count integer; entries jsonb; invalid_amount text;
begin
  select id into admin_id from public.profiles where role='admin' limit 1;
  select id into unit_id from public.org_units limit 1;
  select id into class_id from public.asset_categories where name='Office Equipment' and active;
  if exists(select 1 from public.assets where category_id=class_id) then
    raise exception 'Fixture requires an unused Office Equipment class';
  end if;
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  insert into public.assets(name,category_id,org_unit_id,value,cost_known,acquisition_date,barcode,qr_payload)
  values('ROLLBACK finite amounts',class_id,unit_id,0,false,'2020-01-01','','') returning id into a;
  select count(*) into before_count from public.accounting_events;
  -- A normal finite opening with a zero residual remains valid.
  foreach invalid_amount in array array['NaN','Infinity','-Infinity'] loop
    begin
      perform public.record_accounting_event(a,'2020-01-02','opening',class_id,
        invalid_amount::numeric,invalid_amount::numeric,0,0,0,5,'Test evidence','Reject invalid cost');
      raise exception 'Non-finite opening accepted: %',invalid_amount;
    exception when check_violation or numeric_value_out_of_range then null;
    end;
  end loop;
  -- Invalid accumulated depreciation/impairment must also be refused.
  begin
    perform public.record_accounting_event(a,'2020-01-02','opening',class_id,
      100,100,'NaN',0,0,5,'Test evidence','Reject invalid depreciation');
    raise exception 'Non-finite depreciation accepted';
  exception when check_violation then null;
  end;
  begin
    perform public.record_accounting_event(a,'2020-01-02','opening',class_id,
      100,100,0,'NaN',0,5,'Test evidence','Reject invalid impairment');
    raise exception 'Non-finite impairment accepted';
  exception when check_violation then null;
  end;
  if (select count(*) from public.accounting_events)<>before_count then
    raise exception 'Invalid opening left financial history';
  end if;
  event_id:=public.record_accounting_event(a,'2020-01-02','opening',class_id,
    100,100,0,0,0,5,'Test evidence','Finite opening');
  if event_id is null then raise exception 'Finite opening failed'; end if;
  entries:=jsonb_build_array(jsonb_build_object('asset_id',a,'amount','NaN','residual',0,'years',5,'basis','fair_value'));
  begin
    perform public.revalue_accounting_class(class_id,'2020-01-03',entries,'Test valuer','Test evidence','Reject invalid revaluation');
    raise exception 'Non-finite revaluation accepted';
  exception when check_violation then null;
  end;
  if (select count(*) from public.accounting_events)<>before_count+1
    or (select measurement_model from public.asset_categories where id=class_id)<>'cost' then
    raise exception 'Invalid revaluation left history or policy changes';
  end if;
end $$;
select 'Finite opening accepted; non-finite opening, depreciation, impairment and revaluation rejected' as result;
rollback;

