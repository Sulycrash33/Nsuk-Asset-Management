-- Existing two-admin fixtures only. All profile/assignment changes roll back;
-- no Auth users or invitation emails are created by this test.
begin;
select set_config('request.jwt.claim.sub',
  (select id::text from public.profiles where role='admin' limit 1),true);
set local role authenticated;
do $$
declare target uuid; u uuid; initial jsonb; current_profile jsonb; caller text:=auth.uid()::text;
begin
  select id into target from public.profiles where role='admin' and id<>auth.uid() limit 1;
  if target is null then raise exception 'Two administrator fixtures are required'; end if;
  select id into u from public.org_units limit 1;
  select to_jsonb(p) into initial from public.profiles p where id=target;
  perform public.assign_account_scope(target,'staff',array[u,u]);
  if (select role from public.profiles where id=target)<>'staff' or
     (select count(*) from public.user_units where user_id=target)<>1 then
    raise exception 'Role and deduplicated assignments were not saved'; end if;
  select to_jsonb(p) into current_profile from public.profiles p where id=target;
  begin
    perform public.provision_account(target,'Must not persist','nochange@example.invalid','admin',null,array[gen_random_uuid()]);
    raise exception 'Accepted nonexistent unit';
  exception when check_violation then null; end;
  if (select to_jsonb(p) from public.profiles p where id=target)<>current_profile or
     (select count(*) from public.user_units where user_id=target)<>1 then
    raise exception 'Failed setup partially changed profile or assignments'; end if;
  perform set_config('request.jwt.claim.sub',target::text,true);
  begin
    perform public.assign_account_scope(target,'admin',array[u]);
    raise exception 'Staff promoted themselves';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',caller,true);
  perform public.assign_account_scope(target,'admin','{}');
  if (select role from public.profiles where id=target)<>'admin' or
    exists(select 1 from public.user_units where user_id=target) then raise exception 'Promotion did not clear assignments'; end if;
  if has_function_privilege('anon','public.provision_account(uuid,text,text,text,uuid,uuid[])','execute') then
    raise exception 'Anonymous provisioning allowed'; end if;
end $$;
select 'account provisioning assertions passed' as result;
rollback;
