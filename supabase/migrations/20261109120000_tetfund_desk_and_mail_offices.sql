-- Two offices under the Vice-Chancellor's Office, asked for by the University
-- on 9 Nov 2026: TetFund Desk Office and Mail Office.
--
-- The codes are what derive_short_code gives each name (TED, MAI), stated here
-- so the file says which codes the labels will carry. An administrator can
-- still change them before anything is recorded in either office.
--
-- Additive only: no existing unit, code or running number is touched, and
-- recording into the other units carries on as before.

do $$
declare
  v_root uuid;
  v_campus uuid;
  v_clashes integer;
begin
  select id, campus_id into strict v_root, v_campus
    from public.org_units
   where parent_id is null
     and name = 'Vice-Chancellor''s Office and Offices Under';

  insert into public.org_units (parent_id, campus_id, name, unit_type, short_code)
  select v_root, v_campus, v.name, 'Office', v.short_code
    from (values
      ('TetFund Desk Office', 'TED'),
      ('Mail Office', 'MAI')
    ) as v(name, short_code)
   where not exists (
     select 1 from public.org_units o
      where o.parent_id = v_root and lower(o.name) = lower(v.name)
   );

  -- Two units under one faculty must not abbreviate alike: the asset code is
  -- built from both, so a shared code would mean a shared barcode.
  select count(*) into v_clashes
    from (
      select short_code from public.org_units
       where parent_id = v_root
       group by short_code having count(*) > 1
    ) d;
  if v_clashes > 0 then
    raise exception 'Two offices under the Vice-Chancellor''s Office now share a short code';
  end if;
end;
$$;
