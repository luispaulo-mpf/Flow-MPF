-- MPF Flow: initial schema
-- Companies, users, orders, order_items, tasks, statuses, comments, activity_logs

create extension if not exists pgcrypto;

-- =========================================================
-- companies
-- =========================================================
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================================
-- users (application profile, 1:1 with auth.users)
-- =========================================================
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete restrict,
  name text not null,
  email text not null,
  role text not null default 'RESPONSAVEL'
    check (role in ('ADMIN', 'GESTOR', 'RESPONSAVEL', 'VISUALIZACAO')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index users_company_id_idx on public.users (company_id);

-- =========================================================
-- statuses (configurable per company)
-- =========================================================
create table public.statuses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete restrict,
  name text not null,
  position int not null default 0,
  color text not null default '#64748b',
  is_final boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, name)
);

create index statuses_company_id_idx on public.statuses (company_id);

-- =========================================================
-- orders
-- =========================================================
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete restrict,
  erp_order_number text not null,
  customer_name text not null,
  issue_date date,
  delivery_date date,
  total_value numeric(14, 2),
  status_id uuid references public.statuses (id) on delete restrict,
  responsible_user_id uuid references public.users (id) on delete set null,
  priority text not null default 'NORMAL'
    check (priority in ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, erp_order_number)
);

create index orders_company_id_idx on public.orders (company_id);
create index orders_delivery_date_idx on public.orders (delivery_date);
create index orders_status_id_idx on public.orders (status_id);
create index orders_responsible_user_id_idx on public.orders (responsible_user_id);

-- =========================================================
-- order_items
-- =========================================================
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  erp_item_code text,
  description text not null,
  quantity numeric(14, 3) not null default 0,
  unit text,
  status text not null default 'PENDENTE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index order_items_order_id_idx on public.order_items (order_id);

-- =========================================================
-- tasks
-- =========================================================
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete restrict,
  order_id uuid references public.orders (id) on delete set null,
  title text not null,
  description text,
  responsible_user_id uuid references public.users (id) on delete set null,
  created_by uuid not null references public.users (id) on delete restrict,
  status text not null default 'TODO'
    check (status in ('TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE')),
  priority text not null default 'NORMAL'
    check (priority in ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
  due_date date,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tasks_company_id_idx on public.tasks (company_id);
create index tasks_order_id_idx on public.tasks (order_id);
create index tasks_responsible_user_id_idx on public.tasks (responsible_user_id);
create index tasks_due_date_idx on public.tasks (due_date);

-- =========================================================
-- comments
-- =========================================================
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete restrict,
  order_id uuid references public.orders (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete restrict,
  content text not null,
  created_at timestamptz not null default now(),
  constraint comments_target_check check (order_id is not null or task_id is not null)
);

create index comments_company_id_idx on public.comments (company_id);
create index comments_order_id_idx on public.comments (order_id);
create index comments_task_id_idx on public.comments (task_id);

-- =========================================================
-- activity_logs
-- =========================================================
create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete restrict,
  user_id uuid references public.users (id) on delete set null,
  order_id uuid references public.orders (id) on delete set null,
  task_id uuid references public.tasks (id) on delete set null,
  action text not null,
  description text,
  created_at timestamptz not null default now()
);

create index activity_logs_company_id_idx on public.activity_logs (company_id);
create index activity_logs_order_id_idx on public.activity_logs (order_id);
create index activity_logs_task_id_idx on public.activity_logs (task_id);

-- =========================================================
-- updated_at trigger
-- =========================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_updated_at before update on public.companies
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.users
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.statuses
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.orders
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.order_items
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();

-- =========================================================
-- tasks.completed_at kept consistent with status
-- =========================================================
create or replace function public.sync_task_completed_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'DONE' and old.status is distinct from 'DONE' then
    new.completed_at = now();
  elsif new.status <> 'DONE' and old.status = 'DONE' then
    new.completed_at = null;
  end if;
  return new;
end;
$$;

create trigger sync_task_completed_at before update on public.tasks
  for each row execute function public.sync_task_completed_at();
