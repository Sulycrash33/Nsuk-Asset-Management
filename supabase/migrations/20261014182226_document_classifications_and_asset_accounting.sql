-- Document classifications; retain inactive legacy names/codes for old records.
alter table public.asset_categories add column active boolean not null default false;
alter table public.asset_categories add column annual_rate numeric(7,4) not null default 0 check (annual_rate between 0 and 100);
alter table public.asset_categories add column measurement_model text not null default 'cost' check (measurement_model in ('cost','current_value'));
alter table public.asset_categories add column model_effective_date date;
insert into public.asset_categories(name,code,active,annual_rate) values
 ('Buildings','BD',true,2),('Plant & Machinery','PM',true,10),
 ('Furniture & Fittings','FF',true,20),('Motor Vehicles','MV',true,20),
 ('Office Equipment','OE',true,25),('Specialised Equipment','SE',true,10),
 ('IT Equipment','IT',true,33),('Library books','LB',true,10),('Infrastructure','IF',true,10)
on conflict(name) do update set active=true,annual_rate=excluded.annual_rate;
update public.assets a set category_id=c.id from public.asset_categories oldc,public.asset_categories c
where a.category_id=oldc.id and c.name=case oldc.name
 when 'Computer/IT Equipment' then 'IT Equipment' when 'Desk/Furniture' then 'Furniture & Fittings'
 when 'Vehicle' then 'Motor Vehicles' when 'Lab Equipment' then 'Specialised Equipment'
 when 'AC' then 'Plant & Machinery' when 'Generator' then 'Plant & Machinery'
 when 'Projector/AV Equipment' then 'Office Equipment' else oldc.name end and c.active;

alter table public.assets add column cost_known boolean not null default false;
alter table public.assets add column available_for_use_date date;
alter table public.assets add constraint assets_service_date check (available_for_use_date is null or acquisition_date is null or available_for_use_date>=acquisition_date);

create table public.accounting_events (
 id uuid primary key default gen_random_uuid(),
 asset_id uuid not null, -- retained even if physical record is deleted
 category_id uuid not null references public.asset_categories(id),
 effective_date date not null,
 kind text not null check(kind in ('acquisition','opening','revaluation','impairment')),
 original_cost numeric(18,2) not null check(original_cost>=0),
 gross_amount numeric(18,2) not null check(gross_amount>=0),
 depreciation_open numeric(18,2) not null default 0 check(depreciation_open>=0),
 impairment_open numeric(18,2) not null default 0 check(impairment_open>=0),
 residual_value numeric(18,2) not null default 0 check(residual_value>=0),
 annual_charge numeric(18,6) not null check(annual_charge>=0),
 charge_from date not null,
 model text not null check(model in ('cost','current_value')),
 evidence text not null,
 valuer text,
 reason text not null,
 recorded_by uuid references auth.users(id) on delete set null,
 recorded_at timestamptz not null default clock_timestamp(),
 asset_snapshot jsonb not null,
 check(gross_amount-depreciation_open-impairment_open>=residual_value),
 unique(asset_id,effective_date)
);
create index accounting_events_asset_date on public.accounting_events(asset_id,effective_date desc);
create table public.accounting_reports (
 id uuid primary key default gen_random_uuid(),
 period_end date not null unique,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 snapshot jsonb not null
);
alter table public.accounting_events enable row level security;
alter table public.accounting_reports enable row level security;
create policy accounting_events_read on public.accounting_events for select to authenticated using(public.is_admin());
create policy accounting_reports_read on public.accounting_reports for select to authenticated using(public.is_admin());
grant select on public.accounting_events,public.accounting_reports to authenticated;
revoke insert,update,delete on public.accounting_events,public.accounting_reports from anon,authenticated;

-- Actual calendar-year proration, inclusive dates; numeric arithmetic, round once.
create function public.accounting_charge(p_annual numeric,p_start date,p_end date)
returns numeric language sql immutable set search_path=public as $$
 select round(coalesce(sum(p_annual * greatest(0,least(p_end,(y+interval '1 year')::date-1)-greatest(p_start,y::date)+1)::numeric /
 ((y+interval '1 year')::date-y::date)),0),2)
 from generate_series(date_trunc('year',p_start)::timestamp,date_trunc('year',p_end)::timestamp,interval '1 year') y
$$;
revoke all on function public.accounting_charge(numeric,date,date) from public,anon,authenticated;

create function public.accounting_amount(p_event public.accounting_events,p_date date)
returns numeric language sql immutable set search_path=public as $$
 select greatest(p_event.residual_value,p_event.gross_amount-p_event.impairment_open-
 least(p_event.gross_amount-p_event.impairment_open-p_event.residual_value,
 p_event.depreciation_open+public.accounting_charge(p_event.annual_charge,p_event.charge_from,p_date)))
$$;
revoke all on function public.accounting_amount(public.accounting_events,date) from public,anon,authenticated;

create function public.accounting_capture()
returns trigger language plpgsql security definer set search_path=public as $$
declare c public.asset_categories; existing boolean;
begin
 perform pg_advisory_xact_lock(742019);
 select exists(select 1 from public.accounting_events where asset_id=new.id) into existing;
 if tg_op='UPDATE' and existing and (old.value is distinct from new.value or old.cost_known is distinct from new.cost_known or old.category_id is distinct from new.category_id or old.available_for_use_date is distinct from new.available_for_use_date or old.acquisition_date is distinct from new.acquisition_date) then
   raise exception 'Accounting facts are locked. Use the administrator accounting page to record an adjustment.';
 end if;
 if not existing and new.cost_known and new.category_id is not null and new.available_for_use_date is not null then
   select * into c from public.asset_categories where id=new.category_id and active;
   if found and c.measurement_model='cost' and not exists(select 1 from public.accounting_reports where period_end>=new.available_for_use_date) then
     insert into public.accounting_events(asset_id,category_id,effective_date,kind,original_cost,gross_amount,annual_charge,charge_from,model,evidence,reason,recorded_by,asset_snapshot)
     values(new.id,c.id,new.available_for_use_date,'acquisition',new.value,new.value,new.value*c.annual_rate/100,new.available_for_use_date,'cost','Asset entry','Automatic initial cost recognition',auth.uid(),to_jsonb(new));
   end if;
 end if;
 return new;
end $$;
create trigger assets_accounting_capture after insert or update on public.assets for each row execute function public.accounting_capture();
revoke all on function public.accounting_capture() from public,anon,authenticated;

create function public.accounting_report(p_date date)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required'; end if;
 if p_date is null or p_date>current_date then raise exception 'Choose a report date up to today'; end if;
 with latest as (
   select distinct on(asset_id) * from public.accounting_events where effective_date<=p_date order by asset_id,effective_date desc
 ), rows as (
   select a.id,a.barcode,a.name,coalesce(e.category_id,a.category_id) as category_id,c.name as classification,u.name as unit_name,
     case when e.id is not null and e.model<>c.measurement_model and p_date>=c.model_effective_date then 'Needs class revaluation' when e.id is not null then 'Valued' when coalesce(a.available_for_use_date,a.acquisition_date)>p_date then 'Not yet in use' else 'Needs accounting details' end status,
     e.model,e.original_cost,e.gross_amount,e.residual_value,e.impairment_open as impairment,
     case when e.id is null then null else e.gross_amount-e.impairment_open-public.accounting_amount(e,p_date) end accumulated_depreciation,
     case when e.id is null then null else public.accounting_amount(e,p_date) end carrying_amount,
     case when e.id is null then null else public.accounting_year_charge(a.id,p_date) end year_depreciation
   from public.assets a left join latest e on e.asset_id=a.id
   left join public.asset_categories c on c.id=coalesce(e.category_id,a.category_id)
   left join public.org_units u on u.id=a.org_unit_id
 )
 select jsonb_build_object('as_of',p_date,'rows',coalesce(jsonb_agg(to_jsonb(rows) order by barcode),'[]'::jsonb),
 'asset_count',count(*),'valued_count',count(carrying_amount),'incomplete_count',count(*) filter(where status not in ('Valued','Not yet in use')),
 'original_cost',coalesce(sum(original_cost),0),'depreciation',coalesce(sum(accumulated_depreciation),0),'impairment',coalesce(sum(impairment),0),
 'carrying_amount',coalesce(sum(carrying_amount),0),'year_depreciation',coalesce(sum(year_depreciation),0)) into result from rows;
 return result;
end $$;

-- Admin opening balances and impairment: immutable, dated, evidenced revisions.
create function public.record_accounting_event(p_asset uuid,p_date date,p_kind text,p_category uuid,p_cost numeric,p_gross numeric,p_depreciation numeric,p_impairment numeric,p_residual numeric,p_years numeric,p_evidence text,p_reason text)
returns uuid language plpgsql security definer set search_path=public as $$
declare a public.assets; c public.asset_categories; previous public.accounting_events; new_id uuid;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required'; end if;
 perform pg_advisory_xact_lock(742019);
 select * into a from public.assets where id=p_asset for update;
 if not found then raise exception 'Asset not found'; end if;
 select * into c from public.asset_categories where id=p_category and active;
 if not found then raise exception 'Select a document classification'; end if;
 if p_category is distinct from a.category_id then raise exception 'Set the classification on the asset record before recording opening balances'; end if;
 if p_date is null or p_date>current_date or exists(select 1 from public.accounting_reports where period_end>=p_date) then raise exception 'Date is future or belongs to a finalized period'; end if;
 if p_kind not in ('opening','impairment') or p_kind is null or nullif(trim(p_evidence),'') is null or nullif(trim(p_reason),'') is null then raise exception 'Evidence, reason and event type are required'; end if;
 if p_years is null or p_years<=0 or p_years>1000 or p_cost is null or p_gross is null or p_depreciation is null or p_impairment is null or p_residual is null then raise exception 'Complete the financial amounts and remaining useful life'; end if;
 select * into previous from public.accounting_events where asset_id=p_asset order by effective_date desc limit 1;
 if found and (p_date<=previous.effective_date or p_cost<>previous.original_cost or p_category<>previous.category_id) then raise exception 'Preserve original cost/classification and use a date after the latest event'; end if;
 if p_kind='impairment' then
   if previous.id is null or p_gross<>previous.gross_amount or p_depreciation<>previous.gross_amount-previous.impairment_open-public.accounting_amount(previous,p_date) or p_impairment<=previous.impairment_open then raise exception 'Impairment must preserve gross amount and current accumulated depreciation and increase accumulated impairment'; end if;
 elsif previous.id is not null then raise exception 'Opening balances are only for assets without an accounting record';
 end if;
 insert into public.accounting_events(asset_id,category_id,effective_date,kind,original_cost,gross_amount,depreciation_open,impairment_open,residual_value,annual_charge,charge_from,model,evidence,reason,recorded_by,asset_snapshot)
 values(a.id,c.id,p_date,p_kind,p_cost,p_gross,p_depreciation,p_impairment,p_residual,(p_gross-p_depreciation-p_impairment-p_residual)/p_years,p_date+1,coalesce(previous.model,'cost'),trim(p_evidence),trim(p_reason),auth.uid(),to_jsonb(a)) returning id into new_id;
 return new_id;
end $$;

create function public.revalue_accounting_class(p_category uuid,p_date date,p_rows jsonb,p_valuer text,p_evidence text,p_reason text)
returns integer language plpgsql security definer set search_path=public as $$
declare a public.assets; e public.accounting_events; row jsonb; n integer:=0; c public.asset_categories; amount numeric; residual numeric; years numeric;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required'; end if;
 perform pg_advisory_xact_lock(742019);
 select * into c from public.asset_categories where id=p_category and active for update;
 if not found then raise exception 'Select a document classification'; end if;
 if p_date is null or p_date>current_date or exists(select 1 from public.accounting_reports where period_end>=p_date) then raise exception 'Date is future or belongs to a finalized period'; end if;
 if nullif(trim(p_valuer),'') is null or nullif(trim(p_evidence),'') is null or nullif(trim(p_reason),'') is null or p_rows is null or jsonb_typeof(p_rows)<>'array' then raise exception 'Valuer, evidence, reason and complete class values are required'; end if;
 perform 1 from public.assets where category_id=p_category order by id for update;
 if (select count(*) from public.assets where category_id=p_category)=0 or jsonb_array_length(p_rows)<>(select count(*) from public.assets where category_id=p_category)
 or (select count(distinct r->>'asset_id') from jsonb_array_elements(p_rows) r)<>jsonb_array_length(p_rows) then raise exception 'Revalue every asset in this class exactly once'; end if;
 for row in select * from jsonb_array_elements(p_rows) loop
   select * into a from public.assets where id=(row->>'asset_id')::uuid and category_id=p_category;
   if not found then raise exception 'Asset outside selected class'; end if;
   select * into e from public.accounting_events where asset_id=a.id order by effective_date desc limit 1;
   if e.id is null or p_date<=e.effective_date then raise exception 'Complete opening cost records first; use a date after the latest event'; end if;
   amount:=(row->>'amount')::numeric; residual:=(row->>'residual')::numeric; years:=(row->>'years')::numeric;
   if amount is null or residual is null or years is null or years<=0 or years>1000 then raise exception 'Complete value, residual and remaining useful life for every asset'; end if;
   insert into public.accounting_events(asset_id,category_id,effective_date,kind,original_cost,gross_amount,residual_value,annual_charge,charge_from,model,evidence,valuer,reason,recorded_by,asset_snapshot)
   values(a.id,c.id,p_date,'revaluation',e.original_cost,amount,residual,(amount-residual)/years,p_date+1,'current_value',trim(p_evidence),trim(p_valuer),trim(p_reason),auth.uid(),to_jsonb(a));
   n:=n+1;
 end loop;
 update public.asset_categories set measurement_model='current_value',model_effective_date=coalesce(model_effective_date,p_date) where id=c.id;
 return n;
end $$;

create function public.finalize_accounting_year(p_date date)
returns uuid language plpgsql security definer set search_path=public as $$
declare document jsonb; report_id uuid;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required'; end if;
 perform pg_advisory_xact_lock(742019);
 if p_date is null or to_char(p_date,'MM-DD')<>'12-31' or p_date>current_date then raise exception 'Finalize a completed January–December year only'; end if;
 if exists(select 1 from public.accounting_reports where period_end>=p_date) then raise exception 'Year already finalized or before an existing finalized period'; end if;
 document:=public.accounting_report(p_date);
 if (document->>'incomplete_count')::integer>0 then raise exception 'Complete all missing accounting details before finalizing'; end if;
 insert into public.accounting_reports(period_end,created_by,snapshot) values(p_date,auth.uid(),document) returning id into report_id;
 return report_id;
end $$;
revoke all on function public.accounting_report(date),public.record_accounting_event(uuid,date,text,uuid,numeric,numeric,numeric,numeric,numeric,numeric,text,text),public.revalue_accounting_class(uuid,date,jsonb,text,text,text),public.finalize_accounting_year(date) from public,anon;
grant execute on function public.accounting_report(date),public.record_accounting_event(uuid,date,text,uuid,numeric,numeric,numeric,numeric,numeric,numeric,text,text),public.revalue_accounting_class(uuid,date,jsonb,text,text,text),public.finalize_accounting_year(date) to authenticated;

create function public.accounting_year_charge(p_asset uuid,p_date date)
returns numeric language sql stable set search_path=public as $$
 with segments as (
 select *,lead(effective_date) over(order by effective_date) next_date
 from public.accounting_events where asset_id=p_asset
 ), charges as (
 select least(gross_amount-impairment_open-residual_value-depreciation_open,public.accounting_charge(annual_charge,charge_from,least(p_date,coalesce(next_date,p_date))))
 -least(gross_amount-impairment_open-residual_value-depreciation_open,public.accounting_charge(annual_charge,charge_from,least(date_trunc('year',p_date)::date-1,coalesce(next_date,p_date)))) amount
 from segments where effective_date<=p_date
 ) select coalesce(sum(greatest(0,amount)),0) from charges
$$;
revoke all on function public.accounting_year_charge(uuid,date) from public,anon,authenticated;

create table public.accounting_policy_logs (
 id uuid primary key default gen_random_uuid(),category_id uuid not null references public.asset_categories(id),
 old_rate numeric not null,new_rate numeric not null,reason text not null,
 changed_by uuid references auth.users(id) on delete set null,changed_at timestamptz not null default now()
);
alter table public.accounting_policy_logs enable row level security;
create policy accounting_policy_read on public.accounting_policy_logs for select to authenticated using(public.is_admin());
grant select on public.accounting_policy_logs to authenticated;
revoke insert,update,delete on public.accounting_policy_logs from anon,authenticated;
revoke insert,update,delete on public.asset_categories from authenticated;
create function public.set_accounting_rate(p_category uuid,p_rate numeric,p_reason text)
returns void language plpgsql security definer set search_path=public as $$
declare c public.asset_categories;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required'; end if;
 perform pg_advisory_xact_lock(742019);
 select * into c from public.asset_categories where id=p_category and active for update;
 if not found or p_rate is null or p_rate not between 0 and 100 or nullif(trim(p_reason),'') is null then raise exception 'Select a classification, valid annual rate and change reason'; end if;
 insert into public.accounting_policy_logs(category_id,old_rate,new_rate,reason,changed_by) values(c.id,c.annual_rate,p_rate,trim(p_reason),auth.uid());
 update public.asset_categories set annual_rate=p_rate where id=c.id;
end $$;
revoke all on function public.set_accounting_rate(uuid,numeric,text) from public,anon;
grant execute on function public.set_accounting_rate(uuid,numeric,text) to authenticated;

create function public.asset_accounting_locked(p_asset uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and exists(select 1 from public.assets a where a.id=p_asset and public.can_access_unit(a.org_unit_id))
 and exists(select 1 from public.accounting_events where asset_id=p_asset)
$$;
revoke all on function public.asset_accounting_locked(uuid) from public,anon;
grant execute on function public.asset_accounting_locked(uuid) to authenticated;

create function public.protect_accounted_asset_delete()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if exists(select 1 from public.accounting_events where asset_id=old.id) then
   raise exception 'An accounted asset cannot be deleted. Retain its financial and physical history.';
 end if;
 return old;
end $$;
create trigger protect_accounted_asset_delete before delete on public.assets for each row execute function public.protect_accounted_asset_delete();
revoke all on function public.protect_accounted_asset_delete() from public,anon,authenticated;

create or replace function public.import_asset_rows(p_rows jsonb)
returns setof public.assets language plpgsql security invoker set search_path=public
as $$
declare r jsonb; existing public.assets%rowtype; v_count integer;
begin
  if auth.uid() is null then raise exception 'Sign in before importing.' using errcode='insufficient_privilege'; end if;
  if p_rows is null or jsonb_typeof(p_rows)<>'array' then
    raise exception 'Send an array of import rows.' using errcode='check_violation';
  end if;
  if jsonb_array_length(p_rows) not between 1 and 50 then
    raise exception 'Send between 1 and 50 rows per import batch.' using errcode='check_violation';
  end if;
  if exists(select 1 from jsonb_array_elements(p_rows) x
    where coalesce(x->>'import_key','') !~ '^[a-f0-9]{64}$') then
    raise exception 'Each row needs a valid import reference.' using errcode='check_violation';
  end if;
  if (select count(distinct x->>'import_key') from jsonb_array_elements(p_rows) x)<>jsonb_array_length(p_rows) then
    raise exception 'An import batch contains repeated row references.' using errcode='check_violation';
  end if;
  insert into public.assets(import_key,name,category_id,org_unit_id,location,condition,value,serial_number,acquisition_date,notes,cost_known,available_for_use_date,barcode,qr_payload)
  select r.import_key,r.name,r.category_id,r.org_unit_id,r.location,coalesce(r.condition,'Working'),coalesce(r.value,0),
    r.serial_number,r.acquisition_date,r.notes,coalesce(r.cost_known,false),r.available_for_use_date,'',''
  from jsonb_to_recordset(p_rows) as r(import_key text,name text,category_id uuid,org_unit_id uuid,
    location text,condition text,value numeric,serial_number text,acquisition_date date,notes text,cost_known boolean,available_for_use_date date)
  where not exists(select 1 from public.assets a where a.import_key=r.import_key)
  on conflict(import_key) do nothing;

  -- A changed mapping must not silently overwrite already recorded rows.
  for r in select value from jsonb_array_elements(p_rows) loop
    select * into existing from public.assets where import_key=r->>'import_key';
    if not found then raise exception 'An import reference is already recorded outside your access.' using errcode='insufficient_privilege'; end if;
    if row(existing.name,existing.category_id,existing.org_unit_id,existing.location,existing.condition,
      existing.value,existing.serial_number,existing.acquisition_date,existing.notes,existing.cost_known,existing.available_for_use_date) is distinct from
      row(r->>'name',(r->>'category_id')::uuid,(r->>'org_unit_id')::uuid,r->>'location',coalesce(r->>'condition','Working'),
        coalesce((r->>'value')::numeric,0),r->>'serial_number',(r->>'acquisition_date')::date,r->>'notes',coalesce((r->>'cost_known')::boolean,false),(r->>'available_for_use_date')::date) then
      raise exception 'A previously imported row has different values. Edit its asset record instead of re-importing it.' using errcode='check_violation';
    end if;
  end loop;
  select count(*) into v_count from public.assets a where a.import_key in(select x->>'import_key' from jsonb_array_elements(p_rows) x);
  if v_count<>jsonb_array_length(p_rows) then raise exception 'Not every row was confirmed.' using errcode='check_violation'; end if;
  return query select a.* from jsonb_array_elements(p_rows) with ordinality x(value,n)
    join public.assets a on a.import_key=x.value->>'import_key' order by x.n;
end $$;
revoke all on function public.import_asset_rows(jsonb) from public, anon;
grant execute on function public.import_asset_rows(jsonb) to authenticated;



