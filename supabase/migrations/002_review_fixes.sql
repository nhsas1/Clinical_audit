-- Nursing Audit Hub — review fixes (Part A) and Overview change (Part B1)
-- Simulation only. Fictional sample data. No patient or staff data.
--
-- Apply to a Supabase dev branch or dev project first, never straight to
-- production. Safe to run more than once.
--
-- What it does
--   1. Schema: links unplanned audits to a standard and score, links action
--      plans to their source audit, and makes report status derive from the
--      lifecycle history.
--   2. Data: re-aligns the fictional seed so statuses agree across Planned,
--      Pending and Reports, adds the pressure injury policy placeholder,
--      seeds the 8 reports with their own references and dated history.
--   3. Views: removes the hospital-wide "overall compliance" figure, and
--      derives heatmap and by-standard scores from audit results instead of
--      the generated compliance_scores table.
--
-- The only rows it deletes are the 6 fictional pending-queue rows seeded by
-- 001 (their dates were computed from current_date, so they drifted), which
-- it re-inserts with fixed dates.

begin;

-- 1. Schema --------------------------------------------------------------------

alter table public.unplanned_audits add column if not exists topic_id uuid references public.standards_topics(id);
alter table public.unplanned_audits add column if not exists score numeric(5,2) check (score is null or score between 0 and 100);
alter table public.action_plans   add column if not exists audit_ref text;
alter table public.reports        add column if not exists audit_ref text;

-- Report status = the last stage reached in report_status_history.
create or replace view public.report_register as
select r.id, r.serial, r.title, r.ward_id, r.audit_ref,
       coalesce(h.reached_on::date, r.report_date) as report_date,
       case h.stage when 'Drafted' then 'Draft' when 'Peer reviewed' then 'Under review'
                    when 'Approved' then 'Approved' when 'Published' then 'Published'
                    when 'Action plan agreed' then 'Published' else r.status end as status,
       coalesce(pa.score, ua.score) as score
from public.reports r
left join lateral (select stage, reached_on from public.report_status_history x where x.report_id = r.id order by reached_on desc limit 1) h on true
left join public.planned_audits pa on pa.ref = r.audit_ref
left join public.unplanned_audits ua on ua.ref = r.audit_ref;
grant select on public.report_register to anon, authenticated;

-- A scheduled or in-progress audit past its due date is overdue.
create or replace function public.planned_status(due_date date, stored_status text)
returns text language sql stable as $$
  select case when stored_status = 'Completed' then 'Completed'
              when due_date < current_date then 'Overdue'
              when stored_status = 'Overdue' then 'Scheduled'
              else stored_status end;
$$;
grant execute on function public.planned_status(date, text) to anon, authenticated;

-- 2. Data ----------------------------------------------------------------------

update public.references_library set kind = 'Audit method' where code = 'HQIP-BPCA';
insert into public.references_library(code, title, kind, url) values
  ('POL-PI', 'Pressure injury prevention policy — internal code to be added', 'Internal policy', null)
on conflict (code) do nothing;

-- Overdue is derived; store the planned state.
update public.planned_audits set status = 'Scheduled' where ref in ('PA-008', 'PA-009') and status = 'Overdue';

update public.unplanned_audits u set topic_id = t.id
from (values ('UA-001','Medication Safety'), ('UA-003','IV Cannula'), ('UA-004','Falls Prevention'), ('UA-005','Documentation')) x(ref, topic)
join public.standards_topics t on t.name = x.topic
where u.ref = x.ref and u.topic_id is null;
update public.unplanned_audits set score = 88 where ref = 'UA-004' and score is null;

update public.action_plans a set audit_ref = x.audit_ref
from (values ('AP-001','PA-001'), ('AP-002','PA-002'), ('AP-003','PA-003'), ('AP-004','PA-004'), ('AP-005','PA-005'), ('AP-006','PA-006')) x(ref, audit_ref)
where a.ref = x.ref and a.audit_ref is null;
update public.action_plans set status = 'Open' where ref in ('AP-002', 'AP-004') and status = 'Overdue';

-- Pending queue with fixed dates. Overdue planned audits without a row are
-- added by the app (and by the pending_queue view below).
delete from public.pending_audits where audit_ref in ('PA-004','PA-007','PA-008','PA-009','PA-010','UA-001','UA-002');
insert into public.pending_audits(audit_ref, ward_id, waiting_for, since_date, owner)
select x.audit_ref, w.id, x.waiting_for, x.since_date::date, x.owner from (values
  ('PA-007','Paediatrics','Awaiting sign-off','2026-09-04','Owner 3'),
  ('PA-008','Maternity','Awaiting data collection','2026-09-15','Owner 1'),
  ('PA-009','Medical B','Awaiting data collection','2026-09-22','Owner 2'),
  ('UA-002','Surgical A','Awaiting auditor allocation','2026-09-29','Owner 5'),
  ('PA-010','Orthopaedics','Awaiting analysis','2026-10-10','Owner 4'),
  ('UA-001','Medical B','Awaiting report','2026-10-19','Owner 3')
) x(audit_ref, ward, waiting_for, since_date, owner)
join public.wards w on w.name = x.ward;

-- Reports: one per completed audit (plus the closed unplanned review).
insert into public.reports(serial, title, ward_id, report_date, score, status, audit_ref)
select x.serial, x.title, w.id, x.report_date::date, null, x.status, x.audit_ref from (values
  ('NA-2026-001','Hand hygiene audit — ICU','ICU','2026-04-02','Published','PA-001'),
  ('NA-2026-002','Medication safety audit — Medical A','Medical A','2026-04-17','Published','PA-002'),
  ('NA-2026-003','Patient identification audit — Surgical A','Surgical A','2026-04-21','Published','PA-003'),
  ('NA-2026-004','Pressure injury prevention audit — Medical B','Medical B','2026-05-29','Approved','PA-004'),
  ('NA-2026-005','Falls prevention audit — ED','ED','2026-07-03','Published','PA-005'),
  ('NA-2026-006','IV cannula care audit — Oncology','Oncology','2026-07-14','Published','PA-006'),
  ('NA-2026-007','Documentation audit — Paediatrics','Paediatrics','2026-09-04','Under review','PA-007'),
  ('NA-2026-008','Falls prevention rounding review — Orthopaedics','Orthopaedics','2026-09-18','Published','UA-004')
) x(serial, title, ward, report_date, status, audit_ref)
join public.wards w on w.name = x.ward
on conflict (serial) do update set audit_ref = excluded.audit_ref, title = excluded.title, ward_id = excluded.ward_id;

insert into public.report_references(report_id, reference_id)
select r.id, l.id from (values
  ('NA-2026-001','WHO-HH-2009'), ('NA-2026-001','POL-HH'), ('NA-2026-001','HQIP-BPCA'),
  ('NA-2026-002','POL-MED'), ('NA-2026-002','HQIP-BPCA'),
  ('NA-2026-003','POL-ID'), ('NA-2026-003','HQIP-BPCA'),
  ('NA-2026-004','NPIAP-EPUAP'), ('NA-2026-004','POL-PI'), ('NA-2026-004','HQIP-BPCA'),
  ('NA-2026-005','POL-FALLS'), ('NA-2026-005','HQIP-BPCA'),
  ('NA-2026-006','POL-IV'), ('NA-2026-006','HQIP-BPCA'),
  ('NA-2026-007','POL-DOC'), ('NA-2026-007','HQIP-BPCA'),
  ('NA-2026-008','POL-FALLS'), ('NA-2026-008','HQIP-BPCA')
) x(serial, code)
join public.reports r on r.serial = x.serial
join public.references_library l on l.code = x.code
on conflict do nothing;

insert into public.report_status_history(report_id, stage, reached_on)
select r.id, x.stage, x.reached_on::timestamptz from (values
  ('NA-2026-001','Drafted','2026-03-20'), ('NA-2026-001','Peer reviewed','2026-03-24'), ('NA-2026-001','Approved','2026-03-26'), ('NA-2026-001','Published','2026-03-27'), ('NA-2026-001','Action plan agreed','2026-04-02'),
  ('NA-2026-002','Drafted','2026-04-02'), ('NA-2026-002','Peer reviewed','2026-04-06'), ('NA-2026-002','Approved','2026-04-09'), ('NA-2026-002','Published','2026-04-10'), ('NA-2026-002','Action plan agreed','2026-04-17'),
  ('NA-2026-003','Drafted','2026-04-06'), ('NA-2026-003','Peer reviewed','2026-04-09'), ('NA-2026-003','Approved','2026-04-13'), ('NA-2026-003','Published','2026-04-14'), ('NA-2026-003','Action plan agreed','2026-04-21'),
  ('NA-2026-004','Drafted','2026-05-20'), ('NA-2026-004','Peer reviewed','2026-05-25'), ('NA-2026-004','Approved','2026-05-29'),
  ('NA-2026-005','Drafted','2026-06-19'), ('NA-2026-005','Peer reviewed','2026-06-23'), ('NA-2026-005','Approved','2026-06-25'), ('NA-2026-005','Published','2026-06-26'), ('NA-2026-005','Action plan agreed','2026-07-03'),
  ('NA-2026-006','Drafted','2026-07-03'), ('NA-2026-006','Peer reviewed','2026-07-07'), ('NA-2026-006','Approved','2026-07-09'), ('NA-2026-006','Published','2026-07-10'), ('NA-2026-006','Action plan agreed','2026-07-14'),
  ('NA-2026-007','Drafted','2026-08-28'), ('NA-2026-007','Peer reviewed','2026-09-04'),
  ('NA-2026-008','Drafted','2026-09-11'), ('NA-2026-008','Peer reviewed','2026-09-14'), ('NA-2026-008','Approved','2026-09-16'), ('NA-2026-008','Published','2026-09-18')
) x(serial, stage, reached_on)
join public.reports r on r.serial = x.serial
where not exists (select 1 from public.report_status_history h where h.report_id = r.id and h.stage = x.stage);

select setval('public.report_serial_seq', greatest(8, (select coalesce(max(right(serial,3)::bigint),0) from public.reports where serial ~ '^NA-[0-9]{4}-[0-9]{3}$')), true);

-- 3. Views ---------------------------------------------------------------------

-- Scored audit results: the only source for heatmap and by-standard scores.
create or replace view public.audit_results as
select pa.ward_id, pa.topic_id, pa.due_date as result_date, pa.score, pa.ref as source
from public.planned_audits pa where pa.status = 'Completed' and pa.score is not null
union all
select ua.ward_id, ua.topic_id, coalesce(rr.report_date, ua.raised_on), ua.score, ua.ref
from public.unplanned_audits ua left join public.report_register rr on rr.audit_ref = ua.ref
where ua.status = 'Closed' and ua.score is not null and ua.topic_id is not null;
grant select on public.audit_results to anon, authenticated;

create or replace view public.latest_audit_results as
select distinct on (ward_id, topic_id) ward_id, topic_id, result_date, score, source
from public.audit_results order by ward_id, topic_id, result_date desc;
grant select on public.latest_audit_results to anon, authenticated;

create or replace view public.compliance_by_standard as
select t.id, t.name, round(avg(l.score), 1) as score, count(l.score) as wards_audited
from public.standards_topics t left join public.latest_audit_results l on l.topic_id = t.id
group by t.id, t.name;

-- No single hospital-wide compliance figure (Part B1).
drop view if exists public.overview_kpis;
create view public.overview_kpis as
select
  (select count(distinct ward_id) from public.audit_results where extract(year from result_date) = extract(year from current_date)) as wards_audited_this_year,
  (select count(*) from public.wards) as wards_total,
  (select count(*) filter (where status = 'Completed') || ' / ' || count(*) from public.planned_audits) as planned_completion,
  (select count(*) from public.unplanned_audits where status <> 'Closed') as unplanned_open,
  (select count(*) from public.action_plans where public.action_status(due_date, progress, status) <> 'Closed') as open_actions,
  (select count(*) from public.action_plans where public.action_status(due_date, progress, status) = 'Overdue') as overdue_actions;
grant select on public.overview_kpis to anon, authenticated;

commit;
