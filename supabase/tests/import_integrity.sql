-- Privileged connection, existing administrator/unit; all fixture work rolls back.
begin;
select set_config('request.jwt.claim.sub',
  (select id::text from public.profiles where role='admin' limit 1), true);
set local role authenticated;
do $$
declare u uuid; c uuid; rows jsonb; first_id uuid; retry_id uuid; k text:=repeat(md5(gen_random_uuid()::text),2);
  row_count integer; before_count integer; before_events integer;
begin
  if not public.is_admin() then raise exception 'Administrator fixture required'; end if;
  select id into u from public.org_units limit 1;
  select id into c from public.asset_categories where name='Office Equipment' and active;
  select count(*) into before_count from public.assets;
  select count(*) into before_events from public.accounting_events;
  rows:=jsonb_build_array(jsonb_build_object('import_key',k,'name','Import fixture',
    'org_unit_id',u,'category_id',c,'serial_number','QA-IMPORT-'||k,
    'condition','Working','value',50,'cost_known',true,
    'acquisition_date','2019-08-02','available_for_use_date','2019-08-02'));
  select id into first_id from public.import_asset_rows(rows);
  select id into retry_id from public.import_asset_rows(rows);
  if first_id is null or first_id<>retry_id then raise exception 'Retry did not reuse the asset'; end if;
  select count(*) into row_count from public.assets;
  if row_count<>before_count+1 then raise exception 'Retry duplicated the asset'; end if;
  if (select count(*) from public.accounting_events)<>before_events+1 then
    raise exception 'Retry duplicated or failed to create automatic acquisition history';
  end if;
  begin
    perform public.import_asset_rows(jsonb_set(rows,'{0,value}','60'));
    raise exception 'Changed retry silently altered data';
  exception when check_violation then null; end;
  begin
    perform public.import_asset_rows(null);
    raise exception 'Accepted null import';
  exception when check_violation then null; end;
  begin
    perform public.import_asset_rows(rows||rows);
    raise exception 'Accepted repeated row references';
  exception when check_violation then null; end;
  begin
    insert into public.assets(name,org_unit_id,value,barcode,qr_payload)
    values('Negative fixture',u,-1,'','');
    raise exception 'Accepted negative value';
  exception when check_violation then null; end;
  begin
    insert into public.assets(name,org_unit_id,value,barcode,qr_payload)
    values('NaN fixture',u,'NaN'::numeric,'','');
    raise exception 'Accepted NaN value';
  exception when check_violation then null; end;
  begin
    insert into public.assets(name,org_unit_id,barcode,qr_payload) values('   ',u,'','');
    raise exception 'Accepted empty name';
  exception when check_violation then null; end;
  begin
    update public.assets set import_key=null where id=first_id;
    raise exception 'Allowed import reference to change';
  exception when check_violation then null; end;
  if has_function_privilege('anon','public.import_asset_rows(jsonb)','execute') then
    raise exception 'Anonymous import executable'; end if;
end $$;
select 'import integrity assertions passed' as result;
rollback;

