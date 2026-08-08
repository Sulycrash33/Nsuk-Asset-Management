insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('asset-photos', 'asset-photos', true, 10485760,
        array['image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "asset photos public read" on storage.objects;
create policy "asset photos public read" on storage.objects
  for select using (bucket_id = 'asset-photos');

drop policy if exists "asset photos authenticated write" on storage.objects;
create policy "asset photos authenticated write" on storage.objects
  for insert to authenticated with check (bucket_id = 'asset-photos');

drop policy if exists "asset photos authenticated update" on storage.objects;
create policy "asset photos authenticated update" on storage.objects
  for update to authenticated using (bucket_id = 'asset-photos');

drop policy if exists "asset photos authenticated delete" on storage.objects;
create policy "asset photos authenticated delete" on storage.objects
  for delete to authenticated using (bucket_id = 'asset-photos');
