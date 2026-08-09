-- The sign-in screen used to ask staff which campus they belonged to, which
-- meant the campus list had to be readable before signing in. The campus is now
-- set when the account is created, so the screen no longer asks and nothing
-- outside the system needs that list. Closing it again keeps the surface
-- reachable without an account down to what actually has to be there.
--
-- Verified afterwards: no table in the public schema carries a policy granting
-- anon or public any access at all.
drop policy if exists campuses_read_anon on public.campuses;
