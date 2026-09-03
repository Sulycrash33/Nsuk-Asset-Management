-- Cover the two verification foreign keys
--
-- Both are declared `on delete set null`, which is the case where a missing
-- index actually costs something. Postgres has to find every child row pointing
-- at the row being deleted before it can null them, and with no index that is a
-- sequential scan of the whole child table, once per deleted row.
--
--   verification_scans.asset_id -> assets(id)
--     Deleting one asset scans every verification scan ever recorded. That
--     table grows by a row per scan, so the cost of retiring an asset climbs
--     with the amount of verification work the University has done -- which is
--     backwards.
--
--   verification_sessions.started_by -> profiles(id)
--     Deleting a staff account scans every session. Smaller, but this column is
--     also read directly: the account page counts what you have verified with
--     `.eq('started_by', ...)` on every visit, and that has been a sequential
--     scan since the page was written.
--
-- Partial, because both columns are nullable and the null rows are never what
-- is being looked for. A scan of a barcode that matched nothing holds a null
-- asset_id, and there will be plenty of those; a session whose owner has been
-- deleted holds a null started_by. Foreign key enforcement and the account page
-- both search for a specific id, and `col = <id>` cannot match a null, so the
-- smaller index answers every question the full one would.

create index if not exists verification_scans_asset_idx
  on public.verification_scans (asset_id)
  where asset_id is not null;

create index if not exists verification_sessions_started_by_idx
  on public.verification_sessions (started_by)
  where started_by is not null;
