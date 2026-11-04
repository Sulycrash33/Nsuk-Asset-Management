-- Depreciation is recognised automatically whenever an asset has a known cost,
-- an active classification and a start date. Asked for on 4 Nov 2026: of the
-- first 59 assets recorded, 50 had no depreciation because the rule was too
-- narrow. Three choices made by the user:
--   * With no date available for use, depreciation starts on the acquisition
--     date (1 January for a year-only acquisition, as #80 does). A date
--     available for use still wins when it is given.
--   * A purchase cost above zero is a known cost. The "cost is known" box now
--     matters only for a confirmed zero.
--   * Assets already recorded are recognised now, by the same rule.

-- 1. A typed cost is a known cost. Only before an accounting record exists:
--    after that, accounting facts are locked and only an administrator
--    adjusts them. Definer, so the check sees accounting_events through RLS
--    (staff cannot read it), with execute revoked like the other trigger
--    functions.
create function public.assets_cost_known_from_value()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.value > 0 and not new.cost_known
     and not exists(select 1 from public.accounting_events where asset_id = new.id) then
    new.cost_known := true;
  end if;
  return new;
end $$;
revoke all on function public.assets_cost_known_from_value() from public, anon, authenticated;
create trigger assets_cost_known_trg before insert or update on public.assets
  for each row execute function public.assets_cost_known_from_value();

-- 2. The start date falls back to the acquisition date. Otherwise unchanged.
create or replace function public.accounting_capture()
returns trigger language plpgsql security definer set search_path = public as $$
declare c public.asset_categories; existing boolean; starts date;
begin
 perform pg_advisory_xact_lock(742019);
 select exists(select 1 from public.accounting_events where asset_id=new.id) into existing;
 if tg_op='UPDATE' and existing and (old.value is distinct from new.value or old.cost_known is distinct from new.cost_known or old.category_id is distinct from new.category_id or old.available_for_use_date is distinct from new.available_for_use_date or old.acquisition_date is distinct from new.acquisition_date) then
   raise exception 'Accounting facts are locked. Use the administrator accounting page to record an adjustment.';
 end if;
 starts := coalesce(new.available_for_use_date, new.acquisition_date);
 if not existing and new.cost_known and new.category_id is not null and starts is not null then
   select * into c from public.asset_categories where id=new.category_id and active;
   if found and c.measurement_model='cost' and not exists(select 1 from public.accounting_reports where period_end>=starts) then
     insert into public.accounting_events(asset_id,category_id,effective_date,kind,original_cost,gross_amount,annual_charge,charge_from,model,evidence,reason,recorded_by,asset_snapshot)
     values(new.id,c.id,starts,'acquisition',new.value,new.value,new.value*c.annual_rate/100,starts,'cost','Asset entry','Automatic initial cost recognition',auth.uid(),to_jsonb(new));
   end if;
 end if;
 return new;
end $$;
revoke all on function public.accounting_capture() from public, anon, authenticated;

-- 3. Assets already recorded. Setting cost_known fires the capture trigger,
--    which recognises those that qualify; field history does not track
--    cost_known, so no history entry is written.
update public.assets a set cost_known = true
 where a.value > 0 and not a.cost_known
   and not exists(select 1 from public.accounting_events e where e.asset_id = a.id);

-- The rest are recognised exactly as the trigger would have done.
insert into public.accounting_events(asset_id,category_id,effective_date,kind,original_cost,gross_amount,annual_charge,charge_from,model,evidence,reason,recorded_by,asset_snapshot)
select a.id, c.id, coalesce(a.available_for_use_date, a.acquisition_date), 'acquisition', a.value, a.value,
       a.value*c.annual_rate/100, coalesce(a.available_for_use_date, a.acquisition_date), 'cost',
       'Asset entry', 'Automatic initial cost recognition', null, to_jsonb(a)
  from public.assets a
  join public.asset_categories c on c.id = a.category_id and c.active and c.measurement_model = 'cost'
 where a.cost_known
   and coalesce(a.available_for_use_date, a.acquisition_date) is not null
   and not exists(select 1 from public.accounting_events e where e.asset_id = a.id)
   and not exists(select 1 from public.accounting_reports r where r.period_end >= coalesce(a.available_for_use_date, a.acquisition_date));

-- 4. One asset's depreciation for its page. Administrator only, like every
--    other accounting figure. The same arithmetic as accounting_report.
create function public.asset_depreciation(p_asset uuid, p_date date default current_date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare e public.accounting_events; first_event public.accounting_events;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required'; end if;
 if p_date is null then raise exception 'Choose a date'; end if;
 select * into first_event from public.accounting_events where asset_id=p_asset order by effective_date limit 1;
 if not found then return null; end if;
 select * into e from public.accounting_events where asset_id=p_asset and effective_date<=p_date order by effective_date desc limit 1;
 if not found then
   return jsonb_build_object('as_of',p_date,'status','Not yet in use','starts',first_event.charge_from);
 end if;
 return jsonb_build_object(
   'as_of',p_date,
   'status','Valued',
   'starts',first_event.charge_from,
   'classification',(select name from public.asset_categories where id=e.category_id),
   'model',e.model,
   'original_cost',e.original_cost,
   'gross_amount',e.gross_amount,
   'annual_charge',round(e.annual_charge,2),
   'impairment',e.impairment_open,
   'residual_value',e.residual_value,
   'accumulated_depreciation',e.gross_amount-e.impairment_open-public.accounting_amount(e,p_date),
   'carrying_amount',public.accounting_amount(e,p_date),
   'year_depreciation',public.accounting_year_charge(p_asset,p_date));
end $$;
revoke all on function public.asset_depreciation(uuid, date) from public, anon;
grant execute on function public.asset_depreciation(uuid, date) to authenticated;
