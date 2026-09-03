-- One serial number, one asset
--
-- Duplicate detection lived only in the import screen: it asked the register
-- what it already held, then inserted. Two officers importing the same serial
-- in the same moment both passed that check and both rows went in, and the
-- single-asset form did not check at all. With ten people recording across the
-- institution at once, that is exactly how one physical item is entered twice.
--
-- Enforcing it here makes it a property of the register rather than of
-- whichever screen happened to be used. Done now because the register is still
-- empty: a unique index cannot be built over data that already holds
-- duplicates, and reconciling two records of one item after both have been
-- labelled costs far more than this does today.
--
-- Case-folded, matching existing_serial_numbers: 'SN-ABC-001' and 'sn-abc-001'
-- are the same physical item, and that is the form the duplicate usually takes.
-- Partial, because most assets have no serial at all -- furniture rarely does --
-- and a NULL must not be treated as clashing with another NULL.

-- Fail with something a person can act on, rather than the bare index error.
do $$
declare
  v_dupes text;
begin
  select string_agg(s, ', ')
    into v_dupes
    from (
      select lower(serial_number) as s
        from public.assets
       where serial_number is not null
       group by lower(serial_number)
      having count(*) > 1
       limit 20
    ) d;

  if v_dupes is not null then
    raise exception
      'Serial numbers cannot be made unique yet: the register already holds these more than once (%). Merge or correct those records, then run this migration again.',
      v_dupes;
  end if;
end $$;

create unique index if not exists assets_serial_unique_idx
  on public.assets (lower(serial_number))
  where serial_number is not null;

-- Replaces the plain lookup index on the same expression: a unique index answers
-- existing_serial_numbers just as well, and keeping both would mean maintaining
-- two copies of one thing on every write.
drop index if exists public.assets_serial_lower_idx;
