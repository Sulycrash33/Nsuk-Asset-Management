-- The login screen has to render the campus dropdown before anyone is signed
-- in, so the campus list must be readable by the anon role. Campus names are
-- public information (Keffi, Lafia, Gudi, Pyanku); nothing else is exposed.
drop policy if exists campuses_read_anon on public.campuses;
create policy campuses_read_anon on public.campuses
  for select to anon using (true);
