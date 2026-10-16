-- Remove the unused T segment without renumbering assets or rewriting history.
-- Collision preflight runs before any label changes; all changes are transactional.
lock table public.assets in share row exclusive mode;
do $$
begin
 if exists (
   select 1 from public.assets
   group by regexp_replace(barcode, '^(NSU/[^/]+/[^/]+/[^/]+)/T/([0-9]+)$', E'\\1/\\2')
   having count(*) > 1
 ) then
   raise exception 'Removing the T segment would produce duplicate asset tags';
 end if;
end $$;

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
      || '/' || lpad(v_seq::text, greatest(3, length(v_seq::text)), '0');
end;
$$;


-- The normal update trigger mirrors barcode to qr_payload and retains audit history.
update public.assets
set barcode=regexp_replace(barcode, '^(NSU/[^/]+/[^/]+/[^/]+)/T/([0-9]+)$', E'\\1/\\2')
where barcode ~ '^NSU/[^/]+/[^/]+/[^/]+/T/[0-9]+$';

drop function public.asset_code_segment();
