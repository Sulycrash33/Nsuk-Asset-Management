begin;
select set_config('request.jwt.claim.sub',(select id::text from public.profiles where role='admin' limit 1),true);
set local role authenticated;
do $$
declare u uuid; r jsonb; marker text := 'register-fixture-'||gen_random_uuid();
begin
 select id into u from public.org_units limit 1;
 insert into public.assets(name,org_unit_id,barcode,qr_payload,value,created_at)
 select marker,u,'fixture-'||gen_random_uuid(),'',10,'2026-10-12T23:59:59.999999Z'::timestamptz from generate_series(1,105);
 insert into public.assets(name,org_unit_id,barcode,qr_payload,value,created_at)
 values(marker,u,'fixture-'||gen_random_uuid(),'',20,'2026-10-13T00:00:00Z');
 r:=public.register_summary(array[u],null,null,'2026-10-12','2026-10-12',marker);
 if (r->>'total')::int<>105 or (r->>'total_value')::numeric<>1050 then raise exception 'Incomplete date totals: %',r; end if;
 r:=public.register_summary(array[u],null,null,null,null,marker);
 if (r->>'total')::int<>106 or (r->>'total_value')::numeric<>1070 then raise exception 'Incomplete full totals: %',r; end if;
 r:=public.register_summary('{}'::uuid[],null,null,null,null,marker);
 if (r->>'total')::int<>0 then raise exception 'Empty scope returned assets'; end if;
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 r:=public.register_summary(null,null,null,null,null,marker);
 if (r->>'total')::int<>0 then raise exception 'RLS leaked register totals'; end if;
 if has_function_privilege('anon','public.register_summary(uuid[],uuid,text,date,date,text)','execute') then raise exception 'Anonymous aggregate access'; end if;
end $$;
select 'register summary assertions passed' as result;
rollback;
