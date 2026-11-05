-- An administrator can give an asset a new code after its unit was corrected,
-- and a sticker printed with the old code still finds the asset. Asked for on
-- 5 Nov 2026: 25 assets recorded under the wrong unit (Physical Planning,
-- Academic Affairs, the Vice-Chancellor's Office) were moved to Academic
-- Planning, but their codes still named the old unit, because a code is fixed
-- when the asset is first saved.

-- 1. Every code an asset has had and no longer carries. A code is never issued
--    twice (asset_seq only grows), so an old code names one asset for good.
create table public.asset_code_history (
  code text primary key,
  asset_id uuid not null references public.assets(id) on delete cascade,
  replaced_at timestamptz not null default now(),
  replaced_by uuid references auth.users(id) on delete set null
);
-- The cascade has to find an asset's old codes; and the asset page lists them.
create index asset_code_history_asset on public.asset_code_history(asset_id);
-- replaced_by nulls on delete: index it, as for every such key here.
create index asset_code_history_replaced_by on public.asset_code_history(replaced_by)
  where replaced_by is not null;
alter table public.asset_code_history enable row level security;
-- Readable wherever the asset itself is readable.
create policy asset_code_history_select on public.asset_code_history for select to authenticated
  using (exists(select 1 from public.assets a where a.id = asset_id));
revoke all on public.asset_code_history from anon, authenticated;
grant select on public.asset_code_history to authenticated;

-- 2. Issue a new code from the asset's current unit and category. Administrator
--    only. Refused when the code already matches both, so no number is spent
--    for nothing. The field history records the change (the audit trigger
--    tracks barcode), and the old code goes into asset_code_history.
create function public.reissue_asset_code(p_asset uuid)
returns text language plpgsql security definer set search_path = public as $$
declare a public.assets; new_code text;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Administrator access required' using errcode = 'insufficient_privilege';
  end if;
  select * into a from public.assets where id = p_asset for update;
  if not found then raise exception 'Asset not found' using errcode = 'no_data_found'; end if;
  new_code := public.next_barcode(a.org_unit_id, a.category_id);
  if regexp_replace(new_code, '/[^/]+$', '') = regexp_replace(a.barcode, '/[^/]+$', '') then
    -- Raising undoes the running number next_barcode just took.
    raise exception 'The code already matches this asset''s unit and category.' using errcode = 'check_violation';
  end if;
  insert into public.asset_code_history(code, asset_id, replaced_by) values (a.barcode, a.id, auth.uid());
  update public.assets set barcode = new_code where id = a.id;
  return new_code;
end $$;
revoke all on function public.reissue_asset_code(uuid) from public, anon;
grant execute on function public.reissue_asset_code(uuid) to authenticated;

-- 3. The asset a code names, current or old, for the scanner. Runs as the
--    caller, so row level security decides what it may return.
create function public.asset_for_code(p_code text)
returns table(id uuid, name text, barcode text, scanned_old_code boolean)
language sql stable security invoker set search_path = public as $$
  select a.id, a.name, a.barcode, false from public.assets a where a.barcode = p_code
  union all
  select a.id, a.name, a.barcode, true from public.asset_code_history h
    join public.assets a on a.id = h.asset_id
   where h.code = p_code and not exists(select 1 from public.assets x where x.barcode = p_code)
  limit 1
$$;
revoke all on function public.asset_for_code(text) from public, anon;
grant execute on function public.asset_for_code(text) to authenticated;

-- 4. A stock count recognises an old sticker as its asset. Only the lookup
--    changes; the rest is as before.
create or replace function public.record_verification_scan(p_session_id uuid, p_barcode text)
 returns json language plpgsql security definer set search_path to 'public'
as $function$
declare s public.verification_sessions%rowtype; a public.assets%rowtype;
        v_inserted uuid; v_outcome text;
begin
  if not public.can_write_assets() then raise exception 'This account has read-only access.' using errcode='insufficient_privilege'; end if;
  select * into s from public.verification_sessions where id=p_session_id for update;
  if not found or s.closed_at is not null then
    raise exception 'That verification is not open.' using errcode='check_violation';
  end if;
  if auth.uid() is null or not public.can_access_unit(s.org_unit_id) then
    raise exception 'You do not have access to that unit.' using errcode='insufficient_privilege';
  end if;
  if p_barcode is null or btrim(p_barcode)='' then
    raise exception 'A scanned code is required.' using errcode='check_violation';
  end if;
  select * into a from public.assets where barcode=p_barcode or qr_payload=p_barcode limit 1;
  if a.id is null then
    select x.* into a from public.asset_code_history h join public.assets x on x.id=h.asset_id where h.code=p_barcode;
  end if;
  if a.id is null then v_outcome:='unknown';
  elsif a.org_unit_id=s.org_unit_id then v_outcome:='expected';
  else v_outcome:='elsewhere'; end if;
  insert into public.verification_scans(session_id,asset_id,barcode)
  values(s.id,a.id,p_barcode) on conflict(session_id,barcode) do nothing returning id into v_inserted;
  return json_build_object('outcome',case when v_inserted is null then 'repeat' else v_outcome end,
    'asset_id',a.id,'asset_name',a.name,'barcode',p_barcode);
end $function$;

-- 5. One-off, approved on 5 Nov 2026: every asset whose code names a unit it is
--    no longer in gets a new code from its current unit, oldest code first.
--    Done as the system (no caller), so history shows "System".
do $$
declare r record; new_code text;
begin
  for r in
    with recursive up as (
      select a.id asset_id, u.id, u.parent_id, u.short_code, 0 depth from public.assets a join public.org_units u on u.id = a.org_unit_id
      union all
      select up.asset_id, o.id, o.parent_id, o.short_code, up.depth + 1 from public.org_units o join up on o.id = up.parent_id
    ), top as (
      select distinct on (asset_id) asset_id, id top_id, coalesce(nullif(short_code, ''), 'GEN') top_code from up order by asset_id, depth desc
    )
    select a.id, a.barcode, a.org_unit_id, a.category_id from public.assets a
      join top t on t.asset_id = a.id join public.org_units u on u.id = a.org_unit_id
     where regexp_replace(a.barcode, '^(NSU/[^/]+/[^/]+/).*$', '\1')
        <> 'NSU/' || t.top_code || '/' || case when t.top_id = a.org_unit_id then 'GEN' else coalesce(nullif(u.short_code, ''), 'GEN') end || '/'
     order by a.barcode
  loop
    new_code := public.next_barcode(r.org_unit_id, r.category_id);
    insert into public.asset_code_history(code, asset_id) values (r.barcode, r.id);
    update public.assets set barcode = new_code where id = r.id;
  end loop;
end $$;
