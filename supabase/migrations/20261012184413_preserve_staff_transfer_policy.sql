-- Retain the existing destination behavior while enforcing the new role guard.
alter policy assets_update on public.assets with check(public.can_write_assets());
