create function public.register_summary(p_unit_ids uuid[],p_category uuid,p_condition text,p_from date,p_to date,p_term text)
returns jsonb language sql stable security invoker set search_path=public
as $$
select jsonb_build_object('total',count(*),'total_value',coalesce(sum(value),0)) from public.assets
where (p_unit_ids is null or org_unit_id=any(p_unit_ids))
  and (p_category is null or category_id=p_category)
  and (p_condition is null or condition::text=p_condition)
  and (p_from is null or created_at >= (p_from::timestamp at time zone 'UTC'))
  and (p_to is null or created_at < ((p_to+1)::timestamp at time zone 'UTC'))
  and (coalesce(p_term,'')='' or name ilike '%'||p_term||'%' or barcode ilike '%'||p_term||'%'
    or serial_number ilike '%'||p_term||'%' or location ilike '%'||p_term||'%');
$$;
revoke all on function public.register_summary(uuid[],uuid,text,date,date,text) from public,anon;
grant execute on function public.register_summary(uuid[],uuid,text,date,date,text) to authenticated;
