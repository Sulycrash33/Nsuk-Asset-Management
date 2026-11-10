-- Every account adds a unit beneath a parent it picks, through add_org_unit
-- only, and a new unit never shares a short code with another unit under the
-- same top unit (which would mean a shared asset code). Rolls back.
begin;

do $$
begin
 if has_function_privilege('anon', 'public.add_org_unit(text,uuid,text)', 'execute') then
  raise exception 'anon can add units';
 end if;
 if has_function_privilege('public', 'public.add_org_unit(text,uuid,text)', 'execute') then
  raise exception 'public can add units';
 end if;
end $$;

select set_config('request.jwt.claim.sub',(select id::text from public.profiles where role='admin' limit 1),true);
set local role authenticated;
do $$
declare admin_id uuid:=auth.uid(); staff_id uuid; root public.org_units; child uuid;
 a public.org_units; b public.org_units; c public.org_units; aud public.org_units;
 asset_code text; affected integer; codes integer; issued integer;
begin
 select id into staff_id from public.profiles where id<>admin_id limit 1;
 select r.* into root from public.org_units r
  where r.parent_id is null and exists(select 1 from public.org_units x where x.parent_id=r.id) limit 1;
 select id into child from public.org_units where parent_id=root.id limit 1;

 -- A staff account with no units adds a unit under a top unit.
 perform public.assign_account_scope(staff_id,'staff','{}'::uuid[]);
 perform set_config('request.jwt.claim.sub',staff_id::text,true);
 a := public.add_org_unit('  Zzqtest   Store  ', root.id, 'Office');
 if a.name<>'Zzqtest Store' then raise exception 'Name not tidied: %', a.name; end if;
 if a.parent_id<>root.id or a.campus_id<>root.campus_id then raise exception 'Not placed under its parent'; end if;
 if a.unit_type<>'Office' then raise exception 'Type not kept'; end if;
 if a.short_code<>public.derive_short_code('Zzqtest Store') then raise exception 'Free derived code not used: %', a.short_code; end if;

 -- It is immediately usable for recording, and its code names the unit.
 insert into public.assets(name,org_unit_id,barcode,qr_payload) values('In a new unit',a.id,'','')
  returning barcode into asset_code;
 if asset_code not like 'NSU/'||root.short_code||'/'||a.short_code||'/%' then
  raise exception 'Unexpected code %', asset_code;
 end if;

 -- The same name under the same parent is refused; under another parent it is not,
 -- and there its derived code is taken in this tree, so it gets a different one.
 begin
  perform public.add_org_unit('zzqtest store', root.id, 'Office');
  raise exception 'Duplicate name accepted';
 exception when unique_violation then null; end;
 b := public.add_org_unit('Zzqtest Store', child, 'Department');
 if b.short_code=a.short_code then raise exception 'Clashing code issued: %', b.short_code; end if;
 if length(b.short_code)<>3 then raise exception 'Code not three characters: %', b.short_code; end if;
 -- A grandchild of the new unit, same name again: a third distinct code.
 c := public.add_org_unit('Zzqtest Store', b.id, 'Other');
 if c.short_code in (a.short_code,b.short_code) then raise exception 'Clash at depth: %', c.short_code; end if;

 -- Proved by issuing, not by reading: every unit under the top unit, one code each.
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 with recursive d as (select id from public.org_units where parent_id=root.id
  union all select o.id from public.org_units o join d on o.parent_id=d.id)
 -- Compared without the running number, which differs per unit and would hide a clash.
 select count(*), count(distinct regexp_replace(public.next_barcode(id),'/[0-9]+$','')) into issued, codes from d;
 if codes<>issued then raise exception 'Units under one top unit issue the same code (% of %)', codes, issued; end if;
 perform set_config('request.jwt.claim.sub',staff_id::text,true);

 -- Refusals with readable reasons.
 begin perform public.add_org_unit('   ', root.id); raise exception 'Blank name accepted';
 exception when invalid_parameter_value then null; end;
 begin perform public.add_org_unit('Orphan', null); raise exception 'Unit with no parent accepted';
 exception when invalid_parameter_value then null; end;
 begin perform public.add_org_unit('Orphan', gen_random_uuid()); raise exception 'Unknown parent accepted';
 exception when invalid_parameter_value then null; end;
 begin perform public.add_org_unit('New faculty', root.id, 'Faculty'); raise exception 'Faculty accepted beneath a unit';
 exception when invalid_parameter_value then null; end;

 -- The table stays administrator-only: no direct insert, rename or removal.
 begin
  insert into public.org_units(parent_id,campus_id,name) values(root.id,root.campus_id,'Direct');
  raise exception 'Staff inserted a unit directly';
 exception when insufficient_privilege then null; end;
 update public.org_units set name='Renamed', short_code='ZZZ' where id=a.id; get diagnostics affected=row_count;
 if affected<>0 then raise exception 'Staff renamed a unit'; end if;
 delete from public.org_units where id=a.id; get diagnostics affected=row_count;
 if affected<>0 then raise exception 'Staff removed a unit'; end if;

 -- An auditor adds too: the user chose every account.
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 perform public.assign_account_scope(staff_id,'auditor','{}'::uuid[]);
 perform set_config('request.jwt.claim.sub',staff_id::text,true);
 aud := public.add_org_unit('Zzqtest Auditor Room', root.id, 'Office');
 if aud.id is null then raise exception 'Auditor could not add a unit'; end if;

 -- An identity with no profile adds nothing.
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 begin perform public.add_org_unit('Ghost unit', root.id); raise exception 'No-profile identity added a unit';
 exception when insufficient_privilege then null; end;
end $$;
select 'add unit assertions passed' as result;
rollback;
