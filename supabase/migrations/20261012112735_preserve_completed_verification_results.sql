alter table public.verification_sessions add column result_snapshot jsonb;

-- Keep the existing calculation internal; public reads of a finished exercise
-- must use its saved result, not today's asset register.
alter function public.verification_result(uuid) rename to verification_live_result;
revoke all on function public.verification_live_result(uuid) from public, anon, authenticated;
alter function public.verification_live_result(uuid) volatile;

-- Legacy completed exercises can only be captured as they look at migration
-- time. The pilot currently has no completed exercises.
update public.verification_sessions
set result_snapshot = public.verification_live_result(id)::jsonb
where closed_at is not null;

create or replace function public.verification_result(p_session_id uuid)
returns json language plpgsql stable security definer set search_path = public
as $$
declare s public.verification_sessions%rowtype;
begin
  select * into s from public.verification_sessions where id=p_session_id;
  if not found then raise exception 'No such verification.' using errcode='check_violation'; end if;
  if auth.uid() is null or not public.can_access_unit(s.org_unit_id) then
    raise exception 'You do not have access to that unit.' using errcode='insufficient_privilege';
  end if;
  if s.closed_at is not null then return s.result_snapshot::json; end if;
  return public.verification_live_result(p_session_id);
end $$;
revoke all on function public.verification_result(uuid) from public, anon;
grant execute on function public.verification_result(uuid) to authenticated;

create or replace function public.capture_verification_result()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op='INSERT' then
    if new.closed_at is not null or new.result_snapshot is not null then
      raise exception 'Start an open verification before finishing it.' using errcode='check_violation';
    end if;
    return new;
  end if;
  if new.org_unit_id is distinct from old.org_unit_id then
    raise exception 'A verification cannot change units.' using errcode='check_violation';
  end if;
  if new.result_snapshot is distinct from old.result_snapshot or
     (old.closed_at is not null and new.closed_at is distinct from old.closed_at) then
    raise exception 'A completed verification result cannot be changed or reopened.' using errcode='check_violation';
  end if;
  if old.closed_at is null and new.closed_at is not null then
    new.result_snapshot := public.verification_live_result(old.id)::jsonb;
    new.closed_at := now();
  end if;
  return new;
end $$;
revoke all on function public.capture_verification_result() from public, anon, authenticated;
create trigger capture_verification_result_trg before insert or update
on public.verification_sessions for each row execute function public.capture_verification_result();

-- Scan writes and finishing take the same session lock. This covers direct
-- table writes as well as the RPC; no scan can be added after the snapshot.
create or replace function public.guard_verification_scan()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_closed timestamptz; v_session uuid;
begin
  if tg_op='UPDATE' and new.session_id is distinct from old.session_id then
    raise exception 'A scan cannot change verification sessions.' using errcode='check_violation';
  end if;
  -- Foreign-key cleanup when an asset is deleted can null its link. The saved
  -- report retains the asset's identity and does not use this link afterwards.
  if tg_op='UPDATE' and old.asset_id is not null and new.asset_id is null and
     (to_jsonb(new)-'asset_id')=(to_jsonb(old)-'asset_id') then return new; end if;
  if tg_op='DELETE' then v_session:=old.session_id; else v_session:=new.session_id; end if;
  select closed_at into v_closed from public.verification_sessions where id=v_session for update;
  if not found and tg_op='DELETE' then return old; end if; -- session cascade
  if not found or v_closed is not null then
    raise exception 'That verification is not open.' using errcode='check_violation';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public.guard_verification_scan() from public, anon, authenticated;
create trigger guard_verification_scan_trg before insert or update or delete
on public.verification_scans for each row execute function public.guard_verification_scan();

create or replace function public.finish_verification(p_session_id uuid)
returns json language plpgsql security definer set search_path = public
as $$
declare s public.verification_sessions%rowtype;
begin
  select * into s from public.verification_sessions where id=p_session_id for update;
  if not found then raise exception 'No such verification.' using errcode='check_violation'; end if;
  if auth.uid() is null or not public.can_access_unit(s.org_unit_id) then
    raise exception 'You do not have access to that unit.' using errcode='insufficient_privilege';
  end if;
  if s.closed_at is null then
    update public.verification_sessions set closed_at=now() where id=s.id returning * into s;
  end if;
  return s.result_snapshot::json;
end $$;
revoke all on function public.finish_verification(uuid) from public, anon;
grant execute on function public.finish_verification(uuid) to authenticated;

-- Lock before checking closed_at and make repeated/concurrent scans idempotent.
create or replace function public.record_verification_scan(p_session_id uuid, p_barcode text)
returns json language plpgsql security definer set search_path = public
as $$
declare s public.verification_sessions%rowtype; a public.assets%rowtype;
        v_inserted uuid; v_outcome text;
begin
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
  if a.id is null then v_outcome:='unknown';
  elsif a.org_unit_id=s.org_unit_id then v_outcome:='expected';
  else v_outcome:='elsewhere'; end if;
  insert into public.verification_scans(session_id,asset_id,barcode)
  values(s.id,a.id,p_barcode) on conflict(session_id,barcode) do nothing returning id into v_inserted;
  return json_build_object('outcome',case when v_inserted is null then 'repeat' else v_outcome end,
    'asset_id',a.id,'asset_name',a.name,'barcode',p_barcode);
end $$;
revoke all on function public.record_verification_scan(uuid,text) from public, anon;
grant execute on function public.record_verification_scan(uuid,text) to authenticated;
