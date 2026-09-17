-- File attachments on orders, stored in a private Supabase Storage bucket.
-- Object path convention: {company_id}/{order_id}/{uuid}-{original_filename}
-- so storage policies can enforce the same company/role rules as the rest
-- of the app using storage.foldername(name).

create table public.order_attachments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete restrict,
  order_id uuid not null references public.orders (id) on delete cascade,
  uploaded_by uuid references public.users (id) on delete set null,
  file_name text not null,
  storage_path text not null,
  content_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

create index order_attachments_order_id_idx on public.order_attachments (order_id);
create index order_attachments_company_id_idx on public.order_attachments (company_id);

alter table public.order_attachments enable row level security;

create policy order_attachments_select on public.order_attachments
  for select to authenticated
  using (company_id = public.current_company_id());

create policy order_attachments_insert on public.order_attachments
  for insert to authenticated
  with check (
    company_id = public.current_company_id()
    and exists (
      select 1 from public.orders o
      where o.id = order_attachments.order_id
        and o.company_id = public.current_company_id()
        and (
          public.current_role() in ('ADMIN', 'GESTOR')
          or (public.current_role() = 'RESPONSAVEL' and o.responsible_user_id = auth.uid())
        )
    )
  );

create policy order_attachments_delete on public.order_attachments
  for delete to authenticated
  using (
    company_id = public.current_company_id()
    and exists (
      select 1 from public.orders o
      where o.id = order_attachments.order_id
        and o.company_id = public.current_company_id()
        and (
          public.current_role() in ('ADMIN', 'GESTOR')
          or (public.current_role() = 'RESPONSAVEL' and o.responsible_user_id = auth.uid())
        )
    )
  );

-- =========================================================
-- storage bucket + policies
-- =========================================================
insert into storage.buckets (id, name, public)
values ('order-attachments', 'order-attachments', false)
on conflict (id) do nothing;

create policy order_attachments_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'order-attachments'
    and (storage.foldername(name))[1] = public.current_company_id()::text
  );

create policy order_attachments_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'order-attachments'
    and (storage.foldername(name))[1] = public.current_company_id()::text
    and exists (
      select 1 from public.orders o
      where o.id::text = (storage.foldername(name))[2]
        and o.company_id = public.current_company_id()
        and (
          public.current_role() in ('ADMIN', 'GESTOR')
          or (public.current_role() = 'RESPONSAVEL' and o.responsible_user_id = auth.uid())
        )
    )
  );

create policy order_attachments_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'order-attachments'
    and (storage.foldername(name))[1] = public.current_company_id()::text
    and exists (
      select 1 from public.orders o
      where o.id::text = (storage.foldername(name))[2]
        and o.company_id = public.current_company_id()
        and (
          public.current_role() in ('ADMIN', 'GESTOR')
          or (public.current_role() = 'RESPONSAVEL' and o.responsible_user_id = auth.uid())
        )
    )
  );
