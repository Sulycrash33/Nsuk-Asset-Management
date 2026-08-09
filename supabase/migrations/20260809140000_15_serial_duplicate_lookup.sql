-- Catching a repeated serial number regardless of how it was typed -----------
--
-- Comparing serials as stored misses the common case: the register holds
-- 'SN-ABC-001' and the spreadsheet says 'sn-abc-001'. Those are the same
-- physical item, and letting the second one through is precisely the fault
-- duplicate detection exists to prevent. Confirmed against the database before
-- this was written: an exact-case lookup found only one of two known matches.

create index if not exists assets_serial_lower_idx
  on public.assets (lower(serial_number))
  where serial_number is not null;

-- Returns only the serial numbers the caller already asked about, and nothing
-- else about the assets carrying them. Elevated on purpose: a duplicate serial
-- in a unit the caller cannot see is still a duplicate, and the register is
-- wrong either way. The disclosure is limited to "this serial exists", which
-- the caller is holding in their own file already.
create or replace function public.existing_serial_numbers(p_serials text[])
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select distinct lower(a.serial_number)
    from public.assets a
   where a.serial_number is not null
     and lower(a.serial_number) = any (
           array(select lower(s) from unnest(p_serials) as s where s is not null)
         );
$$;

revoke all on function public.existing_serial_numbers(text[]) from public, anon;
grant execute on function public.existing_serial_numbers(text[]) to authenticated;
