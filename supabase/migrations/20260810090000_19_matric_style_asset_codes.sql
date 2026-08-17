-- Asset codes in the University's own house style
--
-- The old code read NSUK-FOA-0001, which said almost nothing to a person
-- holding the item. The new one reads the way a matriculation number reads, so
-- an officer can tell at a glance where a thing belongs without looking it up:
--
--   NSU / ADM / ACC / CP / T / 001
--    |     |     |     |    |   `- running number within that unit
--    |     |     |     |    `----- fixed segment
--    |     |     |     `---------- item type, from the asset category
--    |     |     `---------------- department or unit
--    |     `---------------------- faculty, school or directorate
--    `---------------------------- the University
--
-- Slashes are safe: Code 128-B carries the full printable ASCII range, and the
-- printed symbol decodes back to exactly the characters shown beneath it.

-- The fifth segment. Its meaning has not been settled yet, so it lives here as
-- one literal rather than being scattered through the code: change this line
-- and every code issued from then on follows.
create or replace function public.asset_code_segment()
returns text language sql immutable as $$ select 'T'::text $$;

-- ---------------------------------------------------------------- unit codes
alter table public.org_units add column if not exists short_code text;

-- Words that describe what a unit *is* rather than which one it is. Dropping
-- them is what turns "Faculty of Administration" into ADM rather than FOA.
create or replace function public.derive_short_code(p_name text)
returns text
language plpgsql
immutable
as $$
declare
  cleaned text;
  words text[];
  keep text[] := array[]::text[];
  w text;
  result text;
begin
  cleaned := upper(regexp_replace(coalesce(p_name, ''), '[^a-zA-Z0-9 ]', ' ', 'g'));
  cleaned := trim(regexp_replace(cleaned, '\s+', ' ', 'g'));
  words := regexp_split_to_array(cleaned, ' ');

  foreach w in array coalesce(words, array[]::text[]) loop
    if w <> '' and w not in (
      'FACULTY','SCHOOL','DEPARTMENT','DIRECTORATE','OFFICE','CENTRE','CENTER',
      'COLLEGE','UNIT','OF','AND','THE','FOR','IN'
    ) then
      keep := keep || w;
    end if;
  end loop;

  -- A name made entirely of those words still needs a code.
  if array_length(keep, 1) is null then
    keep := array_remove(coalesce(words, array[]::text[]), '');
  end if;

  if array_length(keep, 1) is null then
    return 'GEN';
  elsif array_length(keep, 1) = 1 then
    result := substr(keep[1], 1, 3);
  elsif array_length(keep, 1) = 2 then
    result := substr(keep[1], 1, 2) || substr(keep[2], 1, 1);
  else
    result := substr(keep[1], 1, 1) || substr(keep[2], 1, 1) || substr(keep[3], 1, 1);
  end if;

  return rpad(result, 3, 'X');
end;
$$;

update public.org_units
   set short_code = public.derive_short_code(name)
 where short_code is null or short_code = '';

create or replace function public.org_units_set_short_code()
returns trigger
language plpgsql
as $$
begin
  if new.short_code is null or new.short_code = '' then
    new.short_code := public.derive_short_code(new.name);
  end if;
  new.short_code := upper(regexp_replace(new.short_code, '[^a-zA-Z0-9]', '', 'g'));
  return new;
end;
$$;

drop trigger if exists org_units_set_short_code_trg on public.org_units;
create trigger org_units_set_short_code_trg
before insert or update of name, short_code on public.org_units
for each row execute function public.org_units_set_short_code();

-- ------------------------------------------------------------ category codes
alter table public.asset_categories add column if not exists code text;

update public.asset_categories set code = v.code
  from (values
    ('AC', 'AC'), ('Vehicle', 'VH'), ('Desk/Furniture', 'DF'),
    ('Computer/IT Equipment', 'CP'), ('Lab Equipment', 'LB'), ('Generator', 'GN'),
    ('Projector/AV Equipment', 'PJ'), ('Office Equipment', 'OE'), ('Other', 'OT')
  ) as v(name, code)
 where public.asset_categories.name = v.name
   and (public.asset_categories.code is null or public.asset_categories.code = '');

update public.asset_categories
   set code = upper(substr(regexp_replace(name, '[^a-zA-Z]', '', 'g'), 1, 2))
 where code is null or code = '';

-- --------------------------------------------------------------- the barcode
-- The old single argument form is dropped rather than overloaded: two
-- functions of the same name, one of which quietly issues the old format,
-- is exactly the sort of thing that produces mislabelled assets.
drop function if exists public.next_barcode(uuid);

create or replace function public.next_barcode(p_unit_id uuid, p_category_id uuid default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seq integer;
  v_self text;
  v_top text;
  v_cat text;
begin
  update public.org_units
     set asset_seq = asset_seq + 1
   where id = p_unit_id
  returning coalesce(nullif(short_code, ''), 'GEN'), asset_seq
       into v_self, v_seq;

  if v_self is null then
    raise exception 'Unknown org unit %', p_unit_id;
  end if;

  -- Climb to the faculty, school or directorate this unit sits under.
  with recursive up as (
    select id, parent_id, short_code, 0 as depth
      from public.org_units where id = p_unit_id
    union all
    select o.id, o.parent_id, o.short_code, up.depth + 1
      from public.org_units o join up on o.id = up.parent_id
  )
  select coalesce(nullif(short_code, ''), 'GEN')
    into v_top
    from up
   order by depth desc
   limit 1;

  -- An asset recorded straight onto a faculty has no department of its own.
  if v_top = v_self then
    v_self := 'GEN';
  end if;

  select coalesce(nullif(code, ''), upper(substr(regexp_replace(name, '[^a-zA-Z]', '', 'g'), 1, 2)))
    into v_cat
    from public.asset_categories
   where id = p_category_id;

  return 'NSU/' || v_top || '/' || v_self || '/' || coalesce(v_cat, 'XX')
      || '/' || public.asset_code_segment()
      || '/' || lpad(v_seq::text, 3, '0');
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
    new.barcode := public.next_barcode(new.org_unit_id, new.category_id);
  end if;
  new.qr_payload := new.barcode;
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

-- ------------------------------------------------------------- the Schools --
-- Schools sit alongside faculties in the University's structure and were
-- missing entirely, so nothing held by them could be recorded in its own place.
do $$
declare
  v_campus uuid;
  v_school uuid;
  v_name text;
  schools jsonb := '{
    "School of Postgraduate Studies": ["Postgraduate Administration","Postgraduate Records"],
    "School of Preliminary and Remedial Studies": ["Remedial Sciences","Remedial Arts"],
    "School of Continuing Education": ["Part Time Programmes","Sandwich Programmes"]
  }'::jsonb;
begin
  select id into v_campus from public.campuses where name = 'Keffi (Main)';
  if v_campus is null then return; end if;

  for v_name in select jsonb_object_keys(schools) loop
    select id into v_school
      from public.org_units
     where name = v_name and campus_id = v_campus;

    if v_school is null then
      insert into public.org_units (parent_id, campus_id, name, unit_type)
      values (null, v_campus, v_name, 'School')
      returning id into v_school;
    end if;

    insert into public.org_units (parent_id, campus_id, name, unit_type)
    select v_school, v_campus, child, 'Department'
      from jsonb_array_elements_text(schools -> v_name) as child
     where not exists (
       select 1 from public.org_units
        where name = child and parent_id = v_school
     );
  end loop;
end $$;

-- Helper functions stay off the public API surface.
revoke all on function public.derive_short_code(text) from public, anon, authenticated;
revoke all on function public.org_units_set_short_code() from public, anon, authenticated;
revoke all on function public.asset_code_segment() from public, anon, authenticated;
revoke all on function public.next_barcode(uuid, uuid) from public, anon, authenticated;
revoke all on function public.assets_before_insert() from public, anon, authenticated;
