-- Unit code generation ------------------------------------------------------
create or replace function public.generate_unit_code(p_name text)
returns text
language plpgsql
as $$
declare
  base text;
  words text[];
  candidate text;
  i int := 1;
begin
  base := upper(regexp_replace(coalesce(p_name,''), '[^a-zA-Z0-9 ]', ' ', 'g'));
  base := trim(regexp_replace(base, '\s+', ' ', 'g'));
  words := regexp_split_to_array(base, ' ');
  if base = '' then
    base := 'UNIT';
  elsif array_length(words, 1) > 1 then
    select string_agg(substr(w, 1, 1), '') into base from unnest(words) w where w <> '';
  else
    base := substr(base, 1, 4);
  end if;
  base := substr(base, 1, 6);
  if base is null or base = '' then base := 'UNIT'; end if;
  candidate := base;
  while exists (select 1 from public.org_units where code = candidate) loop
    i := i + 1;
    candidate := base || i::text;
  end loop;
  return candidate;
end;
$$;

create or replace function public.org_units_set_code()
returns trigger
language plpgsql
as $$
begin
  if new.code is null or new.code = '' then
    new.code := public.generate_unit_code(new.name);
  end if;
  return new;
end;
$$;

drop trigger if exists org_units_set_code_trg on public.org_units;
create trigger org_units_set_code_trg
before insert on public.org_units
for each row execute function public.org_units_set_code();

-- Barcode generation --------------------------------------------------------
create or replace function public.next_barcode(p_unit_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_seq integer;
begin
  update public.org_units
     set asset_seq = asset_seq + 1
   where id = p_unit_id
  returning code, asset_seq into v_code, v_seq;

  if v_code is null then
    raise exception 'Unknown org unit %', p_unit_id;
  end if;

  return 'NSUK-' || v_code || '-' || lpad(v_seq::text, 4, '0');
end;
$$;

create or replace function public.assets_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.barcode is null or new.barcode = '' then
    new.barcode := public.next_barcode(new.org_unit_id);
  end if;
  new.qr_payload := new.barcode;
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists assets_before_insert_trg on public.assets;
create trigger assets_before_insert_trg
before insert on public.assets
for each row execute function public.assets_before_insert();

create or replace function public.assets_before_update()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.qr_payload := new.barcode;
  return new;
end;
$$;

drop trigger if exists assets_before_update_trg on public.assets;
create trigger assets_before_update_trg
before update on public.assets
for each row execute function public.assets_before_update();

-- Activity log --------------------------------------------------------------
create or replace function public.assets_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.asset_logs(asset_id, asset_barcode, asset_name, action, performed_by, to_unit_id)
    values (new.id, new.barcode, new.name, 'created', auth.uid(), new.org_unit_id);
    return new;
  elsif tg_op = 'UPDATE' then
    if new.org_unit_id is distinct from old.org_unit_id then
      insert into public.asset_logs(asset_id, asset_barcode, asset_name, action, performed_by, from_unit_id, to_unit_id, note)
      values (new.id, new.barcode, new.name, 'moved', auth.uid(), old.org_unit_id, new.org_unit_id, nullif(current_setting('app.move_reason', true), ''));
    else
      insert into public.asset_logs(asset_id, asset_barcode, asset_name, action, performed_by, to_unit_id)
      values (new.id, new.barcode, new.name, 'edited', auth.uid(), new.org_unit_id);
    end if;
    return new;
  else
    insert into public.asset_logs(asset_id, asset_barcode, asset_name, action, performed_by, from_unit_id)
    values (old.id, old.barcode, old.name, 'deleted', auth.uid(), old.org_unit_id);
    return old;
  end if;
end;
$$;

drop trigger if exists assets_audit_trg on public.assets;
create trigger assets_audit_trg
after insert or update or delete on public.assets
for each row execute function public.assets_audit();

-- Move helper (records a reason on the log row) ------------------------------
create or replace function public.move_asset(p_asset_id uuid, p_to_unit_id uuid, p_reason text)
returns void
language plpgsql
set search_path = public
as $$
begin
  perform set_config('app.move_reason', coalesce(p_reason, ''), true);
  update public.assets set org_unit_id = p_to_unit_id where id = p_asset_id;
  perform set_config('app.move_reason', '', true);
end;
$$;

-- New user -> profile (first ever user becomes admin) -----------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  v_role := coalesce(new.raw_user_meta_data->>'role', 'staff');
  if not exists (select 1 from public.profiles where role = 'admin') then
    v_role := 'admin';
  end if;

  insert into public.profiles (id, name, email, role, campus_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    v_role,
    nullif(new.raw_user_meta_data->>'campus_id', '')::uuid
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
