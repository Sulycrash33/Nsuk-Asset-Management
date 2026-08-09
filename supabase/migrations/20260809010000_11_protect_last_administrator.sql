-- The University must never be left without an administrator ------------------
--
-- Administrators are equal: each can demote or delete the other. That is the
-- point of having more than one, but it means a mistake, or a fit of temper,
-- could remove the last administrator and lock everyone out of the register
-- permanently. Nobody left on the system would be able to restore access, and
-- the only remedy would be editing the database by hand.
--
-- Enforced in the database rather than in the application because role changes
-- are written straight to the profiles table by the browser, so an application
-- check alone would not cover them.

create or replace function public.protect_last_administrator()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  remaining integer;
begin
  -- Only demotions and deletions of an existing administrator can reduce the count.
  if tg_op = 'UPDATE' and not (old.role = 'admin' and new.role <> 'admin') then
    return new;
  end if;
  if tg_op = 'DELETE' and old.role <> 'admin' then
    return old;
  end if;

  select count(*) into remaining
    from public.profiles
   where role = 'admin' and id <> old.id;

  if remaining = 0 then
    raise exception
      'This is the only administrator on the system. Appoint another administrator first, or the University would be locked out of its own register.'
      using errcode = 'check_violation';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

drop trigger if exists profiles_protect_last_admin_trg on public.profiles;
create trigger profiles_protect_last_admin_trg
before update or delete on public.profiles
for each row execute function public.protect_last_administrator();
