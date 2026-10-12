begin;
select set_config('request.jwt.claim.sub',(select id::text from public.profiles where role='admin' limit 1),true);
set local role authenticated;
do $$
declare admin_id uuid:=auth.uid(); staff_id uuid; u uuid; other_u uuid; a uuid; b uuid; foreign_asset uuid; n integer;
begin
 select id into staff_id from public.profiles where id<>admin_id limit 1;
 select x.id into u from public.org_units x where not exists(select 1 from public.org_units c where c.parent_id=x.id) limit 1;
 select id into other_u from public.org_units where id<>u limit 1;
 perform public.assign_account_scope(staff_id,'staff',array[u]);
 insert into public.assets(name,org_unit_id,barcode,qr_payload) values('Bulk fixture A',u,'fixture-'||gen_random_uuid(),'') returning id into a;
 insert into public.assets(name,org_unit_id,barcode,qr_payload) values('Bulk fixture B',u,'fixture-'||gen_random_uuid(),'') returning id into b;
 insert into public.assets(name,org_unit_id,barcode,qr_payload) values('Foreign fixture',other_u,'fixture-'||gen_random_uuid(),'') returning id into foreign_asset;
 perform set_config('request.jwt.claim.sub',staff_id::text,true);
 n:=public.bulk_update_assets(array[a,b],'Missing',null,null);
 if n<>2 or (select count(*) from public.assets where id in(a,b) and condition='Missing')<>2 then raise exception 'Bulk condition failed'; end if;
 begin
  perform public.bulk_update_assets(array[a,foreign_asset],'Faulty',null,null);
  raise exception 'Out-of-scope batch accepted';
 exception when insufficient_privilege then null; end;
 if (select condition from public.assets where id=a)<>'Missing' then raise exception 'Partial unauthorized batch write'; end if;
 begin
  perform public.bulk_update_assets(array[a,b],null,other_u,'Unauthorized transfer');
  raise exception 'Out-of-scope transfer accepted';
 exception when insufficient_privilege then null; end;
 if (select count(*) from public.assets where id in(a,b) and org_unit_id=u)<>2 then raise exception 'Transfer partially applied'; end if;
 begin
  perform public.bulk_update_assets(array[a],'Invalid',null,null);
  raise exception 'Invalid condition accepted';
 exception when check_violation then null; end;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 n:=public.bulk_update_assets(array[a,b],null,other_u,'Bulk fixture transfer');
 if n<>2 or (select count(*) from public.asset_logs where asset_id in(a,b) and action='moved' and note='Bulk fixture transfer')<>2 then raise exception 'Move history missing'; end if;
 if has_function_privilege('anon','public.bulk_update_assets(uuid[],text,uuid,text)','execute') then raise exception 'Anonymous bulk access'; end if;
end $$;
select 'bulk asset assertions passed' as result;
rollback;
