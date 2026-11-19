-- Nursing Audit Hub — Training Library (Part B3)
-- Simulation only. Fictional sample data. Apply to a Supabase dev branch or dev project first.
-- Safe to run more than once. Seed rows are in 008_seed_training.sql (generated).

begin;

-- 1. Tables ----------------------------------------------------------------------

create table if not exists public.training_sessions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null check (length(title) between 2 and 200),
  type text not null check (type in ('Lecture','Workshop','Simulation','Skills station','Orientation')),
  topic text,
  target_group text not null,
  hospital_id uuid not null references public.hospitals(id),
  ward_id uuid references public.wards(id),
  session_date date not null,
  trainer text not null,
  duration_minutes integer not null check (duration_minutes between 5 and 600),
  venue text not null,
  status text not null default 'Planned' check (status in ('Planned','Delivered','Cancelled','Postponed')),
  capacity integer check (capacity is null or capacity between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists training_sessions_date_idx on public.training_sessions(session_date);

create table if not exists public.training_attendance (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.training_sessions(id) on delete cascade,
  staff_number text not null check (staff_number ~ '^[A-Z0-9-]{3,20}$'),
  name text not null check (length(name) between 2 and 120),
  ward_id uuid references public.wards(id),
  role text not null,
  attended boolean not null default false,
  created_at timestamptz not null default now(),
  unique (session_id, staff_number)
);

create table if not exists public.training_activity (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  kind text not null check (kind in ('Presentation','Workshop','Poster')),
  title text not null,
  activity_date date not null,
  presenter text not null,
  hospital_id uuid references public.hospitals(id),
  session_id uuid references public.training_sessions(id) on delete set null,
  topic text,
  description text not null default '',
  file_name text,
  file_path text,            -- object path in the "training" bucket
  created_at timestamptz not null default now()
);

-- 2. One certificate register for exams and session attendance -------------------

alter table public.certificates alter column attempt_id drop not null;
alter table public.certificates alter column course_id drop not null;
alter table public.certificates add column if not exists source text not null default 'exam';
alter table public.certificates add column if not exists session_id uuid references public.training_sessions(id) on delete set null;
alter table public.certificates add column if not exists attendance_id uuid unique references public.training_attendance(id) on delete set null;
alter table public.certificates add column if not exists ward_id uuid references public.wards(id);
alter table public.certificates add column if not exists title text;
alter table public.certificates add column if not exists staff_number text;
alter table public.certificates drop constraint if exists certificates_source_check;
alter table public.certificates add constraint certificates_source_check check (
  (source = 'exam' and attempt_id is not null) or (source = 'session' and (attendance_id is not null or session_id is not null)));

-- Issue certificates for everyone marked attended on a delivered session.
-- Numbers come from the database sequence (NA-CERT-YYYY-####).
create or replace function public.issue_session_certificates(p_session uuid)
returns table (number text, attendance_id uuid, trainee_name text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not public.is_admin_or_auditor() then raise exception 'Only auditors and admins can issue certificates'; end if;
  if not exists (select 1 from public.training_sessions s where s.id = p_session and s.status = 'Delivered') then
    raise exception 'Certificates can only be issued for delivered sessions';
  end if;
  return query
  insert into public.certificates(number, source, session_id, attendance_id, ward_id, title, staff_number, trainee_name, score, issued_on)
  select public.next_certificate_number(), 'session', a.session_id, a.id, a.ward_id, s.title, a.staff_number, a.name, 100, current_date
  from public.training_attendance a join public.training_sessions s on s.id = a.session_id
  where a.session_id = p_session and a.attended
    and not exists (select 1 from public.certificates c where c.attendance_id = a.id)
  order by a.name
  returning certificates.number, certificates.attendance_id, certificates.trainee_name;
end $$;
revoke all on function public.issue_session_certificates(uuid) from public;
grant execute on function public.issue_session_certificates(uuid) to authenticated;

-- Public verification: name, session or course, and date only.
drop view if exists public.public_certificate_verification;
create view public.public_certificate_verification as
select c.number, c.trainee_name, coalesce(c.title, co.name) as title, c.issued_on
from public.certificates c left join public.courses co on co.id = c.course_id;
grant select on public.public_certificate_verification to anon, authenticated;

-- 3. Access ------------------------------------------------------------------------

alter table public.training_sessions enable row level security;
alter table public.training_attendance enable row level security;
alter table public.training_activity enable row level security;

do $$
declare t text; begin
  foreach t in array array['training_sessions','training_attendance','training_activity','certificates'] loop
    execute format('drop policy if exists signed_in_read on public.%I', t);
    execute format('create policy signed_in_read on public.%I for select to authenticated using (true)', t);
  end loop;
  foreach t in array array['training_sessions','training_attendance','training_activity'] loop
    execute format('drop policy if exists auditor_write on public.%I', t);
    execute format('create policy auditor_write on public.%I for all to authenticated using (public.is_admin_or_auditor()) with check (public.is_admin_or_auditor())', t);
  end loop;
end $$;

-- Storage: signed-in users read; auditors and admins upload, replace and delete.
insert into storage.buckets (id, name, public) values ('training','training',false), ('certificates','certificates',false) on conflict (id) do nothing;
drop policy if exists training_files_read on storage.objects;
create policy training_files_read on storage.objects for select to authenticated using (bucket_id in ('training','certificates'));
drop policy if exists training_files_write on storage.objects;
create policy training_files_write on storage.objects for insert to authenticated with check (bucket_id in ('training','certificates') and public.is_admin_or_auditor());
drop policy if exists training_files_update on storage.objects;
create policy training_files_update on storage.objects for update to authenticated using (bucket_id in ('training','certificates') and public.is_admin_or_auditor());
drop policy if exists training_files_delete on storage.objects;
create policy training_files_delete on storage.objects for delete to authenticated using (bucket_id in ('training','certificates') and public.is_admin_or_auditor());

-- Signed-out visitors: training dashboard figures only. Staff are pseudonymous
-- (md5 of the staff number) so unique attendees can be counted without names.
create or replace function public.public_training_dashboard()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'sessions', coalesce((select jsonb_agg(jsonb_build_object('code', code, 'type', type, 'topic', topic, 'status', status, 'hospital_id', hospital_id, 'ward_id', ward_id, 'session_date', session_date, 'duration_minutes', duration_minutes, 'capacity', capacity)) from public.training_sessions), '[]'),
    'attendance', coalesce((select jsonb_agg(jsonb_build_object('session', s.code, 'person', md5(a.staff_number), 'ward_id', a.ward_id, 'attended', a.attended)) from public.training_attendance a join public.training_sessions s on s.id = a.session_id), '[]'),
    'certificates', coalesce((select jsonb_agg(jsonb_build_object('issued_on', c.issued_on, 'ward_id', c.ward_id, 'source', c.source, 'session', s.code)) from public.certificates c left join public.training_sessions s on s.id = c.session_id), '[]')
  );
$$;
revoke all on function public.public_training_dashboard() from public;
grant execute on function public.public_training_dashboard() to anon, authenticated;

commit;
