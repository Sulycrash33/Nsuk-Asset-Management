-- A stranger must not be able to make themselves an administrator ------------
--
-- handle_new_user() read the new account's role straight out of the sign-up
-- metadata:
--
--   v_role := coalesce(new.raw_user_meta_data->>'role', 'staff');
--
-- That metadata is supplied by whoever calls sign-up, and the anon key needed
-- to call it ships in the browser bundle of every public page. Anyone could
-- therefore sign up asking for role "admin" and receive University-wide access
-- to the whole register. Confirmed against this database before the fix: a
-- sign-up carrying role:"admin" was granted admin.
--
-- Privilege is now decided here and never by the caller. Everyone arrives as
-- staff. The single exception is the genuine first account on an empty system,
-- which must be an administrator or nobody could administer anything.
--
-- Administrators are still appointed, by an existing administrator, through
-- /api/admin/users. That route checks the caller is an admin and sets the role
-- on the profile afterwards, so appointing an administrator still works.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := 'staff';
begin
  -- Bootstrap only: an empty system needs its first administrator.
  if not exists (select 1 from public.profiles where role = 'admin') then
    v_role := 'admin';
  end if;

  insert into public.profiles (id, name, email, role, campus_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    v_role,
    nullif(new.raw_user_meta_data->>'campus_id', '')::uuid
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Belt and braces: refuse a promotion to administrator unless the person
-- making it is already one. RLS lets a signed-in user update their own
-- profile, which is how they edit their name, and that must not become a route
-- to editing their own role.
create or replace function public.protect_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role then
    -- auth.uid() is null for service-role and server-side administration,
    -- which is how accounts are legitimately created and promoted.
    if auth.uid() is not null and not public.is_admin() then
      raise exception 'Only an administrator may change a role.'
        using errcode = 'insufficient_privilege';
    end if;

    if auth.uid() = new.id and old.role <> new.role then
      raise exception 'You cannot change your own role.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_protect_role_trg on public.profiles;
create trigger profiles_protect_role_trg
before update on public.profiles
for each row execute function public.protect_role_escalation();
