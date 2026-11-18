-- A directorate of its own, asked for by the University on 18 Nov 2026:
-- Special Education, with one unit, Center for Disability Studies and Support
-- Services. At the user's choice it sits at the top of the tree beside
-- Bursary, Registry and the Library, on Keffi (Main). Names are spelt as the
-- user gave them.
--
-- The codes are what derive_short_code gives each name (SPE, DSS), stated here
-- so the file says which codes the labels will carry: NSU/SPE/DSS/OE/001. An
-- administrator can still change them before anything is recorded there.
--
-- Additive only: no existing unit, code or running number is touched. The
-- migration refuses if another top unit already uses SPE, since two trees with
-- one top code could then issue the same asset code.

do $$
declare
  v_campus uuid;
  v_root uuid;
begin
  select id into strict v_campus from public.campuses where name = 'Keffi (Main)';

  if exists (select 1 from public.org_units
              where parent_id is null and short_code = 'SPE'
                and lower(name) <> lower('Special Education')) then
    raise exception 'Another top unit already uses the code SPE';
  end if;

  select id into v_root from public.org_units
   where parent_id is null and lower(name) = lower('Special Education');
  if v_root is null then
    insert into public.org_units (parent_id, campus_id, name, unit_type, short_code)
    values (null, v_campus, 'Special Education', 'Directorate', 'SPE')
    returning id into v_root;
  end if;

  insert into public.org_units (parent_id, campus_id, name, unit_type, short_code)
  select v_root, v_campus, 'Center for Disability Studies and Support Services', 'Centre', 'DSS'
   where not exists (
     select 1 from public.org_units
      where parent_id = v_root
        and lower(name) = lower('Center for Disability Studies and Support Services')
   );
end;
$$;
