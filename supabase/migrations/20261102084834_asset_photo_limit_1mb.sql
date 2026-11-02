-- The app reduces every photo to about 300 KB before upload, so 1 MB leaves
-- room to spare while refusing a full-size camera file sent around the app.
update storage.buckets set file_size_limit = 1048576 where id = 'asset-photos';
