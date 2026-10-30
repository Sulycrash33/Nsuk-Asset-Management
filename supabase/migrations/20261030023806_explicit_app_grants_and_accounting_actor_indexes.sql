begin;
do $$ begin if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity) then raise exception 'Refusing grants while a public table lacks RLS'; end if; end $$;
grant select on public.profiles, public.user_units, public.campuses, public.org_units, public.asset_categories, public.assets, public.asset_logs, public.unit_asset_stats, public.verification_sessions, public.verification_scans to authenticated;
grant insert,update,delete on public.profiles, public.user_units, public.campuses, public.org_units, public.assets, public.verification_sessions, public.verification_scans to authenticated;
grant select on public.campuses to anon;
grant select,insert,update,delete on public.profiles, public.user_units, public.campuses, public.org_units, public.asset_categories, public.assets, public.asset_logs, public.unit_asset_stats, public.verification_sessions, public.verification_scans,public.accounting_events,public.accounting_policy_logs,public.accounting_reports to service_role;

-- Cover accounting audit actor foreign keys without changing financial records.
create index if not exists accounting_events_recorded_by_idx on public.accounting_events(recorded_by);
create index if not exists accounting_policy_logs_changed_by_idx on public.accounting_policy_logs(changed_by);
create index if not exists accounting_reports_created_by_idx on public.accounting_reports(created_by);
commit;

