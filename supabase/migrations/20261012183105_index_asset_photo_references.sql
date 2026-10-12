create index assets_photo_key_idx on public.assets (public.asset_photo_key(photo_url)) where photo_url is not null;
