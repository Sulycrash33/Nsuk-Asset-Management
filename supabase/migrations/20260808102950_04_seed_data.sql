-- Campuses ------------------------------------------------------------------
insert into public.campuses (name) values
  ('Keffi (Main)'), ('Lafia'), ('Gudi'), ('Pyanku')
on conflict (name) do nothing;

-- Asset categories -----------------------------------------------------------
insert into public.asset_categories (name) values
  ('AC'), ('Vehicle'), ('Desk/Furniture'), ('Computer/IT Equipment'),
  ('Lab Equipment'), ('Generator'), ('Projector/AV Equipment'),
  ('Office Equipment'), ('Other')
on conflict (name) do nothing;

-- Org tree -------------------------------------------------------------------
do $$
declare
  v_campus uuid;
  v_parent uuid;
  faculties text[] := array[
    'Faculty of Administration',
    'Faculty of Agriculture',
    'Faculty of Arts',
    'Faculty of Medicine & Health Allied Sciences',
    'Faculty of Communication & Media Studies',
    'Faculty of Education',
    'Faculty of Engineering',
    'Faculty of Environmental Sciences',
    'Faculty of Law',
    'Faculty of Natural & Applied Sciences',
    'Faculty of Social Sciences'
  ];
  depts jsonb := '{
    "Faculty of Administration": ["Accounting","Banking & Finance","Business Administration","Entrepreneurship Studies","Marketing","Public Administration","Security & Investment Management","Taxation"],
    "Faculty of Agriculture": ["Agric Economics & Extension","Agronomy","Animal Science","Fisheries","Forestry & Wildlife","Home Science & Management"],
    "Faculty of Arts": ["Arabic","English","French","History","Islam & Development Studies","Linguistics","Nigerian Languages","Philosophy & Religious Studies","Theatre & Cultural Studies"],
    "Faculty of Medicine & Health Allied Sciences": ["Community Health","Environmental Health Science","Health Information Management","Nutrition & Dietetics"],
    "Faculty of Communication & Media Studies": ["Broadcasting","Journalism & Media Studies","Public Relations"],
    "Faculty of Education": ["Arts Education","Educational Foundation","Educational Management","Guidance & Counselling","Science Technology & Mathematics Education","Social Sciences Education","Special Education"],
    "Faculty of Engineering": ["Chemical Engineering","Civil Engineering","Electrical Electronic Engineering"],
    "Faculty of Environmental Sciences": ["Architecture","Building Technology","Environmental Management","Geography","Urban & Regional Planning"],
    "Faculty of Law": ["Islamic Law Jurisprudence","Private & Business Law","Public & International Law"],
    "Faculty of Natural & Applied Sciences": ["Biochemistry","Chemistry","Computer Science","Geology","Mathematics","Microbiology","Physics","Plant Science & Biotechnology","Science Laboratory Technology","Statistics & Data Analytics","Zoology"],
    "Faculty of Social Sciences": ["Economics","Library & Information Science","Mass Communication","Political Science","Psychology","Sociology"]
  }'::jsonb;
  nonacademic jsonb := '{
    "Registry": ["Academic Affairs","Council Affairs","General Administration","Human Resources"],
    "Bursary": ["Finance & Treasury","Main Account","Operations & Investment"],
    "Academic Planning": [],
    "DICT (ICT Directorate)": [],
    "Health Services (Clinic/Medical Centre)": [],
    "IPO": [],
    "Physical Planning": [],
    "Security Unit": [],
    "Student Affairs": [],
    "Library": [],
    "Sports Complex": [],
    "Works & Maintenance": [],
    "Staff Quarters/Housing": [],
    "Transport Unit": [],
    "Guest House/Hostels": [],
    "Central Administration/VC''s Office": []
  }'::jsonb;
  unit_types jsonb := '{
    "Registry": "Directorate",
    "Bursary": "Directorate",
    "Academic Planning": "Directorate",
    "DICT (ICT Directorate)": "Directorate",
    "Health Services (Clinic/Medical Centre)": "Clinic",
    "IPO": "Office",
    "Physical Planning": "Directorate",
    "Security Unit": "Office",
    "Student Affairs": "Directorate",
    "Library": "Other",
    "Sports Complex": "Other",
    "Works & Maintenance": "Directorate",
    "Staff Quarters/Housing": "Other",
    "Transport Unit": "Office",
    "Guest House/Hostels": "Other",
    "Central Administration/VC''s Office": "Office"
  }'::jsonb;
  fac text;
  dept text;
  unit_name text;
begin
  select id into v_campus from public.campuses where name = 'Keffi (Main)';

  -- Faculties + their departments
  foreach fac in array faculties loop
    select id into v_parent from public.org_units
     where name = fac and parent_id is null and campus_id = v_campus;
    if v_parent is null then
      insert into public.org_units (parent_id, campus_id, name, unit_type)
      values (null, v_campus, fac, 'Faculty') returning id into v_parent;
    end if;

    for dept in select jsonb_array_elements_text(depts -> fac) loop
      if not exists (select 1 from public.org_units where name = dept and parent_id = v_parent) then
        insert into public.org_units (parent_id, campus_id, name, unit_type)
        values (v_parent, v_campus, dept, 'Department');
      end if;
    end loop;
  end loop;

  -- Non-academic units (top level, equal priority)
  for unit_name in select jsonb_object_keys(nonacademic) loop
    select id into v_parent from public.org_units
     where name = unit_name and parent_id is null and campus_id = v_campus;
    if v_parent is null then
      insert into public.org_units (parent_id, campus_id, name, unit_type)
      values (null, v_campus, unit_name, coalesce(unit_types ->> unit_name, 'Other'))
      returning id into v_parent;
    end if;

    for dept in select jsonb_array_elements_text(nonacademic -> unit_name) loop
      if not exists (select 1 from public.org_units where name = dept and parent_id = v_parent) then
        insert into public.org_units (parent_id, campus_id, name, unit_type)
        values (v_parent, v_campus, dept, 'Office');
      end if;
    end loop;
  end loop;
end $$;
