create function public.bulk_update_assets(p_asset_ids uuid[],p_condition text,p_org_unit_id uuid,p_reason text)
returns integer language plpgsql security invoker set search_path=public as $$
declare ids uuid[]; locked integer; changed integer;
begin
  if not public.is_admin() and not exists(select 1 from public.profiles where id=auth.uid() and role='staff') then
    raise exception 'Only administrators and recording staff may change assets.' using errcode='insufficient_privilege'; end if;
  if p_asset_ids is null or cardinality(p_asset_ids)<1 or cardinality(p_asset_ids)>100 or array_position(p_asset_ids,null) is not null then
    raise exception 'Select between 1 and 100 assets.' using errcode='check_violation'; end if;
  if p_condition is null and p_org_unit_id is null then raise exception 'Choose a change.' using errcode='check_violation'; end if;
  if p_condition is not null and p_condition not in('Working','Faulty','Under Repair','Missing') then raise exception 'Invalid condition.' using errcode='check_violation'; end if;
  if p_org_unit_id is not null and (nullif(btrim(p_reason),'') is null or not exists(select 1 from public.org_units where id=p_org_unit_id)) then
    raise exception 'Choose a destination and give the transfer reason.' using errcode='check_violation'; end if;
  select array_agg(distinct id) into ids from unnest(p_asset_ids) id;
  perform id from public.assets where id=any(ids) order by id for update;
  get diagnostics locked=row_count;
  if locked<>cardinality(ids) then raise exception 'One or more selected assets are unavailable. Refresh the list.' using errcode='insufficient_privilege'; end if;
  perform set_config('app.move_reason',coalesce(p_reason,''),true);
  update public.assets set condition=coalesce(p_condition,condition),org_unit_id=coalesce(p_org_unit_id,org_unit_id) where id=any(ids);
  get diagnostics changed=row_count;
  return changed;
end $$;
revoke all on function public.bulk_update_assets(uuid[],text,uuid,text) from public,anon;
grant execute on function public.bulk_update_assets(uuid[],text,uuid,text) to authenticated;
