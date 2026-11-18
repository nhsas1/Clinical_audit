-- Nursing Audit Hub — sign-in and roles (Part B4)
-- Simulation only. Fictional sample data. No patient or staff records.
-- Apply to a Supabase dev branch or dev project first, never straight to production.
-- Safe to run more than once.
--
-- Roles (public.user_roles.role)
--   viewer   read every page
--   auditor  viewer + write audit programme records (audits, pending, actions, reports, initiatives)
--   admin    auditor + reference data, liaisons, courses, roles, site text
-- Signed out (anon)
--   reads only the hospital/ward structure and the limited public_dashboard()
--   function behind the Overview; no names, owners, findings or free text.

begin;

-- 1. Every new account gets a role row (viewer). Admins promote in SQL or later in the UI.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_roles(user_id, role) values (new.id, 'viewer') on conflict (user_id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
insert into public.user_roles(user_id, role) select id, 'viewer' from auth.users on conflict (user_id) do nothing;

create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.user_roles where user_id = auth.uid();
$$;
revoke all on function public.my_role() from public;
grant execute on function public.my_role() to authenticated;

-- Users can read their own role; admins can read and manage all (admin_write from 001).
drop policy if exists own_role_read on public.user_roles;
create policy own_role_read on public.user_roles for select to authenticated using (user_id = auth.uid());

-- 2. Reads: structure is public, everything else needs a signed-in user.
do $$
declare t text; begin
  foreach t in array array['hospitals','departments','wards','standards_topics','courses'] loop
    execute format('drop policy if exists viewer_read on public.%I', t);
    execute format('create policy viewer_read on public.%I for select using (true)', t);
  end loop;
  foreach t in array array['compliance_scores','planned_audits','unplanned_audits','pending_audits','action_plans','audit_tools','references_library','reports','report_references','report_status_history','qi_projects','training_resources','liaisons'] loop
    execute format('drop policy if exists viewer_read on public.%I', t);
    execute format('create policy viewer_read on public.%I for select to authenticated using (true)', t);
  end loop;
end $$;

-- Views respect the caller's RLS instead of the owner's.
alter view public.report_register set (security_invoker = true);
alter view public.audit_results set (security_invoker = true);
alter view public.latest_audit_results set (security_invoker = true);
alter view public.compliance_by_standard set (security_invoker = true);
alter view public.overview_kpis set (security_invoker = true);
revoke select on public.report_register, public.audit_results, public.latest_audit_results, public.compliance_by_standard, public.overview_kpis from anon;

-- Exams need a signed-in user now (signed-out users see dashboards only).
revoke execute on function public.score_exam(uuid, jsonb, text, uuid) from anon;

-- 3. The one thing signed-out users can read: the minimum fields behind the Overview.
create or replace function public.public_dashboard()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'planned', coalesce((select jsonb_agg(jsonb_build_object('ref', ref, 'topic_id', topic_id, 'ward_id', ward_id, 'quarter', quarter, 'due_date', due_date, 'status', status, 'score', score)) from public.planned_audits), '[]'),
    'unplanned', coalesce((select jsonb_agg(jsonb_build_object('ref', ref, 'ward_id', ward_id, 'raised_on', raised_on, 'priority', priority, 'status', status, 'trigger_type', trigger_type, 'topic_id', topic_id, 'score', score)) from public.unplanned_audits), '[]'),
    'pending', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'audit_ref', audit_ref, 'ward_id', ward_id, 'waiting_for', waiting_for, 'since_date', since_date)) from public.pending_audits), '[]'),
    'actions', coalesce((select jsonb_agg(jsonb_build_object('ref', ref, 'ward_id', ward_id, 'topic_id', topic_id, 'due_date', due_date, 'progress', progress, 'status', status, 'audit_ref', audit_ref)) from public.action_plans), '[]'),
    'reports', coalesce((select jsonb_agg(jsonb_build_object('serial', r.serial, 'ward_id', r.ward_id, 'audit_ref', r.audit_ref,
                 'history', coalesce((select jsonb_agg(jsonb_build_object('stage', h.stage, 'date', h.reached_on::date) order by h.reached_on) from public.report_status_history h where h.report_id = r.id), '[]'))) from public.reports r), '[]')
  );
$$;
revoke all on function public.public_dashboard() from public;
grant execute on function public.public_dashboard() to anon, authenticated;

commit;
