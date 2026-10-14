alter table public.accounting_events drop constraint accounting_events_kind_check;
alter table public.accounting_events add constraint accounting_events_kind_check check(kind in ('acquisition','opening','revaluation','impairment','correction'));
alter table public.accounting_events add column valuation_basis text not null default 'cost' check(valuation_basis in ('cost','current_operational','fair_value'));
create index accounting_events_category_idx on public.accounting_events(category_id);
create index accounting_policy_category_idx on public.accounting_policy_logs(category_id);
create or replace function public.record_accounting_event(p_asset uuid,p_date date,p_kind text,p_category uuid,p_cost numeric,p_gross numeric,p_depreciation numeric,p_impairment numeric,p_residual numeric,p_years numeric,p_evidence text,p_reason text)
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
 if p_kind not in ('opening','impairment','correction') or p_kind is null or nullif(trim(p_evidence),'') is null or nullif(trim(p_reason),'') is null then raise exception 'Evidence, reason and event type are required'; end if;
 if p_years is null or p_years<=0 or p_years>1000 or p_cost is null or p_gross is null or p_depreciation is null or p_impairment is null or p_residual is null then raise exception 'Complete the financial amounts and remaining useful life'; end if;
 select * into previous from public.accounting_events where asset_id=p_asset order by effective_date desc limit 1;
 if found and (p_date<=previous.effective_date or (p_cost<>previous.original_cost and (p_kind<>'correction' or previous.model<>'cost')) or p_category<>previous.category_id) then raise exception 'Preserve original cost/classification and use a date after the latest event'; end if;
 if p_kind='impairment' then
   if previous.id is null or p_gross<>previous.gross_amount or p_depreciation<>previous.gross_amount-previous.impairment_open-public.accounting_amount(previous,p_date) or p_impairment<=previous.impairment_open then raise exception 'Impairment must preserve gross amount and current accumulated depreciation and increase accumulated impairment'; end if;
 elsif p_kind='opening' and previous.id is not null then raise exception 'Opening balances are only for assets without an accounting record';
 end if;
 if p_kind='correction' and previous.id is null then raise exception 'Use opening balances for assets without a prior record'; end if;
 if p_kind='correction' and previous.model='current_value' and p_gross<>previous.gross_amount then raise exception 'Change current value through a whole-class revaluation'; end if;
 if p_kind in ('opening','correction') and coalesce(previous.model,'cost')='cost' and p_gross<>p_cost then raise exception 'Historical gross cost must equal recognized acquisition cost'; end if;
 insert into public.accounting_events(asset_id,category_id,effective_date,kind,original_cost,gross_amount,depreciation_open,impairment_open,residual_value,annual_charge,charge_from,model,evidence,reason,recorded_by,asset_snapshot)
 values(a.id,c.id,p_date,p_kind,p_cost,p_gross,p_depreciation,p_impairment,p_residual,(p_gross-p_depreciation-p_impairment-p_residual)/p_years,p_date+1,coalesce(previous.model,'cost'),trim(p_evidence),trim(p_reason),auth.uid(),to_jsonb(a)) returning id into new_id;
 return new_id;
end $$;

create or replace function public.revalue_accounting_class(p_category uuid,p_date date,p_rows jsonb,p_valuer text,p_evidence text,p_reason text)
returns integer language plpgsql security definer set search_path=public as $$
declare a public.assets; e public.accounting_events; row jsonb; n integer:=0; c public.asset_categories; amount numeric; basis text; residual numeric; years numeric;
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
   basis:=row->>'basis';
   if basis is null or basis not in ('current_operational','fair_value') then raise exception 'Choose current operational value or fair value for each asset'; end if;
   amount:=(row->>'amount')::numeric; residual:=(row->>'residual')::numeric; years:=(row->>'years')::numeric;
   if amount is null or residual is null or years is null or years<=0 or years>1000 then raise exception 'Complete value, residual and remaining useful life for every asset'; end if;
   insert into public.accounting_events(asset_id,category_id,effective_date,kind,valuation_basis,original_cost,gross_amount,residual_value,annual_charge,charge_from,model,evidence,valuer,reason,recorded_by,asset_snapshot)
   values(a.id,c.id,p_date,'revaluation',basis,e.original_cost,amount,residual,(amount-residual)/years,p_date+1,'current_value',trim(p_evidence),trim(p_valuer),trim(p_reason),auth.uid(),to_jsonb(a));
   n:=n+1;
 end loop;
 update public.asset_categories set measurement_model='current_value',model_effective_date=coalesce(model_effective_date,p_date) where id=c.id;
 return n;
end $$;




