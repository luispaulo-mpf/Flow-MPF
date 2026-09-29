-- Recuperação dos dados dos itens perdidos na importação de 29/09 (07:15 e 08:14).
-- A importação antiga apagava e recriava os itens dos pedidos já existentes.
-- Este script reconstrói, a partir de activity_logs:
--   1) status atual de cada item
--   2) revisão de engenharia de cada item
--   3) vínculo das tarefas de engenharia ("… — Item <código>") com o item
--   4) histórico de status dos itens (usado no dashboard)
-- Cópia do estado anterior em: recovery_20260929.order_items / tasks / order_item_status_history

begin;

create temp table ev on commit drop as
select l.created_at, l.company_id, m[2] pedido, m[1] item_desc, m[3] status_nome
from activity_logs l, lateral regexp_match(l.description, '^Item "(.*)" do pedido (\S+) movido para "(.*)"\.$') m
where l.description like 'Item "%movido para%';

-- 1) status atual dos itens = último evento
with last_ev as (
  select distinct on (pedido, item_desc) * from ev order by pedido, item_desc, created_at desc
)
update order_items oi set status_id = s.id
from last_ev e, orders o, statuses s
where o.id = oi.order_id and o.erp_order_number = e.pedido and oi.description = e.item_desc
  and s.company_id = o.company_id and s.scope = 'ITEM' and s.name = e.status_nome;

-- 2) revisão de engenharia = último evento
with rv as (
  select distinct on (m[2], m[1]) m[2] pedido, m[1] item_desc, m[3] valor
  from activity_logs l, lateral regexp_match(l.description, '^Revisão de engenharia do item "(.*)" do pedido (\S+) definida como "(.*)"\.$') m
  order by m[2], m[1], l.created_at desc
)
update order_items oi set engineering_review = rv.valor
from rv, orders o
where o.id = oi.order_id and o.erp_order_number = rv.pedido and oi.description = rv.item_desc;

-- 3) religar tarefas de engenharia ao item
update tasks t set order_item_id = x.item_id
from (
  select t2.id task_id,
    (select oi.id from order_items oi where oi.order_id = t2.order_id
       and oi.erp_item_code = substring(t2.title from ' — Item (\S+)$') order by oi.created_at limit 1) item_id
  from tasks t2 where t2.title ~ ' — Item \S+$' and t2.order_item_id is null
) x
where t.id = x.task_id and x.item_id is not null;

-- 4) histórico de status dos itens reconstruído a partir do log
create temp table itens_ev on commit drop as
select distinct oi.id from order_items oi join orders o on o.id = oi.order_id
join ev on ev.pedido = o.erp_order_number and ev.item_desc = oi.description;

delete from order_item_status_history h using itens_ev i where h.order_item_id = i.id;

insert into order_item_status_history (company_id, order_item_id, status_id, entered_at)
select o.company_id, oi.id,
  (select id from statuses where company_id = o.company_id and scope = 'ITEM' and active order by position limit 1),
  o.created_at
from order_items oi join orders o on o.id = oi.order_id join itens_ev i on i.id = oi.id;

insert into order_item_status_history (company_id, order_item_id, status_id, entered_at)
select company_id, item_id, status_id, created_at from (
  select o.company_id, oi.id item_id, s.id status_id, ev.created_at,
    lag(s.id) over (partition by oi.id order by ev.created_at) prev
  from ev join orders o on o.erp_order_number = ev.pedido
  join order_items oi on oi.order_id = o.id and oi.description = ev.item_desc
  join statuses s on s.company_id = o.company_id and s.scope = 'ITEM' and s.name = ev.status_nome
) z where prev is distinct from status_id;

commit;
