-- Item statuses reuse the same configurable statuses table as order
-- statuses, distinguished by `scope`, so Configurações can manage both
-- lists with the same UI/permissions instead of a second parallel table.

alter table public.statuses
  add column scope text not null default 'ORDER' check (scope in ('ORDER', 'ITEM'));

alter table public.statuses drop constraint statuses_company_id_name_key;
alter table public.statuses add constraint statuses_company_id_scope_name_key unique (company_id, scope, name);

-- order_items.status was free text; replace it with a proper FK so items
-- can only be set to a status the company has configured.
alter table public.order_items add column status_id uuid references public.statuses (id) on delete restrict;

create index order_items_status_id_idx on public.order_items (status_id);

-- Seed one default ITEM status per company that already has orders, and
-- point every existing item at it (all pre-existing rows are 'PENDENTE').
insert into public.statuses (company_id, name, position, color, is_final, active, scope)
select distinct company_id, 'PENDENTE', 1, '#64748b', false, true, 'ITEM'
from public.orders
on conflict (company_id, scope, name) do nothing;

update public.order_items oi
set status_id = s.id
from public.orders o, public.statuses s
where oi.order_id = o.id
  and s.company_id = o.company_id
  and s.scope = 'ITEM'
  and s.name = 'PENDENTE'
  and oi.status_id is null;

alter table public.order_items drop column status;
