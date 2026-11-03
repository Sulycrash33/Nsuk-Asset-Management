-- Run with a privileged database connection after the migration.
-- Requires an administrator and at least one photo object. All changes roll back.
-- UPDATE stays administrator-only. DELETE has its own rule since replaced
-- photos can be removed by whoever may edit the asset (see
-- replaced_photo_removal.sql, which exercises it); here it is only checked to
-- be that rule.
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
      and policyname='asset photos authenticated delete')
     <> '((bucket_id = ''asset-photos''::text) AND can_remove_asset_photo(name))' then
    raise exception 'Delete policy is not the replaced-photo removal rule';
  end if;
  if not public.can_remove_asset_photo((select name from storage.objects where bucket_id='asset-photos' limit 1)) then
    raise exception 'Administrator may not remove a photo';
  end if;
  if (select with_check from pg_policies where schemaname='storage' and tablename='objects'
      and policyname='asset photos authenticated update') is distinct from
     (select qual from pg_policies where schemaname='storage' and tablename='objects'
      and policyname='asset photos authenticated update') then
    raise exception 'Update destination check differs from access predicate';
  end if;
end $$;
rollback;
