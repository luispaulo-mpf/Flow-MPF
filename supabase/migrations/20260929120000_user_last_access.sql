-- Last time each user actually used the app. Sessions stay signed in for
-- days, so auth.users.last_sign_in_at only tells when the password was typed;
-- auth.sessions is refreshed (~hourly) while the app is open. auth.* isn't
-- exposed through the API, so an ADMIN reads it through this function,
-- scoped to their own company.
create or replace function public.company_users_last_access()
returns table (user_id uuid, last_access_at timestamptz)
language sql
security definer
stable
set search_path = public
as $$
  select u.id, max(coalesce(s.refreshed_at::timestamptz, s.updated_at, s.created_at))
  from public.users u
  left join auth.sessions s on s.user_id = u.id
  where u.company_id = public.current_company_id()
    and public.current_role() = 'ADMIN'
  group by u.id;
$$;

revoke all on function public.company_users_last_access() from public, anon;
grant execute on function public.company_users_last_access() to authenticated;
