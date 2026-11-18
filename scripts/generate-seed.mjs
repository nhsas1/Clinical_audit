#!/usr/bin/env node
// Generates ALL fictional sample data from src/lib/hierarchy.json, so the app's
// embedded data and the Supabase seed are always identical.
//
//   pnpm seed:generate
//
// Writes:
//   src/lib/seed.generated.json                       embedded app data
//   supabase/migrations/003_hospital_hierarchy.sql    schema + hospitals/departments/wards
//   supabase/migrations/004_reseed_fictional_data.sql fictional activity for ~40% of wards
//
// Deterministic: the same hierarchy always produces the same output.
// Fictional only: no real staff, patients or records. Names are given name +
// initial from a generic pool, staff are "Auditor N", trainees "Trainee Nurse X".
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const hierarchy = JSON.parse(readFileSync(join(root, 'src/lib/hierarchy.json'), 'utf8'));

const REF = Date.UTC(2026, 10, 18); // reference "today" for the sample: 18 Nov 2026
const DAY = 86_400_000;
const iso = t => new Date(t).toISOString().slice(0, 10);
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Small seeded PRNG (mulberry32).
let state = 20261118;
const rand = () => { state |= 0; state = (state + 0x6D2B79F5) | 0; let t = Math.imul(state ^ (state >>> 15), 1 | state); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const int = (a, b) => a + Math.floor(rand() * (b - a + 1));
const pick = arr => arr[Math.floor(rand() * arr.length)];
const shuffle = arr => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// ------------------------------------------------------------------ structure
const hospitals = [], departments = [], wards = [];
hierarchy.hospitals.forEach((h, hi) => {
  const hid = slug(h.code);
  hospitals.push({ id: hid, code: h.code, short: h.short, name: h.name, sort: hi + 1 });
  const groups = h.departments ?? [{ name: null, wards: h.wards }];
  groups.forEach((d, di) => {
    const did = d.name ? `${hid}/${slug(d.name)}` : null;
    if (did) departments.push({ id: did, hospital_id: hid, name: d.name, sort: di + 1 });
    d.wards.forEach((w, wi) => wards.push({ id: `${hid}/${did ? slug(d.name) : '-'}/${slug(w)}`, name: w, hospital_id: hid, department_id: did, sort: wi + 1 }));
  });
});
const ids = new Set(wards.map(w => w.id));
if (ids.size !== wards.length) throw new Error('Duplicate ward within the same hospital and department');
const wardById = Object.fromEntries(wards.map(w => [w.id, w]));
const hospById = Object.fromEntries(hospitals.map(h => [h.id, h]));
const deptById = Object.fromEntries(departments.map(d => [d.id, d]));

// ~40% of wards with recent activity, at least one per hospital.
const active = [];
for (const h of hospitals) {
  const hw = wards.filter(w => w.hospital_id === h.id);
  active.push(...shuffle(hw).slice(0, Math.max(1, Math.round(hw.length * 0.4))));
}

// ------------------------------------------------------------------ activity
const TOPICS = ['Hand Hygiene', 'Medication Safety', 'Patient ID', 'Pressure Injury', 'Falls Prevention', 'IV Cannula', 'Documentation'];
const FINDINGS = {
  'Hand Hygiene': ['Missed hand hygiene opportunity at bay entrance.', 'Alcohol rub not available at two bed spaces.'],
  'Medication Safety': ['Second-check documentation incomplete.', 'Allergy status not recorded before administration.'],
  'Patient ID': ['Two identifiers not consistently verbalised.', 'Identification band missing on transfer.'],
  'Pressure Injury': ['Risk reassessment not visible in notes.', 'Repositioning chart gaps overnight.'],
  'Falls Prevention': ['Rounding prompt needs standardisation.', 'Falls risk not reassessed after change in condition.'],
  'IV Cannula': ['Daily site review field inconsistently completed.', 'Insertion date missing on dressing.'],
  'Documentation': ['Care plan not updated within 24 hours.', 'Entries missing time or signature.'],
};
const REF_CODES = { 'Hand Hygiene': ['WHO-HH-2009', 'POL-HH'], 'Medication Safety': ['POL-MED'], 'Patient ID': ['POL-ID'], 'Pressure Injury': ['NPIAP-EPUAP', 'POL-PI'], 'Falls Prevention': ['POL-FALLS'], 'IV Cannula': ['POL-IV'], 'Documentation': ['POL-DOC'] };
const AUDITORS = ['Auditor 1', 'Auditor 2', 'Auditor 3', 'Auditor 4', 'Auditor 5', 'Auditor 6'];
const quarter = t => `Q${Math.floor(new Date(t).getUTCMonth() / 3) + 1}`;

// Planned audits: one per active ward, a second for some.
const plannedDraft = [];
active.forEach((w, j) => {
  const n = rand() < 0.4 ? 2 : 1;
  const topics = shuffle(TOPICS).slice(0, n);
  topics.forEach(topic => {
    const due = Date.UTC(2026, int(0, 11), int(4, 27));
    plannedDraft.push({ ward_id: w.id, topic, due });
  });
});
plannedDraft.sort((a, b) => a.due - b.due || a.ward_id.localeCompare(b.ward_id));
const planned = plannedDraft.map((p, i) => {
  const age = (REF - p.due) / DAY;
  let status = 'Scheduled', score = null;
  if (age > 20) { if (age > 100 || rand() < 0.85) { status = 'Completed'; score = int(72, 99); } }
  else if (age > -10) { status = rand() < 0.5 ? 'In progress' : 'Scheduled'; }
  return { ref: `PA-${String(i + 1).padStart(3, '0')}`, topic: p.topic, ward_id: p.ward_id, quarter: quarter(p.due), due_date: iso(p.due), auditor: pick(AUDITORS), status, score };
});

// Unplanned audits.
const TRIGGERS = ['Incident report', 'Patient complaint', 'Infection alert', 'Risk register', 'Management request'];
const SUBJECTS = { 'Hand Hygiene': 'Hand hygiene spot check', 'Medication Safety': 'Medication omission review', 'Patient ID': 'Identification at transfer', 'Pressure Injury': 'Pressure injury cluster review', 'Falls Prevention': 'Falls prevention rounding', 'IV Cannula': 'Cannula care observations', 'Documentation': 'Documentation completeness' };
const unplanned = Array.from({ length: 14 }, (_, i) => {
  const w = pick(active); const topic = pick(TOPICS);
  const raised = REF - int(5, 130) * DAY;
  const age = (REF - raised) / DAY;
  const status = age > 45 ? (rand() < 0.6 ? 'Closed' : 'In progress') : (rand() < 0.5 ? 'Open' : 'In progress');
  return { ref: '', trigger_type: pick(TRIGGERS), subject: SUBJECTS[topic], ward_id: w.id, raised, priority: pick(['High', 'Medium', 'Medium', 'Low']), status, topic, score: status === 'Closed' ? int(74, 98) : null };
}).sort((a, b) => a.raised - b.raised).map((u, i) => ({ ...u, ref: `UA-${String(i + 1).padStart(3, '0')}`, raised_on: iso(u.raised), description: '' }));
unplanned.forEach(u => delete u.raised);

// Reports: one per completed audit / closed unplanned audit, staged by age.
const STAGES = ['Drafted', 'Peer reviewed', 'Approved', 'Published', 'Action plan agreed'];
const sources = [
  ...planned.filter(p => p.status === 'Completed').map(p => ({ ref: p.ref, ward_id: p.ward_id, topic: p.topic, done: Date.parse(p.due_date), score: p.score, title: `${p.topic} audit` })),
  ...unplanned.filter(u => u.status === 'Closed').map(u => ({ ref: u.ref, ward_id: u.ward_id, topic: u.topic, done: Date.parse(u.raised_on) + int(10, 20) * DAY, score: u.score, title: u.subject })),
].sort((a, b) => a.done - b.done);
const reports = [];
for (const s of sources) {
  const age = (REF - s.done) / DAY;
  let maxStages = age > 70 ? 5 : age > 40 ? int(3, 4) : age > 20 ? 2 : age > 12 ? 1 : 0;
  if (s.score >= 90 && maxStages === 5) maxStages = 4; // nothing to agree when on target
  if (s.ref.startsWith('UA-') && maxStages < 4) maxStages = 4; // closed unplanned reviews are published
  const history = []; let t = s.done + int(2, 6) * DAY;
  for (let k = 0; k < maxStages && t <= REF; k++) { history.push({ stage: STAGES[k], date: iso(t) }); t += int(2, 6) * DAY; }
  if (!history.length) continue;
  const w = wardById[s.ward_id];
  reports.push({ serial: '', title: `${s.title} — ${w.name}`, ward_id: s.ward_id, audit_ref: s.ref, history, references: [...(REF_CODES[s.topic] ?? []), 'HQIP-BPCA'] });
}
reports.sort((a, b) => a.history[0].date.localeCompare(b.history[0].date)).forEach((r, i) => { r.serial = `NA-2026-${String(i + 1).padStart(3, '0')}`; });
const reportByAudit = Object.fromEntries(reports.map(r => [r.audit_ref, r]));

// Pending queue: everything still moving through the cycle.
const WAIT = { 'Drafted': 'Awaiting peer review', 'Peer reviewed': 'Awaiting sign-off', 'Approved': 'Awaiting publication' };
const pending = [];
for (const p of planned) {
  if (p.status === 'Completed') {
    const r = reportByAudit[p.ref]; const last = r?.history.at(-1);
    if (!r) pending.push({ audit_ref: p.ref, ward_id: p.ward_id, waiting_for: 'Awaiting report', since_date: p.due_date, owner: p.auditor });
    else if (WAIT[last.stage]) pending.push({ audit_ref: p.ref, ward_id: p.ward_id, waiting_for: WAIT[last.stage], since_date: last.date, owner: p.auditor });
  } else if (p.status === 'In progress') {
    pending.push({ audit_ref: p.ref, ward_id: p.ward_id, waiting_for: 'Awaiting analysis', since_date: iso(Date.parse(p.due_date) - 7 * DAY), owner: p.auditor });
  }
}
for (const u of unplanned) {
  if (u.status === 'Open') pending.push({ audit_ref: u.ref, ward_id: u.ward_id, waiting_for: 'Awaiting auditor allocation', since_date: u.raised_on, owner: pick(AUDITORS) });
  if (u.status === 'In progress') pending.push({ audit_ref: u.ref, ward_id: u.ward_id, waiting_for: 'Awaiting report', since_date: u.raised_on, owner: pick(AUDITORS) });
}
pending.forEach((p, i) => { p.id = `pq-${i + 1}`; });

// Action plans for scored audits below target.
const actions = [];
for (const s of sources) {
  if (s.score >= 90 || !reportByAudit[s.ref]) continue;
  const due = s.done + int(90, 210) * DAY;
  const overdueOrPast = due < REF;
  const progress = overdueOrPast ? pick([30, 45, 60, 100, 100]) : pick([10, 25, 40, 55, 70, 80]);
  actions.push({ ref: '', topic: s.topic, ward_id: s.ward_id, finding: pick(FINDINGS[s.topic]), owner: pick(AUDITORS), due_date: iso(due), progress, status: progress >= 100 ? 'Closed' : 'Open', audit_ref: s.ref });
}
actions.forEach((a, i) => { a.ref = `AP-${String(i + 1).padStart(3, '0')}`; });

// Quality initiatives on the lowest-scoring wards.
const CATEGORY = { 'Hand Hygiene': 'Infection prevention', 'Medication Safety': 'Medication safety', 'Patient ID': 'Patient safety', 'Pressure Injury': 'Pressure injury', 'Falls Prevention': 'Falls', 'IV Cannula': 'Vascular access', 'Documentation': 'Documentation' };
const MEASURE = { 'Hand Hygiene': 'Compliant opportunities', 'Medication Safety': 'Second checks done', 'Patient ID': 'Two-identifier checks', 'Pressure Injury': 'Bundle use', 'Falls Prevention': 'Rounds completed', 'IV Cannula': 'Daily site reviews', 'Documentation': 'Records complete' };
const initiatives = [...sources].filter(s => s.score < 88).sort((a, b) => a.score - b.score).slice(0, 8).map((s, i) => {
  const stage = pick(['Plan', 'Do', 'Do', 'Study', 'Act']); const progress = { Plan: int(10, 30), Do: int(35, 60), Study: int(60, 80), Act: int(80, 95) }[stage];
  return { ref: `QI-${String(i + 1).padStart(3, '0')}`, title: `Improve ${s.topic.toLowerCase()} reliability`, ward_id: s.ward_id, category: CATEGORY[s.topic], stage, progress, lead: `Lead ${i + 1}`, measure: `${MEASURE[s.topic]}: ${Math.min(99, s.score + int(2, 10))}%` };
});

// Liaisons: one per ward. ~70% Trained, exact proportions after shuffling.
const GIVEN = ['Aisha', 'Fatima', 'Maryam', 'Noor', 'Huda', 'Layla', 'Sara', 'Zainab', 'Reem', 'Hana', 'Mona', 'Dana', 'Amal', 'Salma', 'Rana', 'Ali', 'Hassan', 'Yusuf', 'Omar', 'Khalid', 'Ahmed', 'Jassim', 'Faisal', 'Grace', 'Joy', 'Rose', 'Anne', 'Priya', 'Mary', 'Leena'];
const INITIALS = 'ABDFGHJKMNRSTY'.split('');
const ROLES = ['Quality liaison nurse', 'Senior staff nurse (liaison)', 'Charge nurse (liaison)', 'Nurse educator (liaison)'];
const nTrained = Math.round(wards.length * 0.7), nRefresher = Math.round(wards.length * 0.2);
const statuses = shuffle(wards.map((_, i) => i < nTrained ? 'Trained' : i < nTrained + nRefresher ? 'Refresher due' : 'Not yet trained'));
const exts = shuffle(Array.from({ length: 7000 }, (_, i) => String(2000 + i))).slice(0, wards.length);
const liaisons = wards.map((w, i) => ({ ward_id: w.id, name: `${pick(GIVEN)} ${pick(INITIALS)}.`, role: pick(ROLES), ext: exts[i], training_status: statuses[i], last_meeting: iso(Date.UTC(2026, 0, 6) + int(0, Math.floor((REF - Date.UTC(2026, 0, 6)) / DAY)) * DAY) }));

// Certificate register preview (exam results).
const COURSES = ['Hand Hygiene: Five Moments', 'Medication Safety: Administration Checks'];
let certNo = 0;
const certificates = 'ABCDEFGHIJKL'.split('').map(l => { const score = pick([100, 80, 80, 100, 60, 40, 100]); return { trainee: `Trainee Nurse ${l}`, ward_id: pick(active).id, course: pick(COURSES), score, number: score >= 80 ? `NA-CERT-2026-${String(++certNo).padStart(4, '0')}` : null }; });

// ------------------------------------------------------------------ outputs
const seed = { generated_note: 'Generated by scripts/generate-seed.mjs. Fictional sample data. Do not edit by hand.', reference_date: iso(REF), hospitals, departments, wards, planned, unplanned, pending, actions, reports, initiatives, liaisons, certificates };
writeFileSync(join(root, 'src/lib/seed.generated.json'), JSON.stringify(seed, null, 1) + '\n');

const q = v => v == null ? 'null' : typeof v === 'number' ? String(v) : `'${String(v).replaceAll("'", "''")}'`;
const wk = id => { const w = wardById[id]; return `public.ward_id_by_key(${q(hospById[w.hospital_id].code)}, ${q(w.department_id ? deptById[w.department_id].name : null)}, ${q(w.name)})`; };
const header = (title, body) => `-- Nursing Audit Hub — ${title}\n-- GENERATED by scripts/generate-seed.mjs from src/lib/hierarchy.json. Do not edit by hand.\n-- Simulation only. Fictional sample data. No patient or staff records.\n-- Apply to a Supabase dev branch or dev project first, never straight to production.\n${body}`;

const sql003 = header('hospital > department > ward hierarchy (Part B2)', `
begin;

create table if not exists public.hospitals (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  short_name text not null,
  name text not null unique,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete restrict,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (hospital_id, name),
  unique (id, hospital_id)
);

alter table public.wards add column if not exists hospital_id uuid references public.hospitals(id) on delete restrict;
alter table public.wards add column if not exists department_id uuid;
alter table public.wards add column if not exists sort_order integer not null default 0;
alter table public.wards drop constraint if exists wards_name_key;
-- A ward's department must belong to the same hospital.
alter table public.wards drop constraint if exists wards_department_fk;
alter table public.wards add constraint wards_department_fk foreign key (department_id, hospital_id) references public.departments(id, hospital_id) on delete restrict;
-- Unique by hospital + department + name (Ward 33, PICU, PDU, Ward 4 repeat).
create unique index if not exists wards_hospital_department_name_key on public.wards (hospital_id, department_id, name) nulls not distinct;

create or replace function public.ward_id_by_key(p_hospital_code text, p_department text, p_ward text)
returns uuid language sql stable set search_path = public as $$
  select w.id from public.wards w
  join public.hospitals h on h.id = w.hospital_id
  left join public.departments d on d.id = w.department_id
  where h.code = p_hospital_code and w.name = p_ward and d.name is not distinct from p_department;
$$;

alter table public.hospitals enable row level security;
alter table public.departments enable row level security;
drop policy if exists viewer_read on public.hospitals;
create policy viewer_read on public.hospitals for select using (true);
drop policy if exists viewer_read on public.departments;
create policy viewer_read on public.departments for select using (true);
drop policy if exists admin_write on public.hospitals;
create policy admin_write on public.hospitals for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists admin_write on public.departments;
create policy admin_write on public.departments for all to authenticated using (public.is_admin()) with check (public.is_admin());

insert into public.hospitals(code, short_name, name, sort_order) values
${hospitals.map(h => `  (${q(h.code)}, ${q(h.short)}, ${q(h.name)}, ${h.sort})`).join(',\n')}
on conflict (code) do update set short_name = excluded.short_name, name = excluded.name, sort_order = excluded.sort_order;

insert into public.departments(hospital_id, name, sort_order)
select h.id, x.name, x.sort from (values
${departments.map(d => `  (${q(hospById[d.hospital_id].code)}, ${q(d.name)}, ${d.sort})`).join(',\n')}
) x(code, name, sort) join public.hospitals h on h.code = x.code
on conflict (hospital_id, name) do update set sort_order = excluded.sort_order;

insert into public.wards(hospital_id, department_id, name, sort_order)
select h.id, d.id, x.name, x.sort from (values
${wards.map(w => `  (${q(hospById[w.hospital_id].code)}, ${q(w.department_id ? deptById[w.department_id].name : null)}, ${q(w.name)}, ${w.sort})`).join(',\n')}
) x(code, dept, name, sort)
join public.hospitals h on h.code = x.code
left join public.departments d on d.hospital_id = h.id and d.name = x.dept
on conflict (hospital_id, department_id, name) do update set sort_order = excluded.sort_order;

commit;
`);

const sql004 = header('re-seed fictional activity against the new wards (Part B2, B5)', `
-- DESTRUCTIVE FOR SAMPLE DATA: removes the previous fictional audit activity
-- and the 10 old sample wards (those without a hospital), then inserts the
-- generated set. Hospitals, departments, wards, standards, tools, courses,
-- references and exam questions are kept.

begin;

delete from public.report_status_history;
delete from public.report_references;
delete from public.reports;
delete from public.reminders;
delete from public.pending_audits;
delete from public.action_plans;
delete from public.planned_audits;
delete from public.unplanned_audits;
delete from public.qi_projects;
delete from public.liaisons;
delete from public.compliance_scores;  -- generated values; scores now come from audit results
update public.exam_attempts set ward_id = null where ward_id in (select id from public.wards where hospital_id is null);
delete from public.wards where hospital_id is null;
alter table public.wards alter column hospital_id set not null;

insert into public.planned_audits(ref, topic_id, ward_id, quarter, due_date, auditor, status, score)
select x.ref, t.id, x.ward_id, x.quarter, x.due::date, x.auditor, x.status, x.score from (values
${planned.map(p => `  (${q(p.ref)}, ${q(p.topic)}, ${wk(p.ward_id)}, ${q(p.quarter)}, ${q(p.due_date)}, ${q(p.auditor)}, ${q(p.status)}, ${p.score ?? 'null::numeric'})`).join(',\n')}
) x(ref, topic, ward_id, quarter, due, auditor, status, score) join public.standards_topics t on t.name = x.topic;

insert into public.unplanned_audits(ref, trigger_type, subject, ward_id, raised_on, priority, status, description, topic_id, score)
select x.ref, x.trig, x.subject, x.ward_id, x.raised::date, x.priority, x.status, '', t.id, x.score from (values
${unplanned.map(u => `  (${q(u.ref)}, ${q(u.trigger_type)}, ${q(u.subject)}, ${wk(u.ward_id)}, ${q(u.raised_on)}, ${q(u.priority)}, ${q(u.status)}, ${q(u.topic)}, ${u.score ?? 'null::numeric'})`).join(',\n')}
) x(ref, trig, subject, ward_id, raised, priority, status, topic, score) join public.standards_topics t on t.name = x.topic;

insert into public.pending_audits(audit_ref, ward_id, waiting_for, since_date, owner) values
${pending.map(p => `  (${q(p.audit_ref)}, ${wk(p.ward_id)}, ${q(p.waiting_for)}, ${q(p.since_date)}, ${q(p.owner)})`).join(',\n')};

insert into public.action_plans(ref, topic_id, ward_id, finding, owner, due_date, progress, status, audit_ref)
select x.ref, t.id, x.ward_id, x.finding, x.owner, x.due::date, x.progress, x.status, x.audit_ref from (values
${actions.map(a => `  (${q(a.ref)}, ${q(a.topic)}, ${wk(a.ward_id)}, ${q(a.finding)}, ${q(a.owner)}, ${q(a.due_date)}, ${a.progress}, ${q(a.status)}, ${q(a.audit_ref)})`).join(',\n')}
) x(ref, topic, ward_id, finding, owner, due, progress, status, audit_ref) join public.standards_topics t on t.name = x.topic;

insert into public.reports(serial, title, ward_id, report_date, score, status, audit_ref) values
${reports.map(r => `  (${q(r.serial)}, ${q(r.title)}, ${wk(r.ward_id)}, ${q(r.history.at(-1).date)}, null, ${q({ Drafted: 'Draft', 'Peer reviewed': 'Under review', Approved: 'Approved' }[r.history.at(-1).stage] ?? 'Published')}, ${q(r.audit_ref)})`).join(',\n')};

insert into public.report_status_history(report_id, stage, reached_on)
select r.id, x.stage, x.reached::timestamptz from (values
${reports.flatMap(r => r.history.map(h => `  (${q(r.serial)}, ${q(h.stage)}, ${q(h.date)})`)).join(',\n')}
) x(serial, stage, reached) join public.reports r on r.serial = x.serial;

insert into public.report_references(report_id, reference_id)
select r.id, l.id from (values
${reports.flatMap(r => r.references.map(c => `  (${q(r.serial)}, ${q(c)})`)).join(',\n')}
) x(serial, code) join public.reports r on r.serial = x.serial join public.references_library l on l.code = x.code
on conflict do nothing;

insert into public.qi_projects(ref, title, ward_id, category, pdsa_stage, progress, lead, start_date, target_date, measure_text) values
${initiatives.map(i => `  (${q(i.ref)}, ${q(i.title)}, ${wk(i.ward_id)}, ${q(i.category)}, ${q(i.stage)}, ${i.progress}, ${q(i.lead)}, '2026-06-01', '2027-03-31', ${q(i.measure)})`).join(',\n')};

insert into public.liaisons(ward_id, name, role, contact_ext, training_status, last_meeting) values
${liaisons.map(l => `  (${wk(l.ward_id)}, ${q(l.name)}, ${q(l.role)}, ${q(l.ext)}, ${q(l.training_status)}, ${q(l.last_meeting)})`).join(',\n')};

select setval('public.report_serial_seq', ${reports.length}, true);

commit;
`);

writeFileSync(join(root, 'supabase/migrations/003_hospital_hierarchy.sql'), sql003);
writeFileSync(join(root, 'supabase/migrations/004_reseed_fictional_data.sql'), sql004);

console.log(`hospitals ${hospitals.length}, departments ${departments.length}, wards ${wards.length}, active ${active.length} (${Math.round(active.length / wards.length * 100)}%)`);
console.log(`planned ${planned.length}, unplanned ${unplanned.length}, reports ${reports.length}, pending ${pending.length}, actions ${actions.length}, initiatives ${initiatives.length}, liaisons ${liaisons.length} (${statuses.filter(s => s === 'Trained').length} trained)`);
