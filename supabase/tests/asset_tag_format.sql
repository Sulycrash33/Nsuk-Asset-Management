-- Sequence and tag checks roll back without creating assets or consuming numbers.
begin;
do $$
declare u uuid; c uuid; tag text; seq integer; issued text[] := '{}';
begin
 select id into c from public.asset_categories where code='FF' and active;
 if c is null then raise exception 'Furniture classification missing'; end if;
 if exists(select 1 from public.assets where barcode ~ '^NSU/[^/]+/[^/]+/[^/]+/T/[0-9]+$') then
   raise exception 'Existing asset tags still contain the unused segment';
 end if;
 if exists(select 1 from public.assets where qr_payload<>barcode) then
   raise exception 'QR payload does not match asset tag';
 end if;
 for u in select id from public.org_units loop
   tag:=public.next_barcode(u,c);
   if tag !~ '^NSU/[^/]+/[^/]+/FF/[0-9]{3,}$' then
     raise exception 'Invalid generated tag: %',tag;
   end if;
   if tag=any(issued) then raise exception 'Tag collision: %',tag; end if;
   issued:=array_append(issued,tag);
 end loop;
 select id into u from public.org_units where name='Fixed Assets Unit' limit 1;
 update public.org_units set asset_seq=998 where id=u;
 tag:=public.next_barcode(u,c);
 if tag<>'NSU/BUR/FXA/FF/999' then raise exception 'Sequence 999 mismatch: %',tag; end if;
 tag:=public.next_barcode(u,c);
 if tag<>'NSU/BUR/FXA/FF/1000' then raise exception 'Sequence 1000 truncated: %',tag; end if;
 select asset_seq into seq from public.org_units where id=u;
 if seq<>1000 then raise exception 'Sequence not preserved'; end if;
 if has_function_privilege('authenticated','public.next_barcode(uuid,uuid)','execute')
    or has_function_privilege('anon','public.next_barcode(uuid,uuid)','execute') then
   raise exception 'Internal tag generator exposed';
 end if;
end $$;
rollback;
