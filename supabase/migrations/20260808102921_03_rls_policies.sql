-- Scoping helpers (security definer to avoid RLS recursion) ------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin');
$$;

-- Units the current user may touch: assigned units plus all their descendants
create or replace function public.my_unit_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  with recursive scoped as (
    select ou.id
      from public.org_units ou
      join public.user_units uu on uu.org_unit_id = ou.id
     where uu.user_id = auth.uid()
    union
    select child.id
      from public.org_units child
      join scoped s on child.parent_id = s.id
  )
  select id from scoped;
$$;

create or replace function public.can_access_unit(p_unit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or p_unit_id in (select public.my_unit_ids());
$$;

alter table public.campuses        enable row level security;
alter table public.org_units       enable row level security;
alter table public.profiles        enable row level security;
alter table public.user_units      enable row level security;
alter table public.asset_categories enable row level security;
alter table public.assets          enable row level security;
alter table public.asset_logs      enable row level security;

-- Campuses: everyone signed in reads, admin writes
drop policy if exists campuses_read on public.campuses;
create policy campuses_read on public.campuses for select to authenticated using (true);
drop policy if exists campuses_write on public.campuses;
create policy campuses_write on public.campuses for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Org units: everyone signed in reads (needed for dropdowns / transfers), admin writes
drop policy if exists org_units_read on public.org_units;
create policy org_units_read on public.org_units for select to authenticated using (true);
drop policy if exists org_units_write on public.org_units;
create policy org_units_write on public.org_units for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Categories: everyone reads, admin writes
drop policy if exists categories_read on public.asset_categories;
create policy categories_read on public.asset_categories for select to authenticated using (true);
drop policy if exists categories_write on public.asset_categories;
create policy categories_write on public.asset_categories for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Profiles: read own, admin reads/writes all, own name editable
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid() and role = (select role from public.profiles p where p.id = auth.uid()));
drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_admin_all on public.profiles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- User <-> unit assignment: read own, admin manages
drop policy if exists user_units_read on public.user_units;
create policy user_units_read on public.user_units for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
drop policy if exists user_units_admin on public.user_units;
create policy user_units_admin on public.user_units for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Assets: admin everything; staff scoped to assigned units
drop policy if exists assets_select on public.assets;
create policy assets_select on public.assets for select to authenticated
  using (public.is_admin() or org_unit_id in (select public.my_unit_ids()));

drop policy if exists assets_insert on public.assets;
create policy assets_insert on public.assets for insert to authenticated
  with check (public.is_admin() or org_unit_id in (select public.my_unit_ids()));

-- Staff may edit in their units and may transfer out of them to any unit
drop policy if exists assets_update on public.assets;
create policy assets_update on public.assets for update to authenticated
  using (public.is_admin() or org_unit_id in (select public.my_unit_ids()))
  with check (true);

drop policy if exists assets_delete on public.assets;
create policy assets_delete on public.assets for delete to authenticated
  using (public.is_admin());

-- Logs: admin sees all, staff sees logs touching their units
drop policy if exists asset_logs_select on public.asset_logs;
create policy asset_logs_select on public.asset_logs for select to authenticated
  using (
    public.is_admin()
    or from_unit_id in (select public.my_unit_ids())
    or to_unit_id in (select public.my_unit_ids())
  );
