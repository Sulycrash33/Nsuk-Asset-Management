-- Comment-only change: units are optional when an account is created, so the
-- note that the API requires them is no longer true. Body otherwise unchanged;
-- create or replace keeps the existing grants.
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
  -- Units are optional, at creation and afterwards. An account with none can
  -- read and record nothing until an administrator assigns a unit.
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
end $function$;
