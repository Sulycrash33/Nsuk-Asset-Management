-- Physical verification: proving the register against the room ---------------
--
-- Scanning an asset already answers "what is this item". This answers the
-- question an audit actually asks: "is the register true". Someone walks a
-- unit, scans everything present, and the system reports what was found, what
-- is missing, and what is sitting somewhere it should not be.
--
-- A verification is a deliberate exercise with a beginning and an end, because
-- the result has to be handed to the Bursary and to internal audit. Leaving one
-- open costs nothing, so the casual case still works: start one, scan a few
-- things, finish.

create table if not exists public.verification_sessions (
  id          uuid primary key default gen_random_uuid(),
  org_unit_id uuid not null references public.org_units(id) on delete cascade,
  started_by  uuid references public.profiles(id) on delete set null,
  started_at  timestamptz not null default now(),
  closed_at   timestamptz,
  note        text
);

comment on table public.verification_sessions is
  'One physical verification exercise over a single unit.';

create index if not exists verification_sessions_unit_idx
  on public.verification_sessions (org_unit_id, started_at desc);
create index if not exists verification_sessions_open_idx
  on public.verification_sessions (org_unit_id) where closed_at is null;

-- One row per scan. The barcode is kept as text as well as the asset link, so
-- a code that matches nothing still leaves a record of having been scanned.
create table if not exists public.verification_scans (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.verification_sessions(id) on delete cascade,
  asset_id   uuid references public.assets(id) on delete set null,
  barcode    text not null,
  scanned_at timestamptz not null default now(),
  unique (session_id, barcode)
);

comment on table public.verification_scans is
  'Every code scanned during a verification, including codes that matched nothing.';

create index if not exists verification_scans_session_idx
  on public.verification_scans (session_id);

alter table public.verification_sessions enable row level security;
alter table public.verification_scans    enable row level security;

-- Scoped exactly like the assets being counted.
drop policy if exists verification_sessions_rw on public.verification_sessions;
create policy verification_sessions_rw on public.verification_sessions for all to authenticated
  using (public.is_admin() or org_unit_id in (select public.my_unit_ids()))
  with check (public.is_admin() or org_unit_id in (select public.my_unit_ids()));

drop policy if exists verification_scans_rw on public.verification_scans;
create policy verification_scans_rw on public.verification_scans for all to authenticated
  using (
    exists (
      select 1 from public.verification_sessions s
       where s.id = session_id
         and (public.is_admin() or s.org_unit_id in (select public.my_unit_ids()))
    )
  )
  with check (
    exists (
      select 1 from public.verification_sessions s
       where s.id = session_id
         and (public.is_admin() or s.org_unit_id in (select public.my_unit_ids()))
    )
  );

-- Record one scanned code against a session -----------------------------------
--
-- Returns what the scan means, so the person holding the scanner gets an
-- immediate answer rather than having to wait for the report:
--
--   expected  the item belongs to this unit and is now accounted for
--   elsewhere the item is registered, but to a different unit
--   unknown   no such code in the register
--   repeat    already scanned in this session
create or replace function public.record_verification_scan(
  p_session_id uuid,
  p_barcode    text
)
returns json
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_unit    uuid;
  v_asset   public.assets%rowtype;
  v_outcome text;
  v_existed boolean;
begin
  select org_unit_id into v_unit
    from public.verification_sessions
   where id = p_session_id and closed_at is null;

  if v_unit is null then
    raise exception 'That verification is not open.' using errcode = 'check_violation';
  end if;

  select * into v_asset from public.assets
   where barcode = p_barcode or qr_payload = p_barcode
   limit 1;

  if v_asset.id is null then
    v_outcome := 'unknown';
  elsif v_asset.org_unit_id = v_unit then
    v_outcome := 'expected';
  else
    v_outcome := 'elsewhere';
  end if;

  select exists (
    select 1 from public.verification_scans
     where session_id = p_session_id and barcode = p_barcode
  ) into v_existed;

  if not v_existed then
    insert into public.verification_scans (session_id, asset_id, barcode)
    values (p_session_id, v_asset.id, p_barcode);
  end if;

  return json_build_object(
    'outcome',    case when v_existed then 'repeat' else v_outcome end,
    'asset_id',   v_asset.id,
    'asset_name', v_asset.name,
    'barcode',    p_barcode
  );
end $$;

-- The result of a verification ------------------------------------------------
create or replace function public.verification_result(p_session_id uuid)
returns json
language sql
stable
security invoker
set search_path = public
as $$
  with session as (
    select * from public.verification_sessions where id = p_session_id
  ),
  expected as (
    select a.id, a.barcode, a.name, a.location, a.condition
      from public.assets a, session s
     where a.org_unit_id = s.org_unit_id
  ),
  scanned as (
    select v.barcode, v.asset_id from public.verification_scans v
     where v.session_id = p_session_id
  )
  select json_build_object(
    'expected_total', (select count(*) from expected),
    'seen_total',     (select count(*) from expected e where e.id in (select asset_id from scanned)),
    'present', (
      select coalesce(json_agg(json_build_object(
               'id', e.id, 'barcode', e.barcode, 'name', e.name, 'location', e.location)), '[]'::json)
        from expected e where e.id in (select asset_id from scanned)
    ),
    'missing', (
      select coalesce(json_agg(json_build_object(
               'id', e.id, 'barcode', e.barcode, 'name', e.name, 'location', e.location)), '[]'::json)
        from expected e where e.id not in (select asset_id from scanned where asset_id is not null)
    ),
    -- Registered elsewhere: found in this room but belonging to another unit.
    'elsewhere', (
      select coalesce(json_agg(json_build_object(
               'id', a.id, 'barcode', a.barcode, 'name', a.name,
               'unit', u.name)), '[]'::json)
        from scanned sc
        join public.assets a on a.id = sc.asset_id
        left join public.org_units u on u.id = a.org_unit_id
       where a.org_unit_id <> (select org_unit_id from session)
    ),
    'unknown', (
      select coalesce(json_agg(sc.barcode), '[]'::json)
        from scanned sc where sc.asset_id is null
    )
  );
$$;

revoke all on function public.record_verification_scan(uuid, text) from public, anon;
revoke all on function public.verification_result(uuid) from public, anon;
grant execute on function public.record_verification_scan(uuid, text) to authenticated;
grant execute on function public.verification_result(uuid) to authenticated;
