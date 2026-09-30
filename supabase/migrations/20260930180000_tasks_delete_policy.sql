-- Tasks can be deleted by ADMIN/GESTOR, or by a RESPONSAVEL who created it.
create policy tasks_delete on public.tasks
  for delete to authenticated
  using (
    company_id = public.current_company_id()
    and (
      public.current_role() in ('ADMIN', 'GESTOR')
      or (public.current_role() = 'RESPONSAVEL' and created_by = auth.uid())
    )
  );
