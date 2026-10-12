# NSUK operations and recovery

## Setup and release checks

Use Node 24 and install the committed dependencies with `npm ci`. Set the public Supabase URL/key
and the server-only service role key from `.env.example`. Keep production credentials out of
GitHub Actions: its build uses placeholders. Configure the real project values separately for
Vercel preview and production. Set Supabase Auth site/redirect URLs for the deployed origin and
`/auth/callback`, and verify email delivery before inviting officers.

Run `npm run check`. Review the exact pull-request head's Linux check result before merging.
After deployment, verify sign-in, scoped asset lookup, entry, upload and account management on
the actual release URL. A green CI build proves compilation and automated checks; it does not
prove Vercel deployment or authenticated browser behavior. Compare applied database migration
versions with repository filenames before applying anything. Do not reapply already-recorded
migrations manually. For a fresh project, use the ordered migrations with `supabase db push`.

## Backup coverage

A usable recovery set includes database data/schema/roles, migration history, Storage object
bytes, Auth configuration, deployment environment configuration and the corresponding Git commit.
Record its timestamp, row/object counts and checksums. Store backups encrypted outside this repo,
with restricted access and a separate copy. Assign a responsible operator and retention period
before real assets are entered. This guide does not claim that a backup job or restore drill exists.

Supabase database backups exclude Storage file bytes; copy the `asset-photos` objects separately,
preserving their keys, and test that restored records can display the corresponding files.
See [Supabase backup coverage](https://supabase.com/docs/guides/platform/backups).

For a logical backup, install the Supabase CLI and Docker, then follow the
[official backup/restore guide](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).
From a protected backup directory, with the connection string supplied privately as `NSUK_DB_URL`:

```sh
supabase db dump --db-url "$NSUK_DB_URL" -f roles.sql --role-only
supabase db dump --db-url "$NSUK_DB_URL" -f schema.sql
supabase db dump --db-url "$NSUK_DB_URL" -f data.sql --use-copy --data-only -x "storage.buckets_vectors" -x "storage.vector_indexes"
supabase db dump --db-url "$NSUK_DB_URL" -f history_schema.sql --schema supabase_migrations
supabase db dump --db-url "$NSUK_DB_URL" -f history_data.sql --use-copy --data-only --schema supabase_migrations
```

Keep the connection string and resulting account data out of terminal transcripts, issues and PRs.
Check custom Auth triggers and Storage RLS against the repository migrations when restoring;
managed-schema customizations need special handling in the official guide.

## Recovery drill

Restore into an isolated project following the official procedure; do not overwrite production
as a rehearsal. Restore Storage bytes and configuration as part of the same drill. Verify migration
history, asset totals/value, serial uniqueness, unit scope, user sign-in and account assignments.
Test completed verification snapshots against renamed/moved/deleted fixture assets. Confirm edit
history values and photo access. Record discrepancies and elapsed recovery time. Only a successful
drill establishes a usable recovery set.

Queued scans live on each officer's device, so database backup does not cover unsent work. Keep the
original device/browser data until replay is confirmed. Use **Recover older scans** only for the
matching exercise and officer; finishing is blocked while pending work remains.

## Phone pilot before institutional rollout

Use a separate test project or clearly identified pilot records. Check camera permissions over
HTTPS, manual scanner input, repeat/unknown scans, offline queue/reconnect, account switching,
permission refusal, finish/retry and saved reports. Test failed upload and replacement, strict dates,
unknown import defaults, same-file retry, duplicates, partial failure and full Excel/PDF exports.
Verify staff cannot see or edit another unit and cannot overwrite/delete existing photo objects.
Run invitations and password changes with designated test recipients only.

SQL files in `supabase/tests/` run fixture assertions inside transactions ending in `rollback`.
Use a privileged test connection and inspect the script first. Rollback-only SQL checks do not
exercise camera hardware, email delivery, Storage HTTP behavior or simultaneous browser actions.

Depreciation, maintenance scheduling and disposal/write-off workflows remain outside this build.
