-- MPF Flow: history tracking, stage automation, capacity/risk settings
-- See plan: indicadores de tempo/gargalo, automações de Engenharia/PCP,
-- prazo por item, capacidade de produção configurável.

-- =========================================================
-- companies: configurable capacity / risk window
-- =========================================================
alter table public.companies
  add column production_capacity_monthly int not null default 500,
  add column risk_window_days int not null default 2;

-- =========================================================
-- statuses: explicit stage role (drives Engenharia/PCP automation)
-- =========================================================
alter table public.statuses
  add column stage_key text check (stage_key in ('ENGENHARIA', 'PCP'));

create unique index statuses_stage_key_unique on public.statuses (company_id, stage_key)
  where stage_key is not null;

-- one-time data migration: tag the current live statuses that already
-- represent these stages, using the exact names in use today.
update public.statuses set stage_key = 'ENGENHARIA'
  where scope = 'ORDER' and name = 'ENGENHARIA';
update public.statuses set stage_key = 'PCP'
  where scope = 'ORDER' and name = 'ANÁLISE PCP';

-- =========================================================
-- order_items: engineering review selector + per-item delivery date
-- =========================================================
alter table public.order_items
  add column engineering_review text
    check (engineering_review in ('REVISADO', 'NECESSITA_PROJETO', 'NECESSITA_REVISAO')),
  add column delivery_date date;

-- =========================================================
-- tasks: optional link to a specific order item (automation dedup)
-- =========================================================
alter table public.tasks
  add column order_item_id uuid references public.order_items (id) on delete set null;

-- =========================================================
-- order_status_history / order_item_status_history (append-only)
-- =========================================================
create table public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete restrict,
  order_id uuid not null references public.orders (id) on delete cascade,
  status_id uuid not null references public.statuses (id) on delete restrict,
  entered_at timestamptz not null default now()
);

create index order_status_history_order_id_idx on public.order_status_history (order_id, entered_at);

create table public.order_item_status_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete restrict,
  order_item_id uuid not null references public.order_items (id) on delete cascade,
  status_id uuid not null references public.statuses (id) on delete restrict,
  entered_at timestamptz not null default now()
);

create index order_item_status_history_item_id_idx
  on public.order_item_status_history (order_item_id, entered_at);

alter table public.order_status_history enable row level security;
alter table public.order_item_status_history enable row level security;

create policy order_status_history_select on public.order_status_history
  for select to authenticated
  using (company_id = public.current_company_id());

create policy order_status_history_insert on public.order_status_history
  for insert to authenticated
  with check (
    company_id = public.current_company_id()
    and exists (
      select 1 from public.orders o
      where o.id = order_status_history.order_id
        and o.company_id = public.current_company_id()
        and (
          public.current_role() in ('ADMIN', 'GESTOR')
          or (public.current_role() = 'RESPONSAVEL' and o.responsible_user_id = auth.uid())
        )
    )
  );

create policy order_item_status_history_select on public.order_item_status_history
  for select to authenticated
  using (company_id = public.current_company_id());

create policy order_item_status_history_insert on public.order_item_status_history
  for insert to authenticated
  with check (
    company_id = public.current_company_id()
    and exists (
      select 1 from public.order_items i
      join public.orders o on o.id = i.order_id
      where i.id = order_item_status_history.order_item_id
        and o.company_id = public.current_company_id()
        and (
          public.current_role() in ('ADMIN', 'GESTOR')
          or (public.current_role() = 'RESPONSAVEL' and o.responsible_user_id = auth.uid())
        )
    )
  );

-- =========================================================
-- Backfill: approximate history from current state (no earlier data exists)
-- =========================================================
insert into public.order_status_history (company_id, order_id, status_id, entered_at)
select company_id, id, status_id, created_at
from public.orders
where status_id is not null;

insert into public.order_item_status_history (company_id, order_item_id, status_id, entered_at)
select o.company_id, i.id, i.status_id, i.created_at
from public.order_items i
join public.orders o on o.id = i.order_id
where i.status_id is not null;
