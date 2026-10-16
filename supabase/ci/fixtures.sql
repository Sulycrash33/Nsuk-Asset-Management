-- Synthetic accounts only. Run exclusively in the disposable CI Supabase stack.
-- No passwords, real recipients, production URLs or production data are used.
insert into auth.users(id,email,raw_user_meta_data)
values(gen_random_uuid(),'admin-one@example.invalid','{"name":"CI Administrator One"}'),
      (gen_random_uuid(),'admin-two@example.invalid','{"name":"CI Administrator Two"}');
update public.profiles set role='admin';

