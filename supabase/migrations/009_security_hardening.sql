-- Nursing Audit Hub — security hardening found by testing on a real Supabase dev project
-- Apply after 001–008. Safe to run more than once.
--
-- Why: Supabase grants EXECUTE on new public functions to anon and
-- authenticated by default, so "revoke ... from anon" alone left some
-- functions callable without signing in (exam scoring, certificate numbers).
-- The verification view also let anyone list every certificate holder.

begin;

-- 1. Function access ------------------------------------------------------------

-- Exams need a signed-in user.
revoke execute on function public.score_exam(uuid, jsonb, text, uuid) from public, anon;
grant execute on function public.score_exam(uuid, jsonb, text, uuid) to authenticated;

-- Serial numbers: column defaults for signed-in inserts; never callable signed out.
revoke execute on function public.next_certificate_number() from public, anon;
revoke execute on function public.next_report_serial() from public, anon;
grant execute on function public.next_certificate_number(), public.next_report_serial() to authenticated;

-- Role helpers and certificate issuing: signed-in only (RLS policies call the helpers).
revoke execute on function public.is_admin(), public.is_admin_or_auditor(), public.my_role(), public.issue_session_certificates(uuid) from public, anon;
grant execute on function public.is_admin(), public.is_admin_or_auditor(), public.my_role(), public.issue_session_certificates(uuid) to authenticated;

-- Trigger functions are not an API.
revoke execute on function public.handle_new_user(), public.site_content_stamp() from public, anon, authenticated;

-- Fixed search_path on helpers that lacked one.
alter function public.action_status(date, integer, text) set search_path = public;
alter function public.planned_status(date, text) set search_path = public;

-- 2. Certificate verification: one number at a time, no listing ---------------------

create or replace function public.verify_certificate(p_number text)
returns table (number text, trainee_name text, title text, issued_on date)
language sql stable security definer set search_path = public as $$
  select c.number, c.trainee_name, coalesce(c.title, co.name), c.issued_on
  from public.certificates c left join public.courses co on co.id = c.course_id
  where c.number = p_number and p_number ~ '^NA-CERT-[0-9]{4}-[0-9]{4,}$';
$$;
revoke all on function public.verify_certificate(text) from public;
grant execute on function public.verify_certificate(text) to anon, authenticated;

drop view if exists public.public_certificate_verification;

-- 3. Performance ------------------------------------------------------------------

drop policy if exists own_role_read on public.user_roles;
create policy own_role_read on public.user_roles for select to authenticated using (user_id = (select auth.uid()));

create index if not exists planned_audits_ward_idx on public.planned_audits(ward_id);
create index if not exists unplanned_audits_ward_idx on public.unplanned_audits(ward_id);
create index if not exists pending_audits_ward_idx on public.pending_audits(ward_id);
create index if not exists action_plans_ward_idx on public.action_plans(ward_id);
create index if not exists reports_ward_idx on public.reports(ward_id);
create index if not exists report_status_history_report_idx on public.report_status_history(report_id);
create index if not exists training_sessions_hospital_idx on public.training_sessions(hospital_id);
create index if not exists training_sessions_ward_idx on public.training_sessions(ward_id);
create index if not exists training_attendance_ward_idx on public.training_attendance(ward_id);
create index if not exists certificates_session_idx on public.certificates(session_id);
create index if not exists wards_department_idx on public.wards(department_id, hospital_id);

commit;
