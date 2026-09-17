-- MPF Flow: Row Level Security
-- Multi-tenant isolation by company_id, driven by the authenticated user's
-- own public.users row. Helper functions are SECURITY DEFINER so they can
-- read public.users without triggering recursive RLS checks on that table.

create or replace function public.current_company_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select company_id from public.users where id = auth.uid();
$$;

create or replace function public.current_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from public.users where id = auth.uid();
$$;

-- Prevent non-admins from escalating their own role/active flag or
-- switching company, even though they may update their own users row.
create or replace function public.enforce_user_update_permissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_role() <> 'ADMIN' then
    if new.role is distinct from old.role
      or new.active is distinct from old.active
      or new.company_id is distinct from old.company_id then
      raise exception 'Apenas ADMIN pode alterar role, ativo ou empresa do usuario';
    end if;
  end if;
  return new;
end;
$$;

create trigger enforce_user_update_permissions before update on public.users
  for each row execute function public.enforce_user_update_permissions();

alter table public.companies enable row level security;
alter table public.users enable row level security;
alter table public.statuses enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.tasks enable row level security;
alter table public.comments enable row level security;
alter table public.activity_logs enable row level security;

-- =========================================================
-- companies
-- =========================================================
create policy companies_select on public.companies
  for select to authenticated
  using (id = public.current_company_id());

create policy companies_update on public.companies
  for update to authenticated
  using (id = public.current_company_id() and public.current_role() = 'ADMIN')
  with check (id = public.current_company_id());

-- =========================================================
-- users
-- =========================================================
create policy users_select on public.users
  for select to authenticated
  using (company_id = public.current_company_id());

create policy users_insert on public.users
  for insert to authenticated
  with check (company_id = public.current_company_id() and public.current_role() = 'ADMIN');

create policy users_update on public.users
  for update to authenticated
  using (
    company_id = public.current_company_id()
    and (public.current_role() = 'ADMIN' or id = auth.uid())
  )
  with check (company_id = public.current_company_id());

-- =========================================================
-- statuses
-- =========================================================
create policy statuses_select on public.statuses
  for select to authenticated
  using (company_id = public.current_company_id());

create policy statuses_write on public.statuses
  for all to authenticated
  using (company_id = public.current_company_id() and public.current_role() = 'ADMIN')
  with check (company_id = public.current_company_id() and public.current_role() = 'ADMIN');

-- =========================================================
-- orders
-- =========================================================
create policy orders_select on public.orders
  for select to authenticated
  using (company_id = public.current_company_id());

create policy orders_insert on public.orders
  for insert to authenticated
  with check (
    company_id = public.current_company_id()
    and public.current_role() in ('ADMIN', 'GESTOR')
  );

create policy orders_update on public.orders
  for update to authenticated
  using (
    company_id = public.current_company_id()
    and (
      public.current_role() in ('ADMIN', 'GESTOR')
      or (public.current_role() = 'RESPONSAVEL' and responsible_user_id = auth.uid())
    )
  )
  with check (company_id = public.current_company_id());

-- =========================================================
-- order_items (no company_id column: join through orders)
-- =========================================================
create policy order_items_select on public.order_items
  for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and o.company_id = public.current_company_id()
    )
  );

create policy order_items_insert on public.order_items
  for insert to authenticated
  with check (
    public.current_role() in ('ADMIN', 'GESTOR')
    and exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and o.company_id = public.current_company_id()
    )
  );

create policy order_items_update on public.order_items
  for update to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and o.company_id = public.current_company_id()
        and (
          public.current_role() in ('ADMIN', 'GESTOR')
          or (public.current_role() = 'RESPONSAVEL' and o.responsible_user_id = auth.uid())
        )
    )
  )
  with check (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and o.company_id = public.current_company_id()
    )
  );

-- =========================================================
-- tasks
-- =========================================================
create policy tasks_select on public.tasks
  for select to authenticated
  using (company_id = public.current_company_id());

create policy tasks_insert on public.tasks
  for insert to authenticated
  with check (
    company_id = public.current_company_id()
    and public.current_role() in ('ADMIN', 'GESTOR', 'RESPONSAVEL')
    and created_by = auth.uid()
  );

create policy tasks_update on public.tasks
  for update to authenticated
  using (
    company_id = public.current_company_id()
    and (
      public.current_role() in ('ADMIN', 'GESTOR')
      or (
        public.current_role() = 'RESPONSAVEL'
        and (responsible_user_id = auth.uid() or created_by = auth.uid())
      )
    )
  )
  with check (company_id = public.current_company_id());

-- =========================================================
-- comments
-- =========================================================
create policy comments_select on public.comments
  for select to authenticated
  using (company_id = public.current_company_id());

create policy comments_insert on public.comments
  for insert to authenticated
  with check (
    company_id = public.current_company_id()
    and public.current_role() <> 'VISUALIZACAO'
    and user_id = auth.uid()
  );

create policy comments_delete on public.comments
  for delete to authenticated
  using (
    company_id = public.current_company_id()
    and (user_id = auth.uid() or public.current_role() = 'ADMIN')
  );

-- =========================================================
-- activity_logs
-- =========================================================
create policy activity_logs_select on public.activity_logs
  for select to authenticated
  using (company_id = public.current_company_id());

create policy activity_logs_insert on public.activity_logs
  for insert to authenticated
  with check (
    company_id = public.current_company_id()
    and public.current_role() <> 'VISUALIZACAO'
    and user_id = auth.uid()
  );
