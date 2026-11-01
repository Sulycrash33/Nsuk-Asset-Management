-- An officer may know only the year an item was acquired. The date column still
-- needs a whole date, so a year-only entry is stored as 1 January of that year
-- and flagged, so screens show "2019" rather than a day nobody recorded.
alter table public.assets add column acquisition_year_only boolean not null default false;
comment on column public.assets.acquisition_year_only is
  'True when only the acquisition year is known; acquisition_date then holds 1 January of that year.';
alter table public.assets add constraint assets_acquisition_year_only check (
  not acquisition_year_only or (acquisition_date is not null
    and extract(month from acquisition_date) = 1 and extract(day from acquisition_date) = 1));

-- Record the flag in the field history alongside the date it qualifies.
create or replace function public.assets_audit()
returns trigger language plpgsql security definer set search_path=public as $$
declare before_row jsonb; after_row jsonb; delta jsonb; act text;
begin
  before_row:=case when tg_op='INSERT' then '{}'::jsonb else to_jsonb(old) end;
  after_row:=case when tg_op='DELETE' then '{}'::jsonb else to_jsonb(new) end;
  select coalesce(jsonb_object_agg(field,jsonb_build_object('before',before_row->field,'after',after_row->field)),'{}'::jsonb)
  into delta from unnest(array['name','barcode','qr_payload','category_id','org_unit_id','location','condition','value','serial_number','acquisition_date','acquisition_year_only','photo_url','notes']) field
  where before_row->field is distinct from after_row->field;
  if tg_op='INSERT' then
    insert into public.asset_logs(asset_id,asset_barcode,asset_name,action,performed_by,to_unit_id,changes)
    values(new.id,new.barcode,new.name,'created',auth.uid(),new.org_unit_id,delta);
    return new;
  elsif tg_op='DELETE' then
    insert into public.asset_logs(asset_id,asset_barcode,asset_name,action,performed_by,from_unit_id,changes)
    values(old.id,old.barcode,old.name,'deleted',auth.uid(),old.org_unit_id,delta);
    return old;
  end if;
  if delta='{}'::jsonb then return new; end if;
  act:=case when old.org_unit_id is distinct from new.org_unit_id then 'moved' else 'edited' end;
  insert into public.asset_logs(asset_id,asset_barcode,asset_name,action,performed_by,from_unit_id,to_unit_id,note,changes)
  values(new.id,new.barcode,new.name,act,auth.uid(),case when act='moved' then old.org_unit_id end,new.org_unit_id,
    case when act='moved' then nullif(current_setting('app.move_reason',true),'') end,delta);
  return new;
end $$;
revoke all on function public.assets_audit() from public,anon,authenticated;
