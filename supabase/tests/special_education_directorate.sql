-- Special Education is a top-level directorate on Keffi (Main) with the
-- Center for Disability Studies and Support Services under it, and the codes
-- it issues are its own. Issues codes as the owner; rolls back.
begin;
do $$
declare v_root public.org_units; v_center public.org_units; oe uuid; c1 text; c2 text; c3 text;
begin
 select * into strict v_root from public.org_units where parent_id is null and name='Special Education';
 select * into strict v_center from public.org_units where parent_id=v_root.id and name='Center for Disability Studies and Support Services';
 if v_root.unit_type<>'Directorate' or v_root.short_code<>'SPE' then raise exception 'Directorate wrong: %',to_jsonb(v_root); end if;
 if v_center.unit_type<>'Centre' or v_center.short_code<>'DSS' or v_center.campus_id<>v_root.campus_id then raise exception 'Center wrong: %',to_jsonb(v_center); end if;
 if (select name from public.campuses where id=v_root.campus_id)<>'Keffi (Main)' then raise exception 'Not on Keffi (Main)'; end if;
 if (select count(*) from public.org_units where parent_id is null and short_code='SPE')<>1 then raise exception 'SPE is shared by two top units'; end if;

 select id into oe from public.asset_categories where code='OE' and active;
 c1:=public.next_barcode(v_center.id,oe);
 c2:=public.next_barcode(v_center.id,oe);
 c3:=public.next_barcode(v_root.id,oe);
 if c1<>'NSU/SPE/DSS/OE/001' or c2<>'NSU/SPE/DSS/OE/002' or c3<>'NSU/SPE/GEN/OE/001' then raise exception 'Codes: %, %, %',c1,c2,c3; end if;
 if exists(select 1 from public.assets where barcode in(c1,c2,c3)) then raise exception 'A code is already in use'; end if;
end $$;
select 'special education directorate assertions passed' as result;
rollback;
