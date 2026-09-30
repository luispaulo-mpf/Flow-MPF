-- "Aguardando cliente": an order held in Engenharia or Financeiro because the
-- customer still owes information. The wait is recorded as a period so stage
-- time can discount it (the sector isn't penalised), and after 3 days a
-- follow-up task is created automatically.

create table public.order_client_waits (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete restrict,
  order_id uuid not null references public.orders (id) on delete cascade,
  status_id uuid references public.statuses (id) on delete set null,
  reason text not null,
  started_at timestamptz not null default now(),
  started_by uuid references public.users (id) on delete set null,
  ended_at timestamptz,
  ended_by uuid references public.users (id) on delete set null,
  task_id uuid references public.tasks (id) on delete set null,
  escalated_at timestamptz,
  created_at timestamptz not null default now()
);

create index order_client_waits_company_id_idx on public.order_client_waits (company_id);
create index order_client_waits_order_id_idx on public.order_client_waits (order_id);
-- At most one open wait per order.
create unique index order_client_waits_one_open_idx
  on public.order_client_waits (order_id) where ended_at is null;

alter table public.order_client_waits enable row level security;

create policy order_client_waits_select on public.order_client_waits
  for select to authenticated
  using (company_id = public.current_company_id());

create policy order_client_waits_insert on public.order_client_waits
  for insert to authenticated
  with check (
    company_id = public.current_company_id()
    and public.current_role() in ('ADMIN', 'GESTOR')
  );

create policy order_client_waits_update on public.order_client_waits
  for update to authenticated
  using (
    company_id = public.current_company_id()
    and public.current_role() in ('ADMIN', 'GESTOR')
  )
  with check (company_id = public.current_company_id());

-- Moving the order to another stage ends its wait (whoever moved it).
create or replace function public.end_client_wait_on_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status_id is distinct from old.status_id then
    update public.order_client_waits
       set ended_at = now(), ended_by = auth.uid()
     where order_id = new.id and ended_at is null;
  end if;
  return new;
end;
$$;

create trigger end_client_wait_on_status_change
  after update of status_id on public.orders
  for each row execute function public.end_client_wait_on_status_change();

revoke all on function public.end_client_wait_on_status_change() from public, anon, authenticated;

-- After 3 days waiting: one follow-up task per wait, for the order's
-- responsible (else whoever marked the wait). Runs hourly via pg_cron.
create or replace function public.escalate_client_waits()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  w record;
  new_task_id uuid;
  owner uuid;
begin
  for w in
    select cw.*, o.erp_order_number, o.customer_name, o.responsible_user_id,
           coalesce(s.name, 'etapa') as status_name
      from public.order_client_waits cw
      join public.orders o on o.id = cw.order_id
      left join public.statuses s on s.id = cw.status_id
     where cw.ended_at is null
       and cw.escalated_at is null
       and cw.started_at <= now() - interval '3 days'
  loop
    owner := coalesce(w.responsible_user_id, w.started_by);
    if owner is null then
      select id into owner from public.users
       where company_id = w.company_id and role = 'ADMIN' and active
       order by created_at limit 1;
    end if;
    if owner is null then
      continue;
    end if;

    insert into public.tasks (company_id, order_id, title, description, responsible_user_id,
                              created_by, priority, due_date)
    values (
      w.company_id,
      w.order_id,
      'Cobrar cliente: pedido ' || w.erp_order_number || ' parado em ' || w.status_name,
      w.customer_name || ' — aguardando cliente há mais de 3 dias. Pendente: ' || w.reason,
      owner,
      coalesce(w.started_by, owner),
      'HIGH',
      (now() at time zone 'America/Sao_Paulo')::date
    )
    returning id into new_task_id;

    update public.order_client_waits
       set task_id = new_task_id, escalated_at = now()
     where id = w.id;

    insert into public.activity_logs (company_id, user_id, order_id, task_id, action, description)
    values (w.company_id, null, w.order_id, new_task_id, 'Tarefa criada',
            'Aguardando cliente há mais de 3 dias: tarefa de cobrança criada automaticamente.');
  end loop;
end;
$$;

revoke all on function public.escalate_client_waits() from public, anon, authenticated;

create extension if not exists pg_cron;
select cron.schedule('escalate-client-waits', '0 * * * *', 'select public.escalate_client_waits()');
