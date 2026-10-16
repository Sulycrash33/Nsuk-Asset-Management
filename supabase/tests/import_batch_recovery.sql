-- Simulate a failed second batch, then replay the whole file. Always rolls back.
begin;
select set_config('request.jwt.claim.sub',(select id::text from public.profiles where role='admin' limit 1),true);
set local role authenticated;
do $$
declare
  u uuid; prefix text:=gen_random_uuid()::text; first_batch jsonb; last_batch jsonb;
  before_count integer; confirmed integer;
begin
  select id into u from public.org_units limit 1;
  select count(*) into before_count from public.assets;
  select jsonb_agg(jsonb_build_object('import_key',repeat(md5(prefix||n),2),
    'name','Batch recovery '||n,'org_unit_id',u,'serial_number',prefix||'-'||n,
    'condition','Working','value',0,'cost_known',false)) into first_batch
    from generate_series(1,50) n;
  last_batch:=jsonb_build_array(jsonb_build_object('import_key',repeat(md5(prefix||51),2),
    'name','Batch recovery 51','org_unit_id',u,'serial_number',prefix||'-51',
    'condition','Working','value',0,'cost_known',false));
  perform public.import_asset_rows(first_batch);
  begin
    perform public.import_asset_rows(jsonb_set(last_batch,'{0,value}','-1'));
    raise exception 'Invalid second batch accepted';
  exception when check_violation then null;
  end;
  if (select count(*) from public.assets)<>before_count+50 then
    raise exception 'Second batch failure changed earlier confirmed rows';
  end if;
  select count(*) into confirmed from public.import_asset_rows(first_batch);
  if confirmed<>50 then raise exception 'Earlier rows were not confirmed on retry'; end if;
  perform public.import_asset_rows(last_batch);
  -- Simulate losing the successful reply too: replay both batches once more.
  perform public.import_asset_rows(first_batch);
  perform public.import_asset_rows(last_batch);
  if (select count(*) from public.assets)<>before_count+51 then
    raise exception 'File replay duplicated or lost rows';
  end if;
end $$;
select 'Failed second batch preserves fifty rows; full retries confirm exactly fifty-one assets' as result;
rollback;

