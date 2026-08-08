-- Pin search_path on the remaining functions.
alter function public.generate_unit_code(text) set search_path = public;
alter function public.org_units_set_code() set search_path = public;
alter function public.assets_before_update() set search_path = public;

-- Trigger functions fire as the table owner and never need to be reachable
-- through PostgREST, so take them off the exposed RPC surface entirely.
revoke all on function public.org_units_set_code() from public, anon, authenticated;
revoke all on function public.assets_before_insert() from public, anon, authenticated;
revoke all on function public.assets_before_update() from public, anon, authenticated;
revoke all on function public.assets_audit() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- next_barcode consumes a sequence number; only the insert trigger may call it.
revoke all on function public.next_barcode(uuid) from public, anon, authenticated;
revoke all on function public.generate_unit_code(text) from public, anon, authenticated;

-- Scope helpers are evaluated inside RLS policies as the calling role, so
-- signed-in users need EXECUTE — but anonymous visitors do not.
revoke all on function public.is_admin() from public, anon;
revoke all on function public.my_unit_ids() from public, anon;
revoke all on function public.can_access_unit(uuid) from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.my_unit_ids() to authenticated;
grant execute on function public.can_access_unit(uuid) to authenticated;

-- Transfers run as the caller, so RLS still decides what may move.
revoke all on function public.move_asset(uuid, uuid, text) from public, anon;
grant execute on function public.move_asset(uuid, uuid, text) to authenticated;

-- needs_bootstrap is deliberately public: the login screen calls it signed out.
revoke all on function public.needs_bootstrap() from public;
grant execute on function public.needs_bootstrap() to anon, authenticated;
