-- order_items had select/insert/update policies but no delete policy, so
-- RLS silently blocked every delete (0 rows matched) instead of erroring.
-- That made the ERP re-import "replace items" step a no-op deletion,
-- duplicating items on every re-import of the same order.

create policy order_items_delete on public.order_items
  for delete to authenticated
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
  );
