-- Emoji reactions on chat messages (comments). Fixed set of emojis, one of
-- each per user per message, no notifications.

create table public.comment_reactions (
  comment_id uuid not null references public.comments (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  emoji text not null check (emoji in ('👍', '✅', '👀', '🙏', '❤️', '😂')),
  company_id uuid not null references public.companies (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id, emoji)
);

create index comment_reactions_company_id_idx on public.comment_reactions (company_id);

-- company_id always comes from the comment, never from the client.
create or replace function public.set_comment_reaction_company()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select company_id into new.company_id from public.comments where id = new.comment_id;
  return new;
end;
$$;

create trigger set_comment_reaction_company
  before insert on public.comment_reactions
  for each row execute function public.set_comment_reaction_company();

revoke all on function public.set_comment_reaction_company() from public, anon, authenticated;

alter table public.comment_reactions enable row level security;

create policy comment_reactions_select on public.comment_reactions
  for select to authenticated
  using (company_id = public.current_company_id());

create policy comment_reactions_insert on public.comment_reactions
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and company_id = public.current_company_id()
    and public.current_role() <> 'VISUALIZACAO'
  );

create policy comment_reactions_delete on public.comment_reactions
  for delete to authenticated
  using (user_id = auth.uid());

alter publication supabase_realtime add table public.comment_reactions;
