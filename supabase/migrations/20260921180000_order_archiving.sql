-- MPF Flow: automatic archiving of orders that have sat in a final
-- (is_final) status for longer than the company's configured window.
-- Archiving never deletes data — it only sets orders.archived_at so the
-- order drops off the Kanban board / active pedidos list while staying
-- fully retrievable (items, tasks, comments, attachments, history) in the
-- "Arquivados" view.

alter table public.companies
  add column completed_archive_days int not null default 20;

alter table public.orders
  add column archived_at timestamptz;

create index orders_active_idx on public.orders (company_id) where archived_at is null;
