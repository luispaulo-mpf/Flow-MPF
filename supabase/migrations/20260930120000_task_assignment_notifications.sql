-- Notify a user in the bell when a task (or meeting pendência) is assigned to
-- them: on creation with a responsible, and whenever the responsible changes.
-- Done in the database so every path is covered (manual tasks, meeting
-- pendências, PCP/engineering automations). Assigning to yourself is silent.

alter table public.notifications alter column comment_id drop not null;
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications
  add constraint notifications_kind_check check (kind in ('MENTION', 'REPLY', 'TASK_ASSIGNED'));

create or replace function public.notify_task_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.responsible_user_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.responsible_user_id is not distinct from old.responsible_user_id then
    return new;
  end if;
  if new.responsible_user_id = auth.uid() then
    return new;
  end if;

  insert into public.notifications (company_id, user_id, actor_id, order_id, task_id, kind)
  select new.company_id, u.id, auth.uid(), new.order_id, new.id, 'TASK_ASSIGNED'
  from public.users u
  where u.id = new.responsible_user_id
    and u.company_id = new.company_id
    and u.active;

  return new;
end;
$$;

create trigger notify_task_assignment
  after insert or update of responsible_user_id on public.tasks
  for each row execute function public.notify_task_assignment();

revoke all on function public.notify_task_assignment() from public, anon, authenticated;
