alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check check(role in('admin','staff','auditor'));
create function public.can_write_assets() returns boolean language sql stable security definer set search_path=public as $$
select auth.uid() is not null and exists(select 1 from public.profiles where id=auth.uid() and role in('admin','staff'));
$$;
revoke all on function public.can_write_assets() from public,anon;
grant execute on function public.can_write_assets() to authenticated;
alter policy assets_insert on public.assets with check(public.can_write_assets() and (public.is_admin() or org_unit_id in(select public.my_unit_ids())));
alter policy assets_update on public.assets using(public.can_write_assets() and (public.is_admin() or org_unit_id in(select public.my_unit_ids())))
with check(public.can_write_assets() and (public.is_admin() or org_unit_id in(select public.my_unit_ids())));
alter policy "asset photos authenticated write" on storage.objects with check(bucket_id='asset-photos' and public.can_write_assets() and (public.is_admin() or owner_id=auth.uid()::text));
drop policy verification_sessions_rw on public.verification_sessions;
create policy verification_sessions_read on public.verification_sessions for select to authenticated using(public.is_admin() or org_unit_id in(select public.my_unit_ids()));
create policy verification_sessions_insert on public.verification_sessions for insert to authenticated with check(public.can_write_assets() and (public.is_admin() or org_unit_id in(select public.my_unit_ids())));
create policy verification_sessions_update on public.verification_sessions for update to authenticated using(public.can_write_assets() and (public.is_admin() or org_unit_id in(select public.my_unit_ids()))) with check(public.can_write_assets() and (public.is_admin() or org_unit_id in(select public.my_unit_ids())));
create policy verification_sessions_delete on public.verification_sessions for delete to authenticated using(public.is_admin());
drop policy verification_scans_rw on public.verification_scans;
create policy verification_scans_read on public.verification_scans for select to authenticated using(exists(select 1 from public.verification_sessions s where s.id=session_id));
create policy verification_scans_insert on public.verification_scans for insert to authenticated with check(public.can_write_assets() and exists(select 1 from public.verification_sessions s where s.id=session_id));
create policy verification_scans_update on public.verification_scans for update to authenticated using(public.can_write_assets() and exists(select 1 from public.verification_sessions s where s.id=session_id)) with check(public.can_write_assets() and exists(select 1 from public.verification_sessions s where s.id=session_id));
create policy verification_scans_delete on public.verification_scans for delete to authenticated using(public.can_write_assets() and exists(select 1 from public.verification_sessions s where s.id=session_id));

CREATE OR REPLACE FUNCTION public.finish_verification(p_session_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare s public.verification_sessions%rowtype;
begin
  if not public.can_write_assets() then raise exception 'This account has read-only access.' using errcode='insufficient_privilege'; end if;
  select * into s from public.verification_sessions where id=p_session_id for update;
  if not found then raise exception 'No such verification.' using errcode='check_violation'; end if;
  if auth.uid() is null or not public.can_access_unit(s.org_unit_id) then
    raise exception 'You do not have access to that unit.' using errcode='insufficient_privilege';
  end if;
  if s.closed_at is null then
    update public.verification_sessions set closed_at=now() where id=s.id returning * into s;
  end if;
  return s.result_snapshot::json;
end $function$
;

CREATE OR REPLACE FUNCTION public.import_asset_rows(p_rows jsonb)
 RETURNS SETOF assets
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare r jsonb; existing public.assets%rowtype; v_count integer;
begin
  if not public.can_write_assets() then raise exception 'This account has read-only access.' using errcode='insufficient_privilege'; end if;
  if auth.uid() is null then raise exception 'Sign in before importing.' using errcode='insufficient_privilege'; end if;
  if p_rows is null or jsonb_typeof(p_rows)<>'array' then
    raise exception 'Send an array of import rows.' using errcode='check_violation';
  end if;
  if jsonb_array_length(p_rows) not between 1 and 50 then
    raise exception 'Send between 1 and 50 rows per import batch.' using errcode='check_violation';
  end if;
  if exists(select 1 from jsonb_array_elements(p_rows) x
    where coalesce(x->>'import_key','') !~ '^[a-f0-9]{64}$') then
    raise exception 'Each row needs a valid import reference.' using errcode='check_violation';
  end if;
  if (select count(distinct x->>'import_key') from jsonb_array_elements(p_rows) x)<>jsonb_array_length(p_rows) then
    raise exception 'An import batch contains repeated row references.' using errcode='check_violation';
  end if;
  insert into public.assets(import_key,name,category_id,org_unit_id,location,condition,value,serial_number,acquisition_date,notes,barcode,qr_payload)
  select r.import_key,r.name,r.category_id,r.org_unit_id,r.location,coalesce(r.condition,'Working'),coalesce(r.value,0),
    r.serial_number,r.acquisition_date,r.notes,'',''
  from jsonb_to_recordset(p_rows) as r(import_key text,name text,category_id uuid,org_unit_id uuid,
    location text,condition text,value numeric,serial_number text,acquisition_date date,notes text)
  where not exists(select 1 from public.assets a where a.import_key=r.import_key)
  on conflict(import_key) do nothing;

  -- A changed mapping must not silently overwrite already recorded rows.
  for r in select value from jsonb_array_elements(p_rows) loop
    select * into existing from public.assets where import_key=r->>'import_key';
    if not found then raise exception 'An import reference is already recorded outside your access.' using errcode='insufficient_privilege'; end if;
    if row(existing.name,existing.category_id,existing.org_unit_id,existing.location,existing.condition,
      existing.value,existing.serial_number,existing.acquisition_date,existing.notes) is distinct from
      row(r->>'name',(r->>'category_id')::uuid,(r->>'org_unit_id')::uuid,r->>'location',coalesce(r->>'condition','Working'),
        coalesce((r->>'value')::numeric,0),r->>'serial_number',(r->>'acquisition_date')::date,r->>'notes') then
      raise exception 'A previously imported row has different values. Edit its asset record instead of re-importing it.' using errcode='check_violation';
    end if;
  end loop;
  select count(*) into v_count from public.assets a where a.import_key in(select x->>'import_key' from jsonb_array_elements(p_rows) x);
  if v_count<>jsonb_array_length(p_rows) then raise exception 'Not every row was confirmed.' using errcode='check_violation'; end if;
  return query select a.* from jsonb_array_elements(p_rows) with ordinality x(value,n)
    join public.assets a on a.import_key=x.value->>'import_key' order by x.n;
end $function$
;

CREATE OR REPLACE FUNCTION public.move_asset(p_asset_id uuid, p_to_unit_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if not public.can_write_assets() then raise exception 'This account has read-only access.' using errcode='insufficient_privilege'; end if;
  perform set_config('app.move_reason', coalesce(p_reason, ''), true);
  update public.assets set org_unit_id = p_to_unit_id where id = p_asset_id;
  perform set_config('app.move_reason', '', true);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.provision_account(p_user_id uuid, p_name text, p_email text, p_role text, p_campus_id uuid, p_unit_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare units uuid[]:=coalesce(p_unit_ids,'{}'::uuid[]);
begin
  if not public.is_admin() then raise exception 'Administrators only.' using errcode='insufficient_privilege'; end if;
  if p_role not in('admin','staff','auditor') or p_role is null or p_name is null or btrim(p_name)='' then
    raise exception 'Provide a name and a valid role.' using errcode='check_violation'; end if;
  -- Creation requires units in the API validator. Administrators may still
  -- deliberately remove all assignments from an existing staff account.
  if p_campus_id is not null and not exists(select 1 from public.campuses where id=p_campus_id) then
    raise exception 'That campus no longer exists.' using errcode='check_violation'; end if;
  if exists(select 1 from unnest(units) u where u is null or not exists(select 1 from public.org_units where id=u)) then
    raise exception 'An assigned unit no longer exists.' using errcode='check_violation'; end if;
  insert into public.profiles(id,name,email,role,campus_id)
    values(p_user_id,btrim(p_name),lower(btrim(p_email)),p_role,case when p_role='admin' then null else p_campus_id end)
    on conflict(id) do update set name=excluded.name,email=excluded.email,role=excluded.role,campus_id=excluded.campus_id;
  delete from public.user_units where user_id=p_user_id;
  if p_role in('staff','auditor') then
    insert into public.user_units(user_id,org_unit_id) select p_user_id,u from (select distinct unnest(units) u) x;
  end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.record_verification_scan(p_session_id uuid, p_barcode text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare s public.verification_sessions%rowtype; a public.assets%rowtype;
        v_inserted uuid; v_outcome text;
begin
  if not public.can_write_assets() then raise exception 'This account has read-only access.' using errcode='insufficient_privilege'; end if;
  select * into s from public.verification_sessions where id=p_session_id for update;
  if not found or s.closed_at is not null then
    raise exception 'That verification is not open.' using errcode='check_violation';
  end if;
  if auth.uid() is null or not public.can_access_unit(s.org_unit_id) then
    raise exception 'You do not have access to that unit.' using errcode='insufficient_privilege';
  end if;
  if p_barcode is null or btrim(p_barcode)='' then
    raise exception 'A scanned code is required.' using errcode='check_violation';
  end if;
  select * into a from public.assets where barcode=p_barcode or qr_payload=p_barcode limit 1;
  if a.id is null then v_outcome:='unknown';
  elsif a.org_unit_id=s.org_unit_id then v_outcome:='expected';
  else v_outcome:='elsewhere'; end if;
  insert into public.verification_scans(session_id,asset_id,barcode)
  values(s.id,a.id,p_barcode) on conflict(session_id,barcode) do nothing returning id into v_inserted;
  return json_build_object('outcome',case when v_inserted is null then 'repeat' else v_outcome end,
    'asset_id',a.id,'asset_name',a.name,'barcode',p_barcode);
end $function$
;
