-- An administrator gives a moved asset a new code; the old code still finds
-- it, in the scanner and in a stock count. Everyone else is refused. Rolls back.
begin;
do $$
declare admin_id uuid; other_admin uuid; u_from uuid; u_to uuid; c uuid;
 a uuid; old_code text; new_code text; r record; s uuid; j json; n integer;
begin
 select id into admin_id from public.profiles where role='admin' order by id limit 1;
 select id into other_admin from public.profiles where role='admin' and id<>admin_id order by id limit 1;
 -- Two leaf units with different codes.
 select x.id into u_from from public.org_units x where not exists(select 1 from public.org_units k where k.parent_id=x.id) order by x.id limit 1;
 select x.id into u_to from public.org_units x where not exists(select 1 from public.org_units k where k.parent_id=x.id)
   and x.id<>u_from and x.short_code is distinct from (select short_code from public.org_units where id=u_from) order by x.id limit 1;
 select id into c from public.asset_categories where active order by name limit 1;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);

 insert into public.assets(name,org_unit_id,category_id,barcode,qr_payload) values('ROLLBACK reissue',u_from,c,'','')
   returning id,barcode into a,old_code;

 -- Nothing to correct yet: refused, and no running number is spent.
 select asset_seq into n from public.org_units where id=u_from;
 begin
   perform public.reissue_asset_code(a);
   raise exception 'Re-issued a code that already matched';
 exception when check_violation then null; end;
 if (select asset_seq from public.org_units where id=u_from)<>n then raise exception 'A refused re-issue spent a number'; end if;

 -- Corrected unit: a new code from the new unit, the old one kept.
 update public.assets set org_unit_id=u_to where id=a;
 if (select barcode from public.assets where id=a)<>old_code then raise exception 'A unit change altered the code by itself'; end if;
 new_code:=public.reissue_asset_code(a);
 if new_code=old_code or new_code is null then raise exception 'No new code'; end if;
 if (select barcode from public.assets where id=a)<>new_code or (select qr_payload from public.assets where id=a)<>new_code then
   raise exception 'Asset does not carry the new code'; end if;
 if not exists(select 1 from public.asset_code_history where code=old_code and asset_id=a and replaced_by=admin_id) then
   raise exception 'Old code not kept'; end if;
 if not exists(select 1 from public.asset_logs where asset_id=a and action='edited'
     and changes->'barcode'->>'before'=old_code and changes->'barcode'->>'after'=new_code) then
   raise exception 'Field history missed the code change'; end if;

 -- Both codes find the asset; only the old one is flagged as old.
 select * into r from public.asset_for_code(old_code);
 if r.id is distinct from a or not r.scanned_old_code or r.barcode<>new_code then raise exception 'Old code lookup failed: %',to_jsonb(r); end if;
 select * into r from public.asset_for_code(new_code);
 if r.id is distinct from a or r.scanned_old_code then raise exception 'New code lookup failed'; end if;
 if exists(select 1 from public.asset_for_code('NSU/NOT/A/CODE/999')) then raise exception 'Unknown code matched'; end if;

 -- A stock count of the new unit counts an old sticker as that asset.
 insert into public.verification_sessions(org_unit_id) values(u_to) returning id into s;
 j:=public.record_verification_scan(s,old_code);
 if j->>'outcome'<>'expected' or (j->>'asset_id')::uuid<>a then raise exception 'Stock count missed the old sticker: %',j; end if;

 -- Not an administrator: refused.
 update public.profiles set role='staff' where id=other_admin;
 perform set_config('request.jwt.claim.sub',other_admin::text,true);
 begin
   perform public.reissue_asset_code(a);
   raise exception 'Staff re-issued a code';
 exception when insufficient_privilege then null; end;

 if has_function_privilege('anon','public.reissue_asset_code(uuid)','execute')
   or has_function_privilege('anon','public.asset_for_code(text)','execute')
   or has_table_privilege('authenticated','public.asset_code_history','INSERT')
   or has_table_privilege('authenticated','public.asset_code_history','UPDATE')
   or has_table_privilege('authenticated','public.asset_code_history','DELETE') then
   raise exception 'Grants too wide'; end if;

 -- Deleting the asset takes its old codes with it.
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 delete from public.verification_sessions where id=s;
 delete from public.assets where id=a;
 if exists(select 1 from public.asset_code_history where asset_id=a) then raise exception 'Old codes outlived the asset'; end if;
end $$;
select 'reissue asset code assertions passed' as result;
rollback;
