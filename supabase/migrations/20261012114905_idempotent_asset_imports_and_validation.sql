alter table public.assets add column import_key text unique;
alter table public.assets add constraint assets_name_not_blank check (length(btrim(name)) > 0);
alter table public.assets add constraint assets_value_nonnegative check (value >= 0 and value <= 999999999999.99);

create function public.protect_asset_import_key()
returns trigger language plpgsql set search_path=public
as $$ begin
  if new.import_key is distinct from old.import_key then
    raise exception 'An asset import reference cannot be changed.' using errcode='check_violation';
  end if;
  return new;
end $$;
revoke all on function public.protect_asset_import_key() from public, anon, authenticated;
create trigger protect_asset_import_key_trg before update on public.assets
for each row execute function public.protect_asset_import_key();

create function public.import_asset_rows(p_rows jsonb)
returns setof public.assets language plpgsql security invoker set search_path=public
as $$
declare r jsonb; existing public.assets%rowtype; v_count integer;
begin
  if auth.uid() is null then raise exception 'Sign in before importing.' using errcode='insufficient_privilege'; end if;
  if p_rows is null or jsonb_typeof(p_rows)<>'array' then
    raise exception 'Send an array of import rows.' using errcode='check_violation';
  end if;
  if jsonb_array_length(p_rows) not between 1 and 50 then
    raise exception 'Send between 1 and 50 rows per import batch.' using errcode='check_violation';
  end if;
  if exists(select 1 from jsonb_array_elements(p_rows) x
    where coalesce(x->>'import_key','') !~ '^[a-f0-9]{64}$') then
    raise exception 'Each row needs a valid import reference.' using errcode='check_violation';
  end if;
  if (select count(distinct x->>'import_key') from jsonb_array_elements(p_rows) x)<>jsonb_array_length(p_rows) then
    raise exception 'An import batch contains repeated row references.' using errcode='check_violation';
  end if;
  insert into public.assets(import_key,name,category_id,org_unit_id,location,condition,value,serial_number,acquisition_date,notes,barcode,qr_payload)
  select r.import_key,r.name,r.category_id,r.org_unit_id,r.location,coalesce(r.condition,'Working'),coalesce(r.value,0),
    r.serial_number,r.acquisition_date,r.notes,'',''
  from jsonb_to_recordset(p_rows) as r(import_key text,name text,category_id uuid,org_unit_id uuid,
    location text,condition text,value numeric,serial_number text,acquisition_date date,notes text)
  where not exists(select 1 from public.assets a where a.import_key=r.import_key)
  on conflict(import_key) do nothing;

  -- A changed mapping must not silently overwrite already recorded rows.
  for r in select value from jsonb_array_elements(p_rows) loop
    select * into existing from public.assets where import_key=r->>'import_key';
    if not found then raise exception 'An import reference is already recorded outside your access.' using errcode='insufficient_privilege'; end if;
    if row(existing.name,existing.category_id,existing.org_unit_id,existing.location,existing.condition,
      existing.value,existing.serial_number,existing.acquisition_date,existing.notes) is distinct from
      row(r->>'name',(r->>'category_id')::uuid,(r->>'org_unit_id')::uuid,r->>'location',coalesce(r->>'condition','Working'),
        coalesce((r->>'value')::numeric,0),r->>'serial_number',(r->>'acquisition_date')::date,r->>'notes') then
      raise exception 'A previously imported row has different values. Edit its asset record instead of re-importing it.' using errcode='check_violation';
    end if;
  end loop;
  select count(*) into v_count from public.assets a where a.import_key in(select x->>'import_key' from jsonb_array_elements(p_rows) x);
  if v_count<>jsonb_array_length(p_rows) then raise exception 'Not every row was confirmed.' using errcode='check_violation'; end if;
  return query select a.* from jsonb_array_elements(p_rows) with ordinality x(value,n)
    join public.assets a on a.import_key=x.value->>'import_key' order by x.n;
end $$;
revoke all on function public.import_asset_rows(jsonb) from public, anon;
grant execute on function public.import_asset_rows(jsonb) to authenticated;
