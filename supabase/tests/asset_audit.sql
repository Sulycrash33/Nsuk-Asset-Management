begin;
select set_config('request.jwt.claim.sub',(select id::text from public.profiles where role='admin' limit 1),true);
set local role authenticated;
do $$
declare a uuid; u uuid; other_u uuid; d jsonb; n bigint;
begin
 select id into u from public.org_units limit 1;
 select id into other_u from public.org_units where id<>u limit 1;
 insert into public.assets(name,org_unit_id,barcode,qr_payload,value,notes)
 values('Audit fixture',u,'fixture-'||gen_random_uuid(),'',10,'Old note') returning id into a;
 update public.assets set name='New name',value=20,notes=null where id=a;
 select changes into d from public.asset_logs where asset_id=a and action='edited';
 if d->'name'->>'before'<>'Audit fixture' or d->'name'->>'after'<>'New name'
   or (d->'value'->>'before')::numeric<>10 or (d->'value'->>'after')::numeric<>20
   or d->'notes'->'after'<>'null'::jsonb then raise exception 'Incorrect field history: %',d; end if;
 if d ? 'updated_at' or d ? 'org_unit_id' then raise exception 'Unchanged fields were logged'; end if;
 select count(*) into n from public.asset_logs where asset_id=a;
 update public.assets set name=name where id=a;
 if (select count(*) from public.asset_logs where asset_id=a)<>n then raise exception 'No-op created an edit'; end if;
 perform public.move_asset(a,other_u,'Test move');
 select changes into d from public.asset_logs where asset_id=a and action='moved';
 if d->'org_unit_id'->>'before'<>u::text or d->'org_unit_id'->>'after'<>other_u::text then raise exception 'Transfer values lost'; end if;
 delete from public.assets where id=a;
 select changes into d from public.asset_logs where asset_id=a and action='deleted';
 if d->'name'->>'before'<>'New name' or d->'name'->'after'<>'null'::jsonb then raise exception 'Deletion snapshot lost'; end if;
 if has_function_privilege('authenticated','public.assets_audit()','execute') then raise exception 'Direct trigger invocation permitted'; end if;
end $$;
select 'asset audit assertions passed' as result;
rollback;
