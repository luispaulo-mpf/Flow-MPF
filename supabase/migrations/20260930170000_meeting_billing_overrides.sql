-- Billing adjustments decided in a meeting (never touching the ERP date):
-- included = order added to the billing by hand; excluded = taken off the
-- billing. forecast_date (existing) now also moves the lot to that day.
alter table public.meeting_order_notes
  add column included boolean not null default false,
  add column excluded boolean not null default false;
