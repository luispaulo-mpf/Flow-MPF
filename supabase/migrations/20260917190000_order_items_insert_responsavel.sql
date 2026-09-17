-- Align order_items INSERT with its UPDATE/DELETE policies: a RESPONSAVEL
-- should be able to add items to orders they own, not just edit/remove
-- existing ones (needed for the "Adicionar item" action on order detail).

drop policy order_items_insert on public.order_items;

create policy order_items_insert on public.order_items
  for insert to authenticated
  with check (
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
