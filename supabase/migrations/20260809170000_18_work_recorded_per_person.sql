-- Per-person tally of what each account has put into the register.
--
-- Counting is done in the database rather than by reading every asset back into
-- the application, so the account page costs one small aggregate no matter how
-- large the register grows.
--
-- SECURITY INVOKER on purpose: the existing row-level policies decide which
-- assets the caller may count, so a member of staff sees totals for their own
-- units and an administrator sees everyone.

create index if not exists assets_created_by_created_at_idx
  on public.assets (created_by, created_at desc);

create or replace function public.work_recorded()
returns table (
  user_id uuid,
  assets bigint,
  total_value numeric,
  first_recorded timestamptz,
  last_recorded timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    created_by,
    count(*),
    coalesce(sum(value), 0),
    min(created_at),
    max(created_at)
  from public.assets
  where created_by is not null
  group by created_by;
$$;

revoke all on function public.work_recorded() from public, anon;
grant execute on function public.work_recorded() to authenticated;
