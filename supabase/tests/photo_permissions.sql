-- Run with a privileged database connection after the migration.
-- Requires an administrator and at least one photo object. All changes roll back.
-- Storage forbids direct SQL deletion, so DELETE is verified to use the same
-- predicate as the UPDATE policy exercised here. Test deletion via Storage API
-- when signed-in administrator/staff test sessions are available.
begin;
select set_config('app.photo_test_admin',
  coalesce((select id::text from public.profiles where role='admin' limit 1), ''), true);
select set_config('app.photo_test_count',
  (select count(*)::text from storage.objects where bucket_id='asset-photos'), true);
set local role authenticated;
select set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
do $$
declare affected integer;
begin
  if public.is_admin() then raise exception 'Non-admin identity unexpectedly administrative'; end if;
  with changed as (
    update storage.objects set name=name where bucket_id='asset-photos' returning id
  ) select count(*) into affected from changed;
  if affected<>0 then raise exception 'Non-admin changed % photo objects', affected; end if;
end $$;
select set_config('request.jwt.claim.sub', current_setting('app.photo_test_admin'), true);
do $$
declare affected integer; expected integer := current_setting('app.photo_test_count')::integer;
begin
  if not public.is_admin() then raise exception 'Fixture requires an administrator'; end if;
  if expected=0 then raise exception 'Fixture requires an existing photo object'; end if;
  with changed as (
    update storage.objects set name=name where bucket_id='asset-photos' returning id
  ) select count(*) into affected from changed;
  if affected<>expected then raise exception 'Admin expected % accessible objects, got %', expected, affected; end if;
  if (select qual from pg_policies where schemaname='storage' and tablename='objects'
      and policyname='asset photos authenticated delete') is distinct from
     (select qual from pg_policies where schemaname='storage' and tablename='objects'
      and policyname='asset photos authenticated update') then
    raise exception 'Delete predicate differs from tested update predicate';
  end if;
  if (select with_check from pg_policies where schemaname='storage' and tablename='objects'
      and policyname='asset photos authenticated update') is distinct from
     (select qual from pg_policies where schemaname='storage' and tablename='objects'
      and policyname='asset photos authenticated update') then
    raise exception 'Update destination check differs from access predicate';
  end if;
end $$;
rollback;
