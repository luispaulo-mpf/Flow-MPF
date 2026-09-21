-- Orders/items created via ERP import never got their initial status-history
-- row (a gap fixed in application code separately, src/actions/import.ts).
-- Backfill it the same way the original migration did, using created_at as
-- an approximation, but only for rows that still have zero history rows.

insert into public.order_status_history (company_id, order_id, status_id, entered_at)
select o.company_id, o.id, o.status_id, o.created_at
from public.orders o
where o.status_id is not null
  and not exists (select 1 from public.order_status_history h where h.order_id = o.id);

insert into public.order_item_status_history (company_id, order_item_id, status_id, entered_at)
select ord.company_id, i.id, i.status_id, i.created_at
from public.order_items i
join public.orders ord on ord.id = i.order_id
where i.status_id is not null
  and not exists (select 1 from public.order_item_status_history h where h.order_item_id = i.id);
