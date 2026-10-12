-- Staff replace photos by uploading a new UUID object and updating the scoped
-- asset record. Overwriting or deleting existing objects is administrative:
-- an upload's original owner may no longer have access after an asset transfer.
-- Public photo reads and ordinary new uploads remain compatible with the app.
alter policy "asset photos authenticated update" on storage.objects
  using (bucket_id = 'asset-photos' and public.is_admin())
  with check (bucket_id = 'asset-photos' and public.is_admin());

alter policy "asset photos authenticated delete" on storage.objects
  using (bucket_id = 'asset-photos' and public.is_admin());
