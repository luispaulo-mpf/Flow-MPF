-- Harden function search_path and restrict RPC surface flagged by the linter.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.sync_task_completed_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'DONE' and old.status is distinct from 'DONE' then
    new.completed_at = now();
  elsif new.status <> 'DONE' and old.status = 'DONE' then
    new.completed_at = null;
  end if;
  return new;
end;
$$;

-- enforce_user_update_permissions is a trigger-only function; it must not be
-- directly callable over PostgREST.
revoke execute on function public.enforce_user_update_permissions() from public, anon, authenticated;

-- current_company_id/current_role are safe to expose (they only reflect the
-- caller's own row and return null for anon), but tighten anon access anyway.
revoke execute on function public.current_company_id() from anon;
revoke execute on function public.current_role() from anon;
grant execute on function public.current_company_id() to authenticated;
grant execute on function public.current_role() to authenticated;
