-- Privileged test connection; requires an administrator and two existing units.
-- Fixture assets, scans and exercises are all rolled back.
begin;
select set_config('request.jwt.claim.sub',
  (select id::text from public.profiles where role='admin' limit 1), true);
do $$
declare u uuid; other_u uuid; sid uuid; legacy uuid; found_asset uuid;
  missing_asset uuid; stray uuid; found_code text; stray_code text;
  report jsonb; admin_id text:=auth.uid()::text;
begin
  if not public.is_admin() then raise exception 'An administrator fixture is required'; end if;
  select id into u from public.org_units limit 1;
  select id into other_u from public.org_units where id<>u limit 1;
  if other_u is null then raise exception 'Two units are required'; end if;
  insert into public.assets(name,org_unit_id,barcode,qr_payload)
  values('Verification fixture found',u,'fixture-'||gen_random_uuid(),'')
  returning id,barcode into found_asset,found_code;
  insert into public.assets(name,org_unit_id,barcode,qr_payload)
  values('Verification fixture missing',u,'fixture-'||gen_random_uuid(),'') returning id into missing_asset;
  insert into public.assets(name,org_unit_id,barcode,qr_payload)
  values('Verification fixture stray',other_u,'fixture-'||gen_random_uuid(),'')
  returning id,barcode into stray,stray_code;
  insert into public.verification_sessions(org_unit_id) values(u) returning id into sid;
  if public.record_verification_scan(sid,found_code)->>'outcome'<>'expected' then raise exception 'Expected scan failed'; end if;
  if public.record_verification_scan(sid,found_code)->>'outcome'<>'repeat' then raise exception 'Repeat scan failed'; end if;
  if public.record_verification_scan(sid,stray_code)->>'outcome'<>'elsewhere' then raise exception 'Elsewhere scan failed'; end if;
  perform public.record_verification_scan(sid,'unknown-fixture-'||gen_random_uuid());
  report:=public.finish_verification(sid)::jsonb;
  if (report->>'expected_total')::integer<>2 or (report->>'seen_total')::integer<>1 or
    jsonb_array_length(report->'unknown')<>1 or jsonb_array_length(report->'elsewhere')<>1 then
    raise exception 'Incorrect final counts: %',report;
  end if;
  if not exists(select 1 from public.verification_sessions where id=sid and closed_at is not null
    and result_snapshot=report) then raise exception 'Result and closure were not saved together'; end if;
  update public.assets set name='Changed after audit',org_unit_id=other_u where id=found_asset;
  delete from public.assets where id in(missing_asset,stray,found_asset);
  if public.verification_result(sid)::jsonb<>report then raise exception 'Historical result changed'; end if;
  if public.finish_verification(sid)::jsonb<>report then raise exception 'Finish retry changed result'; end if;
  begin
    perform public.record_verification_scan(sid,'late');
    raise exception 'Accepted late scan';
  exception when check_violation then null; end;
  begin
    insert into public.verification_scans(session_id,barcode) values(sid,'late-direct');
    raise exception 'Accepted direct late scan';
  exception when check_violation then null; end;
  begin
    update public.verification_sessions set closed_at=null where id=sid;
    raise exception 'Reopened finished exercise';
  exception when check_violation then null; end;
  begin
    update public.verification_sessions set result_snapshot='{}'::jsonb where id=sid;
    raise exception 'Allowed report tampering';
  exception when check_violation then null; end;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  begin
    perform public.finish_verification(sid);
    raise exception 'Unauthorized finish succeeded';
  exception when insufficient_privilege then null; end;
  begin
    perform public.verification_result(sid);
    raise exception 'Unauthorized report read succeeded';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',admin_id,true);
  insert into public.verification_sessions(org_unit_id) values(u) returning id into legacy;
  update public.verification_sessions set closed_at=now() where id=legacy;
  if not exists(select 1 from public.verification_sessions where id=legacy and result_snapshot is not null) then
    raise exception 'Legacy client closure did not save a result'; end if;
  if has_function_privilege('anon','public.finish_verification(uuid)','execute') or
     has_function_privilege('authenticated','public.verification_live_result(uuid)','execute') then
    raise exception 'Unsafe function grants'; end if;
end $$;
select 'verification regression assertions passed' as result;
rollback;
