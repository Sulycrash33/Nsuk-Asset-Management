create function public.provision_account(p_user_id uuid,p_name text,p_email text,p_role text,
  p_campus_id uuid,p_unit_ids uuid[])
returns void language plpgsql security invoker set search_path=public
as $$
declare units uuid[]:=coalesce(p_unit_ids,'{}'::uuid[]);
begin
  if not public.is_admin() then raise exception 'Administrators only.' using errcode='insufficient_privilege'; end if;
  if p_role not in('admin','staff') or p_role is null or p_name is null or btrim(p_name)='' then
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
  if p_role='staff' then
    insert into public.user_units(user_id,org_unit_id) select p_user_id,u from (select distinct unnest(units) u) x;
  end if;
end $$;
revoke all on function public.provision_account(uuid,text,text,text,uuid,uuid[]) from public,anon;
grant execute on function public.provision_account(uuid,text,text,text,uuid,uuid[]) to authenticated;

create function public.assign_account_scope(p_user_id uuid,p_role text,p_unit_ids uuid[])
returns void language plpgsql security invoker set search_path=public
as $$
declare p public.profiles%rowtype;
begin
  if not public.is_admin() then raise exception 'Administrators only.' using errcode='insufficient_privilege'; end if;
  select * into p from public.profiles where id=p_user_id for update;
  if not found then raise exception 'That account no longer exists.' using errcode='check_violation'; end if;
  perform public.provision_account(p.id,p.name,p.email,p_role,p.campus_id,p_unit_ids);
end $$;
revoke all on function public.assign_account_scope(uuid,text,uuid[]) from public,anon;
grant execute on function public.assign_account_scope(uuid,text,uuid[]) to authenticated;
