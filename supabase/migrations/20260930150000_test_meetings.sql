-- Test meetings: a sandbox to try the meeting flow on real orders without
-- polluting the record. They never feed real meetings (participants,
-- pendências, lot notes, "previous meeting"), may share a date with a real
-- one, and can be deleted together with everything created in them.

alter table public.meetings add column is_test boolean not null default false;

alter table public.meetings drop constraint meetings_company_id_meeting_date_key;
create unique index meetings_company_date_real_key
  on public.meetings (company_id, meeting_date) where not is_test;

-- Deletes a TEST meeting and the pendências (tasks) created in it, plus
-- their activity-log lines. Real meetings can't be deleted.
create or replace function public.delete_test_meeting(p_meeting_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_is_test boolean;
begin
  select company_id, is_test into v_company, v_is_test from public.meetings where id = p_meeting_id;
  if v_company is null or v_company <> public.current_company_id() then
    raise exception 'Reunião não encontrada';
  end if;
  if public.current_role() not in ('ADMIN', 'GESTOR') then
    raise exception 'Sem permissão';
  end if;
  if not v_is_test then
    raise exception 'Somente reuniões de teste podem ser excluídas';
  end if;

  delete from public.activity_logs
    where task_id in (select id from public.tasks where meeting_id = p_meeting_id);
  delete from public.tasks where meeting_id = p_meeting_id;
  delete from public.meetings where id = p_meeting_id;
end;
$$;

revoke all on function public.delete_test_meeting(uuid) from public, anon;
grant execute on function public.delete_test_meeting(uuid) to authenticated;
