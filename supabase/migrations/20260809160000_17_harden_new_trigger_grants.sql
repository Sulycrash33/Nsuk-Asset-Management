-- Trigger functions have no business on the public API -----------------------
--
-- An earlier migration revoked the trigger functions that existed then. Three
-- added since were never covered, so they sat on the REST surface callable by
-- anyone, signed in or not:
--
--   assets_rollup                keeps the per-unit totals
--   protect_last_administrator   refuses removal of the last administrator
--   protect_role_escalation      refuses a role change by a non-administrator
--
-- Calling one directly fails because it needs trigger context, so nothing was
-- exploitable, but a function meant only for the database should not be
-- reachable from the internet at all. Found by the database linter during a
-- full test pass. Confirmed afterwards that the triggers still fire: inserting
-- an asset still moved the unit total and still wrote its audit row.
revoke all on function public.assets_rollup() from public, anon, authenticated;
revoke all on function public.protect_last_administrator() from public, anon, authenticated;
revoke all on function public.protect_role_escalation() from public, anon, authenticated;

-- rebuild_unit_asset_stats is an administrative repair tool, not an API.
revoke all on function public.rebuild_unit_asset_stats() from public, anon, authenticated;
