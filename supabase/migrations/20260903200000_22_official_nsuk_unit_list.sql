-- The University's official unit list
--
-- Source: 'Nasarawa State University, Keffi -- Arrangement of Assets Register',
-- issued by the Fixed Assets Unit to the Head of the Procurement Unit through
-- the Bursar. Six pages, 22 numbered sections. This replaces the structure the
-- system was seeded with, which was invented to have something to build against
-- and never matched the University.
--
-- Section 20, 'Property Plant and Equipment', is deliberately absent. It lists
-- generators, a water pump and a water tank: those are assets to be recorded
-- and labelled, not places that hold assets, and making them units would file
-- equipment inside other equipment.
--
-- Departments the document marks 'Proposed New' are included as ordinary
-- departments, at the University's instruction. They hold nothing until they
-- open.
--
-- Safe only while the register is empty, which is checked below: every asset
-- code is built from the unit it belongs to, so rearranging units after items
-- are labelled would mean relabelling them.

do $$
declare
  v_keffi uuid; v_lafia uuid; v_gudi uuid; v_pyanku uuid;
  v_root uuid; v_dept uuid;
  v_assets integer;
begin
  select count(*) into v_assets from public.assets;
  if v_assets > 0 then
    raise exception
      'The register already holds % asset(s). Replacing the unit tree now would orphan their asset codes -- every code carries the unit it was issued under. Move or retire those assets first.',
      v_assets;
  end if;

  select id into strict v_keffi  from public.campuses where name = 'Keffi (Main)';
  select id into strict v_lafia  from public.campuses where name = 'Lafia';
  select id into strict v_gudi   from public.campuses where name = 'Gudi';
  select id into strict v_pyanku from public.campuses where name = 'Pyanku';

  -- Children cascade, so this clears the whole seeded tree. user_units
  -- cascades with it; no staff account is assigned to a unit today.
  delete from public.org_units;

  -- Vice-Chancellor's Office and Offices Under
  insert into public.org_units (parent_id, campus_id, name, unit_type, short_code)
       values (null, v_keffi, 'Vice-Chancellor''s Office and Offices Under', 'Directorate', null)
    returning id into v_root;
  insert into public.org_units (parent_id, campus_id, name, unit_type, short_code) values
    (v_root, v_keffi, 'DVC Academic Office', 'Office', 'DVA'),
    (v_root, v_keffi, 'DVC Administration Office', 'Office', 'DVM'),
    (v_root, v_keffi, 'DVC Research, Innovations and Linkages Office', 'Office', null),
    (v_root, v_keffi, 'Internal Audit Unit', 'Office', null),
    (v_root, v_keffi, 'Directorate of Academic Planning', 'Directorate', null),
    (v_root, v_keffi, 'Directorate of Linkages', 'Directorate', null),
    (v_root, v_keffi, 'Information and Protocol Unit', 'Office', null),
    (v_root, v_keffi, 'Procurement Unit', 'Office', null),
    (v_root, v_keffi, 'Open Distance e-learning Centre', 'Centre', null),
    (v_root, v_keffi, 'Data Protection Office', 'Office', null),
    (v_root, v_keffi, 'Career Service Development Centre', 'Centre', null),
    (v_root, v_keffi, 'Security Unit', 'Office', null),
    (v_root, v_keffi, 'Directorate of Physical Planning & Development', 'Directorate', null),
    (v_root, v_keffi, 'Directorate of Quality Assurance', 'Directorate', null),
    (v_root, v_keffi, 'Centre for Cyberspace Studies', 'Centre', null),
    (v_root, v_keffi, 'Students'' Affairs Division', 'Office', null),
    (v_root, v_keffi, 'Health Services Department (Clinic)', 'Clinic', null),
    (v_root, v_keffi, 'Works and Maintenance Department', 'Department', null),
    (v_root, v_keffi, 'Centre for Gender Studies', 'Centre', null),
    (v_root, v_keffi, 'Directorate of ICT', 'Directorate', null);

  -- Registry Department
  insert into public.org_units (parent_id, campus_id, name, unit_type, short_code)
       values (null, v_keffi, 'Registry Department', 'Directorate', null)
    returning id into v_root;
  insert into public.org_units (parent_id, campus_id, name, unit_type, short_code) values
    (v_root, v_keffi, 'Human Resource Division', 'Department', null);
  insert into public.org_units (parent_id, campus_id, name, unit_type, short_code)
       values (v_root, v_keffi, 'Academic Affairs Division', 'Department', null)
    returning id into v_dept;
  insert into public.org_units (parent_id, campus_id, name, unit_type, short_code) values
    (v_dept, v_keffi, 'Exams & Record Unit', 'Office', null),
    (v_dept, v_keffi, 'Admission Unit', 'Office', null),
    (v_dept, v_keffi, 'Senate Affairs Unit', 'Office', null),
    (v_dept, v_keffi, 'Verification & Transcript', 'Office', null);
  insert into public.org_units (parent_id, campus_id, name, unit_type, short_code)
       values (v_root, v_keffi, 'Council Affairs Division', 'Department', null)
    returning id into v_dept;
  insert into public.org_units (parent_id, campus_id, name, unit_type, short_code) values
    (v_dept, v_keffi, 'Policy & Documentation Unit', 'Office', null),
    (v_dept, v_keffi, 'Council Committee Unit', 'Office', null);
  insert into public.org_units (parent_id, campus_id, name, unit_type, short_code)
       values (v_root, v_keffi, 'General Administration Division', 'Department', null)
    returning id into v_dept;
  insert into public.org_units (parent_id, campus_id, name, unit_type, short_code) values
    (v_dept, v_keffi, 'Data & Statistic', 'Office', null),
    (v_dept, v_keffi, 'Housing & Passage Unit', 'Office', null),
    (v_dept, v_keffi, 'Alumni Affairs Unit', 'Office', null),
    (v_dept, v_keffi, 'Legal Affair Unit', 'Office', null);

  -- Bursary Department
  insert into public.org_units (parent_id, campus_id, name, unit_type, short_code)
       values (null, v_keffi, 'Bursary Department', 'Directorate', null)
    returning id into v_root;
  insert into public.org_units (parent_id, campus_id, name, unit_type, short_code) values
    (v_root, v_keffi, 'Bursar''s Office', 'Office', null),
    (v_root, v_keffi, 'Secretary''s Office', 'Office', null),
    (v_root, v_keffi, 'Final Account', 'Office', 'FNA'),
    (v_root, v_keffi, 'Reconciliation Unit', 'Office', null),
    (v_root, v_keffi, 'Expenditure Unit', 'Office', null),
    (v_root, v_keffi, 'Loans and Advances Unit', 'Office', null),
    (v_root, v_keffi, 'Students'' Account Unit', 'Office', null),
    (v_root, v_keffi, 'Fixed Assets Unit', 'Office', 'FXA'),
    (v_root, v_keffi, 'Stores Unit', 'Office', null),
    (v_root, v_keffi, 'Cash Office Unit', 'Office', null),
    (v_root, v_keffi, 'Payroll Unit', 'Office', null),
    (v_root, v_keffi, 'Conference Room', 'Other', null);

  -- University Library
  insert into public.org_units (parent_id, campus_id, name, unit_type, short_code)
       values (null, v_keffi, 'University Library', 'Directorate', null)
    returning id into v_root;
  insert into public.org_units (parent_id, campus_id, name, unit_type, short_code) values
    (v_root, v_keffi, 'Library, Main Campus Keffi', 'Other', null),
    (v_root, v_pyanku, 'Library, Pyanku Campus', 'Other', null),
    (v_root, v_lafia, 'Library, Faculty of Agriculture Lafia Campus', 'Other', null),
    (v_root, v_keffi, 'E-Library', 'Other', null),
    (v_root, v_keffi, 'Research & Bibliography Service Division', 'Department', null),
    (v_root, v_keffi, 'Circulation Unit', 'Office', null),
    (v_root, v_keffi, 'Reference Service', 'Office', null),
    (v_root, v_keffi, 'Discussion Area', 'Other', null),
    (v_root, v_keffi, 'Research Carrels', 'Other', null),
    (v_root, v_keffi, 'Reading Area', 'Other', null),
    (v_root, v_keffi, 'E-Library Training Office', 'Office', null);

  -- Faculty of Administration
  insert into public.org_units (parent_id, campus_id, name, unit_type, short_code)
       values (null, v_keffi, 'Faculty of Administration', 'Faculty', null)
    returning id into v_root;
  insert into public.org_units (parent_id, campus_id, name, unit_type, short_code) values
    (v_root, v_keffi, 'Department of Accounting', 'Department', null),
    (v_root, v_keffi, 'Department of Banking & Finance', 'Department', null),
    (v_root, v_keffi, 'Department of Business Administration', 'Department', null),
    (v_root, v_keffi, 'Department of Entrepreneurship', 'Department', null),
    (v_root, v_keffi, 'Department of Public Administration', 'Department', null),
    (v_root, v_keffi, 'Department of Taxation', 'Department', null),
    (v_root, v_keffi, 'Security & Investment Management', 'Department', null),
    (v_root, v_keffi, 'Department of Marketing', 'Department', null),
    (v_root, v_keffi, 'Professorial Building', 'Other', null),
    (v_root, v_keffi, 'Governmental and Financial Accounting Research (ANAN Building)', 'Other', null);

  -- Faculty of Agriculture
  insert into public.org_units (parent_id, campus_id, name, unit_type, short_code)
       values (null, v_lafia, 'Faculty of Agriculture', 'Faculty', null)
    returning id into v_root;
  insert into public.org_units (parent_id, campus_id, name, unit_type, short_code) values
    (v_root, v_lafia, 'Dean''s Office', 'Office', null),
    (v_root, v_lafia, 'Secretary''s Office', 'Office', null),
    (v_root, v_lafia, 'Department of Aquaculture of Fisheries', 'Department', null),
    (v_root, v_lafia, 'Department of Agronomy', 'Department', null),
    (v_root, v_lafia, 'Department of Economics and Extension', 'Department', null),
    (v_root, v_lafia, 'Department of Forestry & Wildlife Studies', 'Department', null),
    (v_root, v_lafia, 'Department of Home Science Management', 'Department', null),
    (v_root, v_lafia, 'Department of Nutrition and Dietetics', 'Department', null);

  -- Faculty of Arts
  insert into public.org_units (parent_id, campus_id, name, unit_type, short_code)
       values (null, v_keffi, 'Faculty of Arts', 'Faculty', null)
    returning id into v_root;
  insert into public.org_units (parent_id, campus_id, name, unit_type, short_code) values
    (v_root, v_keffi, 'Department of Arabic Studies', 'Department', null),
    (v_root, v_keffi, 'Department of English Language', 'Department', null),
    (v_root, v_keffi, 'Department of French', 'Department', null),
    (v_root, v_keffi, 'Department of History', 'Department', null),
    (v_root, v_keffi, 'Department of Islamic Studies', 'Department', null),
    (v_root, v_keffi, 'Department of Language of Linguistics', 'Department', null),
    (v_root, v_keffi, 'Department of Art Annex', 'Department', null);

  -- Faculty of Social Sciences
  insert into public.org_units (parent_id, campus_id, name, unit_type, short_code)
       values (null, v_keffi, 'Faculty of Social Sciences', 'Faculty', null)
    returning id into v_root;
  insert into public.org_units (parent_id, campus_id, name, unit_type, short_code) values
    (v_root, v_keffi, 'Department of Economics', 'Department', null),
    (v_root, v_keffi, 'Department of Political Science', 'Department', null),
    (v_root, v_keffi, 'Department of Psychology', 'Department', null),
    (v_root, v_keffi, 'Department of Sociology', 'Department', null);

  -- Faculty of Natural and Applied Sciences
  insert into public.org_units (parent_id, campus_id, name, unit_type, short_code)
       values (null, v_keffi, 'Faculty of Natural and Applied Sciences', 'Faculty', null)
    returning id into v_root;
  insert into public.org_units (parent_id, campus_id, name, unit_type, short_code) values
    (v_root, v_keffi, 'Department of Geology and Mining', 'Department', null),
    (v_root, v_keffi, 'Department of Mathematics', 'Department', null),
    (v_root, v_keffi, 'Department of Microbiology', 'Department', null),
    (v_root, v_keffi, 'Department of Chemistry', 'Department', null),
    (v_root, v_keffi, 'Department of Zoology', 'Department', null),
    (v_root, v_keffi, 'Department of Physics', 'Department', null),
    (v_root, v_keffi, 'Department of Biochemistry and Molecular Biology', 'Department', null),
    (v_root, v_keffi, 'Department of Plant Science', 'Department', null),
    (v_root, v_keffi, 'Department of Statistics', 'Department', null),
    (v_root, v_keffi, 'Department of Computer Science', 'Department', null);

  -- Faculty of Education
  insert into public.org_units (parent_id, campus_id, name, unit_type, short_code)
       values (null, v_keffi, 'Faculty of Education', 'Faculty', null)
    returning id into v_root;
  insert into public.org_units (parent_id, campus_id, name, unit_type, short_code) values
    (v_root, v_keffi, 'Department of Educational Management', 'Department', null),
    (v_root, v_keffi, 'Department of Science Education', 'Department', null),
    (v_root, v_keffi, 'Department of Educational Foundation', 'Department', null),
    (v_root, v_keffi, 'Department of Guidance and Counselling', 'Department', null);

  -- Faculty of Law
  insert into public.org_units (parent_id, campus_id, name, unit_type, short_code)
       values (null, v_keffi, 'Faculty of Law', 'Faculty', null)
    returning id into v_root;
  insert into public.org_units (parent_id, campus_id, name, unit_type, short_code) values
    (v_root, v_keffi, 'Dean Office', 'Office', null),
    (v_root, v_keffi, 'Law Auditorium', 'Other', null),
    (v_root, v_keffi, 'Law Moot Court Office', 'Office', null),
    (v_root, v_keffi, 'Judges Chamber', 'Other', null),
    (v_root, v_keffi, 'Serial Unit', 'Office', null),
    (v_root, v_keffi, 'Circulation Unit', 'Office', null);

  -- Faculty of Communication and Media Studies
  insert into public.org_units (parent_id, campus_id, name, unit_type, short_code)
       values (null, v_keffi, 'Faculty of Communication and Media Studies', 'Faculty', null)
    returning id into v_root;
  insert into public.org_units (parent_id, campus_id, name, unit_type, short_code) values
    (v_root, v_keffi, 'Department of Journalism and Media Studies', 'Department', null),
    (v_root, v_keffi, 'Department of Public Relation and Media Studies', 'Department', null),
    (v_root, v_keffi, 'Department of Broadcasting and Media Studies', 'Department', null),
    (v_root, v_keffi, 'Department of Mass Communication', 'Department', null);

  -- Faculty of Environmental Science
  insert into public.org_units (parent_id, campus_id, name, unit_type, short_code)
       values (null, v_keffi, 'Faculty of Environmental Science', 'Faculty', null)
    returning id into v_root;
  insert into public.org_units (parent_id, campus_id, name, unit_type, short_code) values
    (v_root, v_keffi, 'Dean and Secretary Office', 'Office', null),
    (v_root, v_keffi, 'Board Room', 'Other', null),
    (v_root, v_keffi, 'Department of Geography', 'Department', null),
    (v_root, v_keffi, 'Department of Environment Management', 'Department', null),
    (v_root, v_keffi, 'Earth Science Lab', 'Other', null),
    (v_root, v_keffi, 'Department of Urban and Regional Planning', 'Department', null);

  -- Post Graduate School
  insert into public.org_units (parent_id, campus_id, name, unit_type, short_code)
       values (null, v_keffi, 'Post Graduate School', 'School', null)
    returning id into v_root;
  insert into public.org_units (parent_id, campus_id, name, unit_type, short_code) values
    (v_root, v_keffi, 'Dean and Secretary Office', 'Office', null),
    (v_root, v_keffi, 'Accountant Office', 'Office', null),
    (v_root, v_keffi, 'Deputy Dean Office', 'Office', null),
    (v_root, v_keffi, 'Board Room', 'Other', null),
    (v_root, v_keffi, 'SPGS Auditorium', 'Other', null);

  -- Faculty of Engineering
  insert into public.org_units (parent_id, campus_id, name, unit_type, short_code)
       values (null, v_gudi, 'Faculty of Engineering', 'Faculty', null)
    returning id into v_root;
  insert into public.org_units (parent_id, campus_id, name, unit_type, short_code) values
    (v_root, v_gudi, 'Dean Office', 'Office', null),
    (v_root, v_gudi, 'Secretary to Dean Office', 'Office', null),
    (v_root, v_gudi, 'Department of Mechanical Engineering', 'Department', null),
    (v_root, v_gudi, 'Department of Mining Engineering', 'Department', null);
  insert into public.org_units (parent_id, campus_id, name, unit_type, short_code)
       values (v_root, v_gudi, 'Department of Chemical Engineering', 'Department', null)
    returning id into v_dept;
  insert into public.org_units (parent_id, campus_id, name, unit_type, short_code) values
    (v_dept, v_gudi, 'HOD and Staff Offices', 'Office', null),
    (v_dept, v_gudi, 'Chemical Engineering Workshop', 'Other', 'CHW'),
    (v_dept, v_gudi, 'Chemical Engineering Laboratory', 'Other', 'CHL');
  insert into public.org_units (parent_id, campus_id, name, unit_type, short_code)
       values (v_root, v_gudi, 'Department of Civil Engineering', 'Department', null)
    returning id into v_dept;
  insert into public.org_units (parent_id, campus_id, name, unit_type, short_code) values
    (v_dept, v_gudi, 'Civil Engineering Workshop', 'Other', 'CVW'),
    (v_dept, v_gudi, 'Civil Engineering Laboratory', 'Other', 'CVL');
  insert into public.org_units (parent_id, campus_id, name, unit_type, short_code)
       values (v_root, v_gudi, 'Department of Electrical Electronic', 'Department', null)
    returning id into v_dept;
  insert into public.org_units (parent_id, campus_id, name, unit_type, short_code) values
    (v_dept, v_gudi, 'Electrical Electronic Workshop', 'Other', null),
    (v_dept, v_gudi, 'Electrical Electronic Laboratory', 'Other', null),
    (v_dept, v_gudi, 'General Laboratory', 'Other', null),
    (v_dept, v_gudi, 'Nida Laboratory', 'Other', null),
    (v_dept, v_gudi, 'ICT', 'Office', null),
    (v_dept, v_gudi, 'Clinic', 'Clinic', null);

  -- Faculty of Allied Health Science
  insert into public.org_units (parent_id, campus_id, name, unit_type, short_code)
       values (null, v_keffi, 'Faculty of Allied Health Science', 'Faculty', null)
    returning id into v_root;
  insert into public.org_units (parent_id, campus_id, name, unit_type, short_code) values
    (v_root, v_keffi, 'Department of Nutrition and Dietetics', 'Department', null),
    (v_root, v_keffi, 'Department of Environmental Health Science', 'Department', null),
    (v_root, v_keffi, 'Department of Community Health', 'Department', null),
    (v_root, v_keffi, 'Department of Health Information Management', 'Department', null),
    (v_root, v_keffi, 'Department of Public Health', 'Department', null),
    (v_root, v_keffi, 'Department of Nursing', 'Department', null),
    (v_root, v_keffi, 'Department of Human Anatomy', 'Department', null),
    (v_root, v_keffi, 'Department of Radiography', 'Department', null),
    (v_root, v_keffi, 'Department of Medical Biochemistry', 'Department', null);

  -- Lands and Building
  insert into public.org_units (parent_id, campus_id, name, unit_type, short_code)
       values (null, v_keffi, 'Lands and Building', 'Directorate', null)
    returning id into v_root;
  insert into public.org_units (parent_id, campus_id, name, unit_type, short_code) values
    (v_root, v_keffi, 'Main Campus Quarters', 'Other', null),
    (v_root, v_lafia, 'Faculty of Agriculture Lafia Campus Building & Land', 'Other', null),
    (v_root, v_pyanku, 'Pyanku Campus Building & Land', 'Other', null),
    (v_root, v_gudi, 'Faculty of Engineering Gudi Campus Building & Land', 'Other', null),
    (v_root, v_keffi, 'Professorial Building', 'Other', null),
    (v_root, v_keffi, 'Nasarawa Foundation', 'Other', null),
    (v_root, v_keffi, 'Hostels in all Campus', 'Other', null),
    (v_root, v_keffi, 'Government and Financial Accounting Research (ANAN Building)', 'Other', null),
    (v_root, v_keffi, 'All Classes in All Campus', 'Other', null);

  -- NSUK Consult
  insert into public.org_units (parent_id, campus_id, name, unit_type, short_code)
       values (null, v_keffi, 'NSUK Consult', 'Directorate', null)
    returning id into v_root;
  insert into public.org_units (parent_id, campus_id, name, unit_type, short_code) values
    (v_root, v_keffi, 'Director''s Office', 'Office', null),
    (v_root, v_keffi, 'Administrative Manager', 'Office', null),
    (v_root, v_keffi, 'Account Office', 'Office', null),
    (v_root, v_keffi, 'Production Manager''s Office', 'Office', null),
    (v_root, v_keffi, 'Production Unit / Sachet & Bottled Water', 'Other', null);

  -- Global Health and Infectious Disease Institute
  insert into public.org_units (parent_id, campus_id, name, unit_type, short_code)
       values (null, v_keffi, 'Global Health and Infectious Disease Institute', 'Directorate', null)
    returning id into v_root;
  insert into public.org_units (parent_id, campus_id, name, unit_type, short_code) values
    (v_root, v_keffi, 'Director''s Office', 'Office', null),
    (v_root, v_keffi, 'Secretary''s Office', 'Office', null),
    (v_root, v_keffi, 'Laboratory', 'Other', null),
    (v_root, v_keffi, 'Department of Public Health', 'Department', null),
    (v_root, v_keffi, 'Department of Epidemiology', 'Department', null),
    (v_root, v_keffi, 'Department of Environmental and Occupational Health', 'Department', null),
    (v_root, v_keffi, 'Department of Clinical Microbiology and Infection Disease', 'Department', null),
    (v_root, v_keffi, 'Department of Health Economic Management and Policy', 'Department', null),
    (v_root, v_keffi, 'Department of Public and Sanitary Microbiology', 'Department', null),
    (v_root, v_keffi, 'Department of Molecular Biology', 'Department', null);

end $$;

-- Two units under one faculty whose names reduce to the same three letters
-- would issue the same asset code, and the barcode is unique, so the second
-- item simply could not be saved. Eight codes are stated above for that
-- reason; this proves none is left.
do $$
declare
  v_clash text;
begin
  -- Reads the codes as stored, which is what next_barcode reads, rather than
  -- re-deriving them: the trigger has filled in every one by now, and a stated
  -- code and a derived one have to be checked the same way.
  with recursive roots as (
    select u.id, u.id as root_id from public.org_units u where u.parent_id is null
    union all
    select c.id, r.root_id from public.org_units c join roots r on c.parent_id = r.id
  )
  select string_agg(format('%s/%s (%s)', rc, oc, names), '; ')
    into v_clash
    from (
      select top.short_code as rc, u.short_code as oc,
             string_agg(u.name, ' + ') as names
        from roots r
        join public.org_units u   on u.id = r.id
        join public.org_units top on top.id = r.root_id
       where u.parent_id is not null
       group by 1, 2
      having count(*) > 1
    ) d;

  if v_clash is not null then
    raise exception 'These units would issue identical asset codes: %', v_clash;
  end if;
end $$;
