import { useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Award, BookOpen, CalendarDays, Clock, GraduationCap, LayoutDashboard, LockKeyhole, LogIn, Presentation, UserCheck, Users } from 'lucide-react';
import { useHub, type Scope } from '../../lib/store';
import { useAuth } from '../../lib/auth';
import { T } from '../../lib/content';
import { useTraining } from '../../lib/trainingStore';
import { SESSION_TYPES, trainingDashboard, type TrainingSession } from '../../lib/training';
import { plural } from '../../lib/utils';
import { Empty, Kpi, Loading, PageIntro, Section } from '../../components/ui';
import { YearlyPlan } from './YearlyPlan';
import { AttendanceTab } from './AttendanceTab';
import { ActivityTab } from './ActivityTab';
import { ResourcesTab, ExamsTab } from '../ResourcePages';

export const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, public: true },
  { id: 'plan', label: 'Yearly plan', icon: CalendarDays },
  { id: 'attendance', label: 'Attendance', icon: UserCheck },
  { id: 'activity', label: 'Training activity', icon: Presentation },
  { id: 'resources', label: 'Learning resources', icon: BookOpen },
  { id: 'exams', label: 'Exams', icon: GraduationCap },
] as const;
type TabId = typeof TABS[number]['id'];

/** Does a session sit inside the Hospital › Department › Ward scope? */
export function sessionInScope(s: TrainingSession, scope: Scope, wardDept: (id: string) => string | null) {
  if (scope.ward) return s.ward_id === scope.ward;
  if (scope.department) return s.ward_id != null && wardDept(s.ward_id) === scope.department;
  if (scope.hospital) return s.hospital_id === scope.hospital;
  return true;
}

export function useScopedSessions() {
  const hub = useHub();
  const tr = useTraining();
  return useMemo(() => tr.sessions.filter(s => sessionInScope(s, hub.scope, id => hub.ward(id)?.department_id ?? null)), [tr.sessions, hub]);
}

export function TrainingLibrary() {
  const auth = useAuth();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const tab = (TABS.find(t => t.id === params.get('tab'))?.id ?? 'dashboard') as TabId;
  const locked = (id: TabId) => auth.enabled && !auth.session && !('public' in TABS.find(t => t.id === id)!);
  const select = (id: TabId) => setParams(id === 'dashboard' ? {} : { tab: id });

  let body: ReactNode;
  if (locked(tab)) body = <div className="empty module-empty"><LockKeyhole size={28} aria-hidden="true" /><strong><T>This tab needs a signed-in account</T></strong><span><T>The training dashboard is open to everyone. Plans, attendance and certificates need an account.</T></span><Link className="btn primary" to="/signin" state={{ from: `${location.pathname}${location.search}` }}><LogIn size={15} aria-hidden="true" /> <T>Sign in</T></Link></div>;
  else body = { dashboard: <TrainingDashboard />, plan: <YearlyPlan />, attendance: <AttendanceTab />, activity: <ActivityTab />, resources: <ResourcesTab />, exams: <ExamsTab /> }[tab];

  return <>
    <PageIntro title="Training library" subtitle="Plan, deliver and evidence nursing training: sessions, attendance, certificates and learning resources." />
    <div className="tabs" role="tablist" aria-label="Training library sections">
      {TABS.map(t => { const Icon = t.icon; return <button key={t.id} role="tab" id={`tab-${t.id}`} aria-selected={tab === t.id} aria-controls={`panel-${t.id}`} tabIndex={tab === t.id ? 0 : -1} className={tab === t.id ? 'tab active' : 'tab'}
        onClick={() => select(t.id)} onKeyDown={e => { const i = TABS.findIndex(x => x.id === t.id); if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); const n = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length]; select(n.id); document.getElementById(`tab-${n.id}`)?.focus(); } }}>
        <Icon size={14} aria-hidden="true" /> <T>{t.label}</T>{locked(t.id) && <LockKeyhole size={12} aria-label="Sign-in needed" />}</button>; })}
    </div>
    <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>{body}</div>
  </>;
}

const COLORS = { navy: 'var(--navy)', teal: 'var(--teal)', amber: 'var(--amber)', muted: 'var(--border)' };

function TrainingDashboard() {
  const hub = useHub();
  const tr = useTraining();
  const scoped = useScopedSessions();
  const years = useMemo(() => [...new Set(tr.sessions.map(s => Number(s.date.slice(0, 4))))].sort((a, b) => b - a), [tr.sessions]);
  const [year, setYear] = useState<number>(2026);
  const [type, setType] = useState('');
  const sessions = scoped.filter(s => s.date.startsWith(String(year)) && (!type || s.type === type));
  const d = useMemo(() => trainingDashboard(sessions, tr.attendance, tr.certificates.filter(c => c.issued_on.startsWith(String(year)) && (c.source === 'session' || hub.inScope(c.ward_id))), hub.wards, hub.hospitals, hub.departments), [sessions, tr, year, hub]);
  if (tr.loading) return <Loading label="Loading training data…" />;
  if (tr.mode === 'missing') return <Empty title="Training data is not set up yet" hint="Apply migrations 007 and 008 to the Supabase project." />;
  const k = d.kpis;
  return <>
    <div className="toolbar training-filters">
      <div className="inline-filters">
        <label className="field-inline"><span><T>Year</T></span><select value={year} onChange={e => setYear(Number(e.target.value))}>{(years.length ? years : [2026]).map(y => <option key={y}>{y}</option>)}</select></label>
        <label className="field-inline"><span><T>Type</T></span><select value={type} onChange={e => setType(e.target.value)}><option value="">All types</option>{SESSION_TYPES.map(t => <option key={t}>{t}</option>)}</select></label>
      </div>
      <span className="muted">{hub.scopeLabel} · <T>hospital, department and ward come from the filter at the top</T></span>
    </div>
    <div className="kpi-grid kpi-grid-6">
      <Kpi label="Sessions delivered" value={<>{k.delivered} <small>/ {k.planned} planned</small></>} meta={k.cancelled ? `${k.cancelled} cancelled or postponed` : 'None cancelled'} icon={CalendarDays} />
      <Kpi label="Attendees" value={String(k.attendees)} meta="Attendances marked present" tone="teal" icon={UserCheck} />
      <Kpi label="Unique attendees" value={String(k.unique)} meta="Different staff members" tone="teal" icon={Users} />
      <Kpi label="Certificates issued" value={String(k.certificates)} meta="Sessions and exams" tone="blue" icon={Award} />
      <Kpi label="Training hours" value={String(k.staffHours)} meta={`Staff hours · ${k.sessionHours} session hours`} tone="amber" icon={Clock} />
      <Kpi label="Average attendance" value={String(k.avgAttendance)} meta={k.fillRate != null ? `Per session · ${k.fillRate}% of places filled` : 'Per delivered session'} icon={GraduationCap} />
    </div>
    {!sessions.length ? <section className="panel"><Empty title="No training sessions in this scope" hint="Change the year, type or the hospital filter." /></section> : <>
      <div className="grid-2">
        <Section title="Planned and delivered sessions" meta={`${year} · by month`}><Chart label={d.months.map(m => `${m.month}: ${m.delivered} of ${m.planned}`).join(', ')}>
          <BarChart data={d.months} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="month" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} /><Tooltip /><Legend wrapperStyle={{ fontSize: 11 }} /><Bar dataKey="planned" name="Planned" fill={COLORS.muted} radius={[2, 2, 0, 0]} /><Bar dataKey="delivered" name="Delivered" fill={COLORS.navy} radius={[2, 2, 0, 0]} /></BarChart></Chart></Section>
        <Section title="Attendance trend" meta="Attendees per month"><Chart label={d.months.map(m => `${m.month}: ${m.attendees}`).join(', ')}>
          <LineChart data={d.months} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="month" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} /><Tooltip /><Line type="monotone" dataKey="attendees" name="Attendees" stroke={COLORS.teal} strokeWidth={2.5} dot={{ r: 3 }} /></LineChart></Chart></Section>
      </div>
      <div className="grid-2">
        <Section title="Activity by type" meta="Delivered sessions and attendees"><Chart label={d.byType.map(t => `${t.type}: ${t.sessions} sessions`).join(', ')}>
          <BarChart data={d.byType} layout="vertical" margin={{ left: 8, right: 16 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} /><YAxis dataKey="type" type="category" width={100} tick={{ fontSize: 11 }} /><Tooltip /><Legend wrapperStyle={{ fontSize: 11 }} /><Bar dataKey="sessions" name="Sessions" fill={COLORS.navy} /><Bar dataKey="attendees" name="Attendees" fill={COLORS.teal} /></BarChart></Chart></Section>
        <Section title="Plan completion by quarter" meta="Delivered as a share of planned"><div className="bar-list">{d.quarters.map(q => <div className="bar-row" key={q.quarter}><span>{q.quarter} {year}</span><div className="bar-track" role="img" aria-label={`${q.quarter}: ${q.delivered} of ${q.planned} delivered`}><div className="bar-fill good" style={{ width: `${q.pct}%` }} /></div><strong>{q.planned ? `${q.pct}%` : '—'}</strong></div>)}</div>
          <p className="muted quarter-note">{d.quarters.map(q => `${q.quarter}: ${q.delivered} / ${q.planned}`).join(' · ')}</p></Section>
      </div>
      <div className="grid-2">
        <Section title="Attendees by hospital and department" meta="Where attendees work"><Chart height={Math.max(200, d.byGroup.length * 30)} label={d.byGroup.map(g => `${g.group}: ${g.attendees}`).join(', ')}>
          <BarChart data={d.byGroup} layout="vertical" margin={{ left: 8, right: 16 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} /><YAxis dataKey="group" type="category" width={150} tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="attendees" name="Attendees" fill={COLORS.teal} /></BarChart></Chart></Section>
        <Section title="Top wards" meta="Most attendees">{d.topWards.length ? <ol className="rank-list">{d.topWards.map(w => <li key={w.ward_id}><span><strong>{hub.wardName(w.ward_id)}</strong><small className="muted">{hub.wardContext(w.ward_id)}</small></span><strong>{plural(w.attendees, 'attendee')}</strong></li>)}</ol> : <Empty title="No attendance recorded" hint="Attendance appears once sessions are delivered." />}</Section>
      </div>
      <Section title="Certificates per month" meta={`${year} · session and exam certificates`}><Chart height={200} label={d.months.map(m => `${m.month}: ${m.certificates}`).join(', ')}>
        <BarChart data={d.months} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="month" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="certificates" name="Certificates" fill={COLORS.amber} radius={[2, 2, 0, 0]} /></BarChart></Chart></Section>
    </>}
  </>;
}

function Chart({ children, label, height = 240 }: { children: React.ReactElement; label: string; height?: number }) {
  return <div style={{ height }} role="img" aria-label={label}><ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer></div>;
}
