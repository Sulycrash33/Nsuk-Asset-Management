-- A department is not its faculty, even when it abbreviates the same
--
-- next_barcode decides whether an asset was recorded straight onto a faculty
-- rather than a department beneath it, and blanks the department segment to GEN
-- when it was. It made that decision by comparing the two *codes*:
--
--     if v_top = v_self then v_self := 'GEN'; end if;
--
-- 'Department of Agronomy' reduces to AGR. So does 'Faculty of Agriculture'.
-- Agronomy was therefore treated as the faculty itself and issued
-- NSU/AGR/GEN/CP/T/001 -- the identical code the faculty issues. Barcodes are
-- unique, so whichever of the two was recorded second simply could not be
-- saved, and the officer would have seen a constraint error with no hint that
-- the cause was a three letter abbreviation.
--
-- Found by issuing a code for all 191 units and counting the distinct results:
-- 191 issued, 190 distinct. It does not show up in the derivation rules, only
-- in what they produce, which is why it survived reading the function.
--
-- The comparison is now by identity. A department whose name happens to
-- abbreviate like its faculty is still a department.

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
  v_top_id uuid;
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
  select id, coalesce(nullif(short_code, ''), 'GEN')
    into v_top_id, v_top
    from up
   order by depth desc
   limit 1;

  -- An asset recorded straight onto a faculty has no department of its own.
  -- Decided by identity: reaching the top of the climb means this unit *is*
  -- the top, which two matching codes never proved.
  if v_top_id = p_unit_id then
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

-- With the fix, Agronomy would issue NSU/AGR/AGR/... : correct and unique, but
-- it reads as though the segment were repeated by mistake. Naming it separately
-- keeps the label legible to whoever is holding the item.
update public.org_units
   set short_code = 'AGY'
 where name = 'Department of Agronomy';
