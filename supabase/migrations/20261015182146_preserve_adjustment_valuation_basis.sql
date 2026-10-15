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
 insert into public.accounting_events(asset_id,category_id,effective_date,kind,valuation_basis,original_cost,gross_amount,depreciation_open,impairment_open,residual_value,annual_charge,charge_from,model,evidence,reason,recorded_by,asset_snapshot)
 values(a.id,c.id,p_date,p_kind,coalesce(previous.valuation_basis,'cost'),p_cost,p_gross,p_depreciation,p_impairment,p_residual,(p_gross-p_depreciation-p_impairment-p_residual)/p_years,p_date+1,coalesce(previous.model,'cost'),trim(p_evidence),trim(p_reason),auth.uid(),to_jsonb(a)) returning id into new_id;
 return new_id;
end $$;




