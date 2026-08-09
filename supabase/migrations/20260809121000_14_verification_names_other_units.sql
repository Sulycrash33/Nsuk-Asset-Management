-- Let a verification name an item that belongs elsewhere ----------------------
--
-- Under the caller's own rights, row level security hides assets belonging to
-- other units. A staff member scanning a stray chair was therefore told it was
-- not in the register at all, when the useful answer is that it belongs to
-- another unit and should go back there.
--
-- Both functions now run elevated, with the caller's right to the unit checked
-- explicitly first, so the elevation cannot be used to reach a unit that is not
-- theirs. Verified against the database: a staff member scoped to one unit gets
-- "elsewhere" with the item named, and is refused outright when pointed at
-- another unit's verification.

create or replace function public.record_verification_scan(p_session_id uuid, p_barcode text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unit uuid; v_asset public.assets%rowtype; v_outcome text; v_existed boolean;
begin
  select org_unit_id into v_unit
    from public.verification_sessions
   where id = p_session_id and closed_at is null;

  if v_unit is null then
    raise exception 'That verification is not open.' using errcode = 'check_violation';
  end if;

  -- The elevation stops here: the caller must own this unit to record anything.
  if not (public.is_admin() or v_unit in (select public.my_unit_ids())) then
    raise exception 'You do not have access to that unit.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_asset from public.assets
   where barcode = p_barcode or qr_payload = p_barcode limit 1;

  if v_asset.id is null then v_outcome := 'unknown';
  elsif v_asset.org_unit_id = v_unit then v_outcome := 'expected';
  else v_outcome := 'elsewhere';
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
    'outcome', case when v_existed then 'repeat' else v_outcome end,
    'asset_id', v_asset.id, 'asset_name', v_asset.name, 'barcode', p_barcode);
end $$;

create or replace function public.verification_result(p_session_id uuid)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_unit uuid;
  v_out json;
begin
  select org_unit_id into v_unit from public.verification_sessions where id = p_session_id;
  if v_unit is null then
    raise exception 'No such verification.' using errcode = 'check_violation';
  end if;
  if not (public.is_admin() or v_unit in (select public.my_unit_ids())) then
    raise exception 'You do not have access to that unit.' using errcode = 'insufficient_privilege';
  end if;

  with expected as (
    select a.id, a.barcode, a.name, a.location from public.assets a where a.org_unit_id = v_unit
  ),
  scanned as (
    select v.barcode, v.asset_id from public.verification_scans v where v.session_id = p_session_id
  )
  select json_build_object(
    'expected_total', (select count(*) from expected),
    'seen_total', (select count(*) from expected e where e.id in (select asset_id from scanned)),
    'present', (
      select coalesce(json_agg(json_build_object('id', e.id, 'barcode', e.barcode, 'name', e.name, 'location', e.location)), '[]'::json)
        from expected e where e.id in (select asset_id from scanned)
    ),
    'missing', (
      select coalesce(json_agg(json_build_object('id', e.id, 'barcode', e.barcode, 'name', e.name, 'location', e.location)), '[]'::json)
        from expected e where e.id not in (select asset_id from scanned where asset_id is not null)
    ),
    'elsewhere', (
      select coalesce(json_agg(json_build_object('id', a.id, 'barcode', a.barcode, 'name', a.name, 'unit', u.name)), '[]'::json)
        from scanned sc
        join public.assets a on a.id = sc.asset_id
        left join public.org_units u on u.id = a.org_unit_id
       where a.org_unit_id <> v_unit
    ),
    'unknown', (
      select coalesce(json_agg(sc.barcode), '[]'::json) from scanned sc where sc.asset_id is null
    )
  ) into v_out;

  return v_out;
end $$;

revoke all on function public.record_verification_scan(uuid, text) from public, anon;
revoke all on function public.verification_result(uuid) from public, anon;
grant execute on function public.record_verification_scan(uuid, text) to authenticated;
grant execute on function public.verification_result(uuid) to authenticated;
