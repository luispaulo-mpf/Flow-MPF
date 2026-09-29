-- @mentions on comments + in-app notifications ("bate-papo" on orders/tasks).
--
-- A comment stores who it mentions. A trigger fans each new comment out into
-- notifications for: mentioned users (MENTION) and everyone already in that
-- conversation — previous commenters plus the order's/task's responsible and
-- the task's creator (REPLY). The author is never notified of their own
-- comment. Notifications are only written by the trigger (security definer),
-- so users can read and mark as read only their own.

alter table public.comments
  add column mentioned_user_ids uuid[] not null default '{}';

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  actor_id uuid references public.users (id) on delete set null,
  comment_id uuid not null references public.comments (id) on delete cascade,
  order_id uuid references public.orders (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete cascade,
  kind text not null check (kind in ('MENTION', 'REPLY')),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_unread_idx
  on public.notifications (user_id, created_at desc) where read_at is null;
create index notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

create policy notifications_select on public.notifications
  for select to authenticated
  using (user_id = auth.uid());

create policy notifications_update on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.notify_comment_recipients()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (company_id, user_id, actor_id, comment_id, order_id, task_id, kind)
  select new.company_id, r.user_id, new.user_id, new.id, new.order_id, new.task_id,
    case when r.user_id = any (new.mentioned_user_ids) then 'MENTION' else 'REPLY' end
  from (
    select unnest(new.mentioned_user_ids) as user_id
    union
    select c.user_id from public.comments c
      where c.id <> new.id
        and ((new.order_id is not null and c.order_id = new.order_id)
          or (new.task_id is not null and c.task_id = new.task_id))
    union
    select o.responsible_user_id from public.orders o where o.id = new.order_id
    union
    select t.responsible_user_id from public.tasks t where t.id = new.task_id
    union
    select t.created_by from public.tasks t where t.id = new.task_id
  ) r
  join public.users u on u.id = r.user_id
  where r.user_id is not null
    and r.user_id <> new.user_id
    and u.company_id = new.company_id
    and u.active;

  return new;
end;
$$;

create trigger notify_comment_recipients after insert on public.comments
  for each row execute function public.notify_comment_recipients();

revoke all on function public.notify_comment_recipients() from public, anon, authenticated;

-- Realtime: live conversations and the notification bell.
alter publication supabase_realtime add table public.comments;
alter publication supabase_realtime add table public.notifications;
