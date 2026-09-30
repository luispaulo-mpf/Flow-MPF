-- Test meetings were removed from the app: drop the flag and its delete
-- function, and restore one meeting per company per date.
drop function if exists public.delete_test_meeting(uuid);
drop index if exists public.meetings_company_date_real_key;
alter table public.meetings drop column is_test;
alter table public.meetings
  add constraint meetings_company_id_meeting_date_key unique (company_id, meeting_date);
