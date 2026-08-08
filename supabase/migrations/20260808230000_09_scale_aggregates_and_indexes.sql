-- Aggregate in the database instead of in the application ---------------------
--
-- The dashboard and the org-unit page each used to select every asset row and
-- reduce it in JavaScript. That is fine for a store room and hopeless for a
-- University: the cost grows with the size of the register on every page view.
-- These functions push the work to Postgres, which answers from an index and
-- returns a handful of bytes however many assets exist.
--
-- Both are SECURITY INVOKER, so row level security still applies and staff see
-- figures for their own units only.

create or replace function public.dashboard_stats()
returns json
language sql
stable
security invoker
set search_path = public
as $$
  select json_build_object(
    'total_assets', (select count(*) from public.assets),
    'total_value',  (select coalesce(sum(value), 0) from public.assets),
    'by_condition', (
      select coalesce(json_object_agg(condition, n), '{}'::json)
        from (select condition, count(*) as n from public.assets group by condition) c
    ),
    'top_units', (
      select coalesce(json_agg(t), '[]'::json)
        from (
          select org_unit_id, count(*) as count, coalesce(sum(value), 0) as value
            from public.assets
           group by org_unit_id
           order by count(*) desc
           limit 8
        ) t
    )
  );
$$;

comment on function public.dashboard_stats() is
  'Headline dashboard figures, aggregated in the database. Respects RLS.';

create or replace function public.unit_asset_counts()
returns table (org_unit_id uuid, count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select org_unit_id, count(*) from public.assets group by org_unit_id;
$$;

comment on function public.unit_asset_counts() is
  'One row per unit that holds assets. Replaces reading every asset to count them.';

revoke all on function public.dashboard_stats() from public, anon;
revoke all on function public.unit_asset_counts() from public, anon;
grant execute on function public.dashboard_stats() to authenticated;
grant execute on function public.unit_asset_counts() to authenticated;

-- Indexes the register needs once it is large ---------------------------------

-- The asset list is ordered by newest first. Without this, every page view
-- sorts the whole table to find the top 100.
create index if not exists assets_created_idx
  on public.assets (created_at desc);

-- The same list, filtered to a unit, which is what staff always see.
create index if not exists assets_unit_created_idx
  on public.assets (org_unit_id, created_at desc);

-- Name search currently scans; trigram makes "contains" matching indexable.
create extension if not exists pg_trgm with schema extensions;
create index if not exists assets_name_trgm_idx
  on public.assets using gin (name extensions.gin_trgm_ops);

-- Foreign keys without a covering index, flagged by the database linter.
create index if not exists assets_created_by_idx      on public.assets (created_by);
create index if not exists asset_logs_from_unit_idx   on public.asset_logs (from_unit_id);
create index if not exists asset_logs_to_unit_idx     on public.asset_logs (to_unit_id);
create index if not exists asset_logs_performed_by_idx on public.asset_logs (performed_by);
create index if not exists user_units_unit_idx        on public.user_units (org_unit_id);
create index if not exists profiles_campus_idx        on public.profiles (campus_id);

-- Evaluate auth.uid() once per query rather than once per row -----------------
-- Wrapping the call in a sub-select lets the planner hoist it out of the row
-- loop. Flagged by the linter as auth_rls_initplan.

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists user_units_read on public.user_units;
create policy user_units_read on public.user_units for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
