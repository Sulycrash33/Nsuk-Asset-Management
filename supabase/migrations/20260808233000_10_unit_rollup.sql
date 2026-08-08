-- Keep the dashboard's cost proportional to the number of units, not assets ---
--
-- Measured on 1.2 million rows: aggregating the assets table on every dashboard
-- view took 1.4 seconds for a single pass, and grew with every item recorded.
-- A register meant to hold the whole University cannot get slower each time it
-- is used, so the totals are maintained as assets change and simply read back.
--
-- There is one row per unit, so this table stays around a hundred rows however
-- large the register grows.

create table if not exists public.unit_asset_stats (
  org_unit_id  uuid primary key references public.org_units(id) on delete cascade,
  total        bigint  not null default 0,
  value        numeric not null default 0,
  working      bigint  not null default 0,
  faulty       bigint  not null default 0,
  under_repair bigint  not null default 0,
  missing      bigint  not null default 0
);

comment on table public.unit_asset_stats is
  'Running totals per unit, maintained by trigger. Never edited by hand.';

alter table public.unit_asset_stats enable row level security;

-- Scoped exactly like the assets the figures describe, so staff see their own
-- units and nothing else.
drop policy if exists unit_asset_stats_read on public.unit_asset_stats;
create policy unit_asset_stats_read on public.unit_asset_stats for select to authenticated
  using (public.is_admin() or org_unit_id in (select public.my_unit_ids()));

create or replace function public.assets_rollup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Withdraw the old shape of the row (on update this may be a different unit).
  if tg_op in ('DELETE', 'UPDATE') then
    update public.unit_asset_stats s
       set total        = s.total - 1,
           value        = s.value - coalesce(old.value, 0),
           working      = s.working      - (old.condition = 'Working')::int,
           faulty       = s.faulty       - (old.condition = 'Faulty')::int,
           under_repair = s.under_repair - (old.condition = 'Under Repair')::int,
           missing      = s.missing      - (old.condition = 'Missing')::int
     where s.org_unit_id = old.org_unit_id;
  end if;

  -- Add the new shape.
  if tg_op in ('INSERT', 'UPDATE') then
    insert into public.unit_asset_stats as s
      (org_unit_id, total, value, working, faulty, under_repair, missing)
    values (
      new.org_unit_id, 1, coalesce(new.value, 0),
      (new.condition = 'Working')::int,
      (new.condition = 'Faulty')::int,
      (new.condition = 'Under Repair')::int,
      (new.condition = 'Missing')::int
    )
    on conflict (org_unit_id) do update set
      total        = s.total + 1,
      value        = s.value + coalesce(new.value, 0),
      working      = s.working      + (new.condition = 'Working')::int,
      faulty       = s.faulty       + (new.condition = 'Faulty')::int,
      under_repair = s.under_repair + (new.condition = 'Under Repair')::int,
      missing      = s.missing      + (new.condition = 'Missing')::int;
  end if;

  return null;
end $$;

drop trigger if exists assets_rollup_trg on public.assets;
create trigger assets_rollup_trg
after insert or update or delete on public.assets
for each row execute function public.assets_rollup();

-- Recomputes from scratch. Used to seed the table, and available if the totals
-- ever need to be re-derived after bulk work with the trigger disabled.
create or replace function public.rebuild_unit_asset_stats()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.unit_asset_stats;
  insert into public.unit_asset_stats
    (org_unit_id, total, value, working, faulty, under_repair, missing)
  select org_unit_id,
         count(*),
         coalesce(sum(value), 0),
         count(*) filter (where condition = 'Working'),
         count(*) filter (where condition = 'Faulty'),
         count(*) filter (where condition = 'Under Repair'),
         count(*) filter (where condition = 'Missing')
    from public.assets
   group by org_unit_id;
$$;

revoke all on function public.rebuild_unit_asset_stats() from public, anon, authenticated;

select public.rebuild_unit_asset_stats();

-- The dashboard now reads the rollup rather than the register ----------------

create or replace function public.dashboard_stats()
returns json
language sql
stable
security invoker
set search_path = public
as $$
  select json_build_object(
    'total_assets', coalesce((select sum(total) from public.unit_asset_stats), 0),
    'total_value',  coalesce((select sum(value) from public.unit_asset_stats), 0),
    'by_condition', (
      select json_build_object(
        'Working',      coalesce(sum(working), 0),
        'Faulty',       coalesce(sum(faulty), 0),
        'Under Repair', coalesce(sum(under_repair), 0),
        'Missing',      coalesce(sum(missing), 0)
      ) from public.unit_asset_stats
    ),
    'top_units', (
      select coalesce(json_agg(t), '[]'::json)
        from (
          select org_unit_id, total as count, value
            from public.unit_asset_stats
           where total > 0
           order by total desc
           limit 8
        ) t
    )
  );
$$;

create or replace function public.unit_asset_counts()
returns table (org_unit_id uuid, count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select org_unit_id, total from public.unit_asset_stats where total > 0;
$$;

grant execute on function public.dashboard_stats() to authenticated;
grant execute on function public.unit_asset_counts() to authenticated;
