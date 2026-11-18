-- Anyone who may edit an asset can correct its purchase cost and dates after
-- depreciation has started, and the depreciation is recalculated. Asked for
-- on 18 Nov 2026 ("they should be able to edit the figures as well the
-- amount"). The user chose:
--   * Recalculate, rather than change the cost and leave the old charge.
--   * Cost and dates: purchase cost, cost known, acquisition date and date
--     available for use. The category stays locked once there is an
--     accounting record, since it sets the rate and the code's item type.
--
-- Recalculation is only for the record the system made by itself: an asset
-- whose one accounting event is the automatic acquisition, in a year that no
-- finalized report covers. Anything an administrator recorded (opening
-- balance, correction, impairment, revaluation) or a closed year keeps the
-- old rule: the facts are locked and only Asset accounting adjusts them.
--
-- The automatic event is replaced as if the asset had been saved with the new
-- figures. It keeps the rate it was first charged at, so a later rate change
-- (which applies to future acquisitions only) is not slipped in by an edit.
-- The replacement says it was recalculated, and the cost and acquisition date
-- before and after are in the asset's activity log as for any other edit.
-- Who may edit is unchanged: assets_update decides.

-- 1. The one rule both the trigger and the edit page use.
create function public.asset_figures_recalculable(p_asset uuid)
returns boolean language sql stable security definer set search_path = public as $$
  with e as (
    select kind, reason, effective_date from public.accounting_events where asset_id = p_asset
  )
  select (select count(*) from e) = 1
     and coalesce((select bool_and(kind = 'acquisition' and reason = 'Automatic initial cost recognition') from e), false)
     and not exists(select 1 from e join public.accounting_reports r on r.period_end >= e.effective_date)
$$;
revoke all on function public.asset_figures_recalculable(uuid) from public, anon, authenticated;

-- 2. For the edit page: may this person change the cost and dates? False when
--    there is no accounting record (nothing locks them) or when it can be
--    recalculated. Same visibility check as asset_accounting_locked.
create function public.asset_figures_locked(p_asset uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
     and exists(select 1 from public.assets a where a.id = p_asset
                  and (public.can_access_unit(a.org_unit_id)
                       or (public.can_write_assets() and a.created_by = auth.uid())))
     and exists(select 1 from public.accounting_events where asset_id = p_asset)
     and not public.asset_figures_recalculable(p_asset)
$$;
revoke all on function public.asset_figures_locked(uuid) from public, anon;
grant execute on function public.asset_figures_locked(uuid) to authenticated;

-- 3. A typed cost is a known cost, now also after recognition: a cost above
--    zero can no longer be marked unknown. Before, this stopped at the first
--    accounting record only because changing cost_known then tripped the lock.
create or replace function public.assets_cost_known_from_value()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.value > 0 and not new.cost_known then
    new.cost_known := true;
  end if;
  return new;
end $$;
revoke all on function public.assets_cost_known_from_value() from public, anon, authenticated;

-- 4. Recognition, now able to redo its own work.
create or replace function public.accounting_capture()
returns trigger language plpgsql security definer set search_path = public as $$
declare c public.asset_categories; existing boolean; starts date;
 prior public.accounting_events; v_rate numeric;
begin
 perform pg_advisory_xact_lock(742019);
 select exists(select 1 from public.accounting_events where asset_id=new.id) into existing;
 if tg_op='UPDATE' and existing then
   if old.category_id is distinct from new.category_id then
     raise exception 'The category is locked because this asset has an accounting record. An administrator records a change in Asset accounting.';
   end if;
   if old.value is distinct from new.value or old.cost_known is distinct from new.cost_known
      or old.available_for_use_date is distinct from new.available_for_use_date
      or old.acquisition_date is distinct from new.acquisition_date then
     if not public.asset_figures_recalculable(new.id) then
       raise exception 'Accounting facts are locked. Use the administrator accounting page to record an adjustment.';
     end if;
     select * into prior from public.accounting_events where asset_id=new.id;
     delete from public.accounting_events where id=prior.id;
     existing := false;
     -- The rate it was charged at; a zero cost carries none, so it takes the
     -- class's rate as a fresh save would.
     v_rate := case when prior.original_cost > 0 then prior.annual_charge*100/prior.original_cost end;
   end if;
 end if;
 starts := coalesce(new.available_for_use_date, new.acquisition_date);
 if not existing and new.cost_known and new.category_id is not null and starts is not null then
   select * into c from public.asset_categories where id=new.category_id and active;
   if found and c.measurement_model='cost' and not exists(select 1 from public.accounting_reports where period_end>=starts) then
     insert into public.accounting_events(asset_id,category_id,effective_date,kind,original_cost,gross_amount,annual_charge,charge_from,model,evidence,reason,recorded_by,asset_snapshot)
     values(new.id,c.id,starts,'acquisition',new.value,new.value,new.value*coalesce(v_rate,c.annual_rate)/100,starts,'cost',
            case when prior.id is null then 'Asset entry' else 'Asset entry, recalculated after an edit' end,
            'Automatic initial cost recognition',auth.uid(),to_jsonb(new));
   elsif prior.id is not null then
     -- The old record would be lost, not replaced: refuse rather than drop it.
     raise exception 'This change cannot be depreciated automatically (the date falls in a closed accounting year, or the class no longer allows it). Ask an administrator.';
   end if;
 end if;
 return new;
end $$;
revoke all on function public.accounting_capture() from public, anon, authenticated;
