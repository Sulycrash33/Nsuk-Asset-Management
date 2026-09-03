-- Pin the search_path on the asset-code functions
--
-- The Supabase advisor flagged these three after migration 19 added them:
-- they resolve names against whatever search_path the caller happens to have.
--
-- None is SECURITY DEFINER, so this is not the privilege escalation the same
-- warning means on a definer function -- they run as the caller either way.
-- It is still worth closing. org_units_set_short_code is a trigger, so it runs
-- inside whatever transaction touches org_units and calls derive_short_code by
-- name; pinning the path means that call cannot be pointed somewhere else by
-- arranging the session first. And an advisor with three standing warnings on
-- it is one where the fourth, which might matter, is easy to miss.
--
-- Altered rather than recreated: the bodies are already correct and every name
-- inside them is either fully qualified or a built-in, so there is nothing to
-- change but the setting. `public` rather than `''` to match needs_bootstrap
-- and the other hardened functions in this schema.

alter function public.derive_short_code(text) set search_path = public;
alter function public.org_units_set_short_code() set search_path = public;
alter function public.asset_code_segment() set search_path = public;
