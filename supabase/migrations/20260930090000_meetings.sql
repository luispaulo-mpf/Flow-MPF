-- Weekly alignment meetings ("Reuniões de alinhamento semanal").
--
-- The agenda (billing of the week, late orders, attention points) is computed
-- live from orders/items while a meeting is open and frozen into
-- meetings.snapshot when it is closed. Action items ("pendências") are plain
-- tasks tagged with meeting_area, so they show up in "Minhas tarefas" and keep
-- showing up in every following meeting until done. meeting_task_reviews
-- records each pendência's status as it stood in each closed meeting.
-- Everyone in the company can read; ADMIN/GESTOR conduct (write).

create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  meeting_date date not null,
  status text not null default 'OPEN' check (status in ('OPEN', 'CLOSED')),
  notes jsonb not null default '{}'::jsonb,
  snapshot jsonb,
  created_by uuid references public.users (id) on delete set null,
  closed_by uuid references public.users (id) on delete set null,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, meeting_date)
);

create trigger meetings_set_updated_at before update on public.meetings
  for each row execute function public.set_updated_at();

create table public.meeting_participants (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  user_id uuid references public.users (id) on delete set null,
  name text not null,
  created_at timestamptz not null default now()
);
create index meeting_participants_meeting_idx on public.meeting_participants (meeting_id);

-- Per order delivery lot (order + ERP delivery date): committed flag, reason
-- and a forecast agreed in the meeting. Never changes the ERP date.
create table public.meeting_order_notes (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  delivery_date date not null,
  committed boolean not null default false,
  reason text,
  forecast_date date,
  updated_by uuid references public.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (meeting_id, order_id, delivery_date)
);
create index meeting_order_notes_order_idx on public.meeting_order_notes (order_id, delivery_date);

alter table public.tasks
  add column meeting_id uuid references public.meetings (id) on delete set null,
  add column meeting_area text check (meeting_area in ('PRODUCAO', 'COMPRAS', 'ENGENHARIA', 'COLETAS', 'GERAL'));
create index tasks_meeting_area_idx on public.tasks (company_id) where meeting_area is not null;

create table public.meeting_task_reviews (
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  status_at_meeting text not null,
  primary key (meeting_id, task_id)
);
create index meeting_task_reviews_task_idx on public.meeting_task_reviews (task_id);

alter table public.meetings enable row level security;
alter table public.meeting_participants enable row level security;
alter table public.meeting_order_notes enable row level security;
alter table public.meeting_task_reviews enable row level security;

create policy meetings_select on public.meetings
  for select to authenticated
  using (company_id = public.current_company_id());

create policy meetings_write on public.meetings
  for all to authenticated
  using (company_id = public.current_company_id() and public.current_role() in ('ADMIN', 'GESTOR'))
  with check (company_id = public.current_company_id() and public.current_role() in ('ADMIN', 'GESTOR'));

create policy meeting_participants_select on public.meeting_participants
  for select to authenticated
  using (exists (select 1 from public.meetings m
    where m.id = meeting_id and m.company_id = public.current_company_id()));

create policy meeting_participants_write on public.meeting_participants
  for all to authenticated
  using (public.current_role() in ('ADMIN', 'GESTOR') and exists (select 1 from public.meetings m
    where m.id = meeting_id and m.company_id = public.current_company_id()))
  with check (public.current_role() in ('ADMIN', 'GESTOR') and exists (select 1 from public.meetings m
    where m.id = meeting_id and m.company_id = public.current_company_id()));

create policy meeting_order_notes_select on public.meeting_order_notes
  for select to authenticated
  using (exists (select 1 from public.meetings m
    where m.id = meeting_id and m.company_id = public.current_company_id()));

create policy meeting_order_notes_write on public.meeting_order_notes
  for all to authenticated
  using (public.current_role() in ('ADMIN', 'GESTOR') and exists (select 1 from public.meetings m
    where m.id = meeting_id and m.company_id = public.current_company_id()))
  with check (public.current_role() in ('ADMIN', 'GESTOR') and exists (select 1 from public.meetings m
    where m.id = meeting_id and m.company_id = public.current_company_id()));

create policy meeting_task_reviews_select on public.meeting_task_reviews
  for select to authenticated
  using (exists (select 1 from public.meetings m
    where m.id = meeting_id and m.company_id = public.current_company_id()));

create policy meeting_task_reviews_write on public.meeting_task_reviews
  for all to authenticated
  using (public.current_role() in ('ADMIN', 'GESTOR') and exists (select 1 from public.meetings m
    where m.id = meeting_id and m.company_id = public.current_company_id()))
  with check (public.current_role() in ('ADMIN', 'GESTOR') and exists (select 1 from public.meetings m
    where m.id = meeting_id and m.company_id = public.current_company_id()));
