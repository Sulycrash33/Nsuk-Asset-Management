-- Any signed-in account can add a unit, from the bottom of the unit list
-- (asked for by the University on 10 Nov 2026: officers kept finding a unit
-- missing while tagging). The user chose "every account", and that a new unit
-- always goes under a parent the person picks, so its asset code reads like
-- the rest of the register.
--
-- Adding goes through this one function. The table itself stays
-- administrator-only (org_units_write), so nobody else can rename, move,
-- recode or remove a unit, or set its short code by hand; an administrator
-- tidies up typos and duplicates on the Units page as before.
--
-- The short code is chosen here, not left to the trigger. The asset code is
-- NSU/<top unit>/<unit>/..., so two units under the same top unit with the same
-- short code would issue the same barcode, and the second item could not be
-- saved at all. The derived code is used when it is free in that tree; if not,
-- the nearest free three-letter variant is taken.

create or replace function public.add_org_unit(
  p_name text,
  p_parent_id uuid,
  p_unit_type text default 'Department'
)
returns public.org_units
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := trim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_type text := coalesce(nullif(trim(p_unit_type), ''), 'Department');
  v_parent public.org_units;
  v_root uuid;
  v_taken text[];
  v_base text;
  v_letters text;
  v_code text;
  v_row public.org_units;
  i integer;
begin
  -- Every account, and only accounts: a signed-in identity with a profile.
  if auth.uid() is null
     or not exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'Sign in to add a unit' using errcode = '42501';
  end if;

  if v_name = '' or v_name !~ '[A-Za-z]' then
    raise exception 'Give the unit a name' using errcode = '22023';
  end if;
  if length(v_name) > 120 then
    raise exception 'Keep the unit name under 120 characters' using errcode = '22023';
  end if;
  -- Faculties and schools are the top of the tree; a new unit sits beneath one.
  if v_type not in ('Directorate', 'Department', 'Centre', 'Office', 'Clinic', 'Other') then
    raise exception 'Unknown unit type %', v_type using errcode = '22023';
  end if;

  if p_parent_id is null then
    raise exception 'Choose the unit it belongs under' using errcode = '22023';
  end if;
  select * into v_parent from public.org_units where id = p_parent_id;
  if not found then
    raise exception 'The unit it belongs under no longer exists' using errcode = '22023';
  end if;

  with recursive up as (
    select id, parent_id from public.org_units where id = p_parent_id
    union all
    select o.id, o.parent_id from public.org_units o join up on o.id = up.parent_id
  )
  select id into v_root from up where parent_id is null;

  -- One addition at a time per tree, so two people adding at once cannot both
  -- take the same free code.
  perform pg_advisory_xact_lock(hashtextextended('org_unit_codes:' || v_root::text, 0));

  if exists (
    select 1 from public.org_units
     where parent_id = p_parent_id and lower(name) = lower(v_name)
  ) then
    raise exception '"%" already exists under %. Choose it from the list.', v_name, v_parent.name
      using errcode = '23505';
  end if;

  -- Codes already used beneath the top unit. The top unit's own code is not in
  -- the unit segment (its direct assets print GEN), so it is not taken.
  with recursive down as (
    select id from public.org_units where id = v_root
    union all
    select o.id from public.org_units o join down on o.parent_id = down.id
  )
  select coalesce(array_agg(u.short_code), '{}') into v_taken
    from down join public.org_units u on u.id = down.id
   where u.id <> v_root and u.short_code is not null;
  v_taken := v_taken || 'GEN';

  v_base := public.derive_short_code(v_name);
  v_code := v_base;

  if v_code = any(v_taken) then
    v_code := null;
    -- Keep the first two letters and try the name's other letters, then the
    -- alphabet, then digits.
    v_letters := upper(regexp_replace(v_name, '[^A-Za-z]', '', 'g')) || 'ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789';
    for i in 1 .. length(v_letters) loop
      if (substr(v_base, 1, 2) || substr(v_letters, i, 1)) <> all(v_taken) then
        v_code := substr(v_base, 1, 2) || substr(v_letters, i, 1);
        exit;
      end if;
    end loop;
    if v_code is null then
      for i in 10 .. 99 loop
        if (substr(v_base, 1, 1) || i::text) <> all(v_taken) then
          v_code := substr(v_base, 1, 1) || i::text;
          exit;
        end if;
      end loop;
    end if;
    if v_code is null then
      raise exception 'No free short code under this unit; ask an administrator to add it';
    end if;
  end if;

  insert into public.org_units (parent_id, campus_id, name, unit_type, short_code)
  values (p_parent_id, v_parent.campus_id, v_name, v_type, v_code)
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.add_org_unit(text, uuid, text) from public, anon;
grant execute on function public.add_org_unit(text, uuid, text) to authenticated;
