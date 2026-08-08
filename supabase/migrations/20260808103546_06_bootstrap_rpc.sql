-- True until the very first account exists, so the app can offer a one-time
-- "create the first administrator" screen and hide it forever afterwards.
create or replace function public.needs_bootstrap()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (select 1 from public.profiles);
$$;

grant execute on function public.needs_bootstrap() to anon, authenticated;
