import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, ArrowUpRight, CalendarDays, CheckCircle2, ChevronRight, ClipboardCheck, Hospital, ShieldCheck } from 'lucide-react';
import { useHub } from '../lib/store';
import {
  actionStatus, auditResults, complianceByStandard, complianceTrend, openActions, pendingQueue,
  plannedStatus, reportStatus, upcomingAudits, wardsAudited,
} from '../lib/derive';
import { band, bandLabel, fmtDate, plural, showToast } from '../lib/utils';
import { GroupedHeatmap, WardCell, WardOptions } from '../components/hierarchy';
import { Can } from '../components/account';
import { Empty, Kpi, Loading, Modal, PageIntro, Score, Section, Status, Table } from '../components/ui';
import type { UnplannedAudit } from '../lib/data';

const YEAR = 2026;

/** Shared, ward-scoped view of the data used by Overview, pages and badges. */
export function useScoped() {
  const hub = useHub();
  return useMemo(() => {
    const s = <T extends { ward_id: string }>(rows: T[]) => rows.filter(r => hub.inScope(r.ward_id));
    const planned = s(hub.planned), unplanned = s(hub.unplanned), actions = s(hub.actions), reports = s(hub.reports);
    const queue = pendingQueue(s(hub.pending), planned, reports);
    const results = auditResults(planned, unplanned, reports);
    return { planned, unplanned, actions, reports, queue, results, open: openActions(actions) };
  }, [hub]);
}

export function Overview() {
  const hub = useHub();
  const { planned, unplanned, queue, results, open } = useScoped();
  const topics = hub.topics.map(t => t.name);
  const wardTotal = hub.scopedWards.length;
  const audited = wardsAudited(results, YEAR);
  const completed = planned.filter(a => plannedStatus(a) === 'Completed').length;
  const overduePlanned = planned.filter(a => plannedStatus(a) === 'Overdue').length;
  const openUnplanned = unplanned.filter(u => u.status !== 'Closed');
  const highOpen = openUnplanned.filter(u => u.priority === 'High').length;
  const overdueActions = open.filter(a => actionStatus(a) === 'Overdue').length;
  const trend = complianceTrend(results, YEAR);
  const standards = complianceByStandard(topics, results);
  const upcoming = upcomingAudits(planned).slice(0, 4);
  const scopeLabel = hub.scopeLabel;

  if (hub.loading) return <><PageIntro title="Overview" subtitle="A current view of nursing audit activity, compliance and improvement work." /><Loading label="Loading audit data…" /></>;

  return <>
    <PageIntro title="Overview" subtitle="A current view of nursing audit activity, compliance and improvement work." action={<button className="btn primary" onClick={() => window.print()}><ArrowUpRight size={16} aria-hidden="true" /> Export snapshot</button>} />
    {hub.error && <div className="notice warning"><AlertTriangle size={16} aria-hidden="true" />{hub.error}</div>}
    <div className="kpi-grid">
      <Kpi label="Wards audited this year" value={<>{audited.size} <small>/ {wardTotal}</small></>} meta={`${plural(results.filter(r => r.date.startsWith(String(YEAR))).length, 'scored audit')} in ${YEAR}`} icon={Hospital} />
      <Kpi label="Planned audits" value={`${completed} / ${planned.length}`} meta={overduePlanned ? `Completed this year · ${overduePlanned} overdue` : 'Completed this year'} tone="teal" icon={CalendarDays} />
      <Kpi label="Unplanned audits" value={String(openUnplanned.length)} meta={`Open · ${highOpen} high priority`} tone="amber" icon={AlertTriangle} />
      <Kpi label="Pending audits" value={String(queue.length)} meta={queue.length ? `Longest wait ${plural(queue[0].days, 'day')}` : 'Nothing waiting'} tone="red" icon={ClipboardCheck} />
      <Kpi label="Open actions" value={String(open.length)} meta={`${overdueActions} overdue`} tone="blue" icon={CheckCircle2} />
    </div>
    <div className="grid-2">
      <Section title={`Compliance trend ${YEAR}`} meta={`${scopeLabel} · mean of the latest audit result per ward and standard, at month end`}>
        {trend.some(t => t.value != null) ? <div className="chart-wrap" role="img" aria-label={`Compliance trend: ${trend.filter(t => t.value != null).map(t => `${t.month} ${t.value}%`).join(', ')}`}>
          <ResponsiveContainer width="100%" height={235}>
            <LineChart data={trend.map(t => ({ ...t, target: 90 }))} margin={{ top: 14, right: 16, left: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis domain={[70, 100]} ticks={[70, 75, 80, 85, 90, 95, 100]} width={44} tick={{ fontSize: 11 }} tickFormatter={v => `${v}%`} allowDataOverflow />
              <Tooltip formatter={(v, name) => [v == null ? 'No results yet' : `${Number(v).toFixed(1)}%`, name === 'target' ? 'Target' : 'Compliance']} />
              <Line type="monotone" dataKey="value" stroke="var(--navy)" strokeWidth={2.5} connectNulls={false} dot={{ r: 3, fill: 'var(--navy)' }} />
              <Line dataKey="target" stroke="var(--amber)" strokeDasharray="5 4" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div> : <Empty title="No scored audits yet" hint="The trend appears once an audit in this scope has a score." />}
        <div className="chart-caption"><span><i className="legend-line navy" />Compliance</span><span><i className="legend-line amber" />Target 90%</span></div>
      </Section>
      <Section title="Compliance by standard" meta="Mean of the latest score per ward · target tick 90%">
        <div className="bar-list">{standards.map(item => <div className="bar-row" key={item.name}>
          <span>{item.name}</span>
          <div className="bar-track" role="img" aria-label={item.score == null ? `${item.name}: not audited` : `${item.name}: ${item.score}%, ${bandLabel(item.score)}`}><div className={'bar-fill ' + band(item.score)} style={{ width: `${item.score ?? 0}%` }} /><i className="target-tick" /></div>
          <strong>{item.score == null ? '—' : `${item.score}%`}</strong>
        </div>)}</div>
      </Section>
    </div>
    <Section title="Ward by standard" meta="Latest audit result per cell, grouped by hospital and department · select a cell for its source audit">
      <GroupedHeatmap topics={topics} results={results} />
    </Section>
    <div className="grid-2">
      <Section title="Needs attention" meta="Longest-waiting pending audits">
        {queue.length ? <div className="compact-list">{queue.slice(0, 4).map(x => <div className="list-row" key={x.id}><div><strong>{x.audit_ref}</strong><span>{x.waiting_for} · {hub.wardName(x.ward_id)} ({hub.wardContext(x.ward_id)})</span></div><strong className={x.days > 30 ? 'critical-text' : ''}>{plural(x.days, 'day')}</strong></div>)}</div>
          : <Empty title="Nothing waiting" hint="No pending audits in this scope." />}
      </Section>
      <Section title="Coming up" meta="Next scheduled audits">
        {upcoming.length ? <div className="compact-list">{upcoming.map(x => <div className="list-row" key={x.ref}><div><strong>{x.ref} · {x.topic}</strong><span>{hub.wardName(x.ward_id)} ({hub.wardContext(x.ward_id)}) · {fmtDate(x.due_date)}</span></div><Status value={plannedStatus(x)} /></div>)}</div>
          : <Empty title="No scheduled audits" hint="Nothing is scheduled from today onwards in this scope." />}
      </Section>
    </div>
    <Section title="Audit cycle" meta="Current programme stage"><div className="cycle">{['Plan', 'Collect', 'Analyse', 'Report', 'Act', 'Re-audit'].map((x, i) => <div className={i < 3 ? 'cycle-step done' : i === 3 ? 'cycle-step current' : 'cycle-step'} key={x}><div className="cycle-num">{i < 3 ? <CheckCircle2 size={14} aria-hidden="true" /> : i + 1}</div><strong>{x}</strong><span>{i < 3 ? 'Complete' : i === 3 ? 'Current' : 'Upcoming'}</span></div>)}</div></Section>
  </>;
}

export function Planned() {
  const hub = useHub();
  const { planned } = useScoped();
  const [status, setStatus] = useState('All');
  const rows = planned.filter(x => status === 'All' || plannedStatus(x) === status);
  return <>
    <PageIntro title="Planned audits" subtitle="Track the annual audit programme from schedule to completed score." action={<Can perm="audit.write"><button className="btn primary" onClick={() => showToast('Adding planned audits is not enabled in this simulation yet.')}><CalendarDays size={16} aria-hidden="true" /> Add planned audit</button></Can>} />
    <div className="quarter-grid">{['Q1', 'Q2', 'Q3', 'Q4'].map(q => {
      const all = planned.filter(x => x.quarter === q), done = all.filter(x => plannedStatus(x) === 'Completed').length;
      const pct = all.length ? Math.round(done / all.length * 100) : 0;
      return <div className="quarter" key={q}><div><span>{q} {YEAR}</span><strong>{done} <em>/ {all.length}</em></strong></div><div className="progress"><i style={{ width: `${pct}%` }} /></div><small>{all.length ? `${pct}% complete` : 'No audits in scope'}</small></div>;
    })}</div>
    <Section title="Programme register" meta={plural(rows.length, 'audit') + ' in view'} action={<div className="filters" role="group" aria-label="Filter by status">{['All', 'Completed', 'In progress', 'Scheduled', 'Overdue'].map(x => <button className={status === x ? 'chip active' : 'chip'} aria-pressed={status === x} onClick={() => setStatus(x)} key={x}>{x}</button>)}</div>}>
      <Table loading={hub.loading} empty={!rows.length}><thead><tr><th>Ref</th><th>Audit topic</th><th>Ward</th><th>Quarter</th><th>Due date</th><th>Auditor</th><th>Status</th><th>Score</th></tr></thead>
        <tbody>{rows.map(x => <tr key={x.ref}><td><strong>{x.ref}</strong></td><td>{x.topic}</td><td><WardCell id={x.ward_id} /></td><td>{x.quarter}</td><td className="nowrap">{fmtDate(x.due_date)}</td><td>{x.auditor}</td><td><Status value={plannedStatus(x)} /></td><td><Score value={x.score} /></td></tr>)}</tbody></Table>
    </Section>
  </>;
}

const TRIGGERS = ['Incident report', 'Patient complaint', 'Infection alert', 'Risk register', 'Management request'];

export function Unplanned() {
  const hub = useHub();
  const { unplanned } = useScoped();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ subject: '', trigger: TRIGGERS[0], priority: 'Medium', ward_id: hub.scope.ward });
  const counts = TRIGGERS.map(t => ({ name: t, count: unplanned.filter(x => x.trigger_type === t).length }));
  function save() {
    if (!form.ward_id) { showToast('Choose a ward for the request.'); return; }
    const next: UnplannedAudit = { ref: `UA-${String(hub.unplanned.length + 1).padStart(3, '0')}`, trigger_type: form.trigger, subject: form.subject.trim() || 'New simulation request', ward_id: form.ward_id, raised_on: new Date().toISOString().slice(0, 10), priority: form.priority as UnplannedAudit['priority'], status: 'Open', description: '' };
    hub.setUnplanned([...hub.unplanned, next]);
    setOpen(false);
    setForm({ subject: '', trigger: TRIGGERS[0], priority: 'Medium', ward_id: hub.scope.ward });
    showToast(`${next.ref} added for this session (simulation, not saved).`);
  }
  return <>
    <PageIntro title="Unplanned audits" subtitle="Respond to emerging risk, incidents and requests with a visible audit trail." action={<Can perm="audit.write"><button className="btn primary" onClick={() => setOpen(true)}><AlertTriangle size={16} aria-hidden="true" /> Request an audit</button></Can>} />
    <div className="grid-2">
      <Section title="Trigger breakdown" meta="Unplanned audit requests in scope">
        {hub.loading ? <Loading /> : <div className="chart-wrap" role="img" aria-label={counts.map(c => `${c.name}: ${c.count}`).join(', ')}><ResponsiveContainer width="100%" height={230}><BarChart data={counts} layout="vertical" margin={{ left: 8, right: 20 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} /><YAxis dataKey="name" type="category" width={140} tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="count" name="Requests" fill="var(--teal)" radius={[0, 3, 3, 0]} /></BarChart></ResponsiveContainer></div>}
      </Section>
      <Section title="Response note" meta="Simulation workflow"><div className="callout"><ShieldCheck size={22} aria-hidden="true" /><div><strong>Escalation is visible</strong><p>High-priority requests remain visible until their status is closed. This prototype does not send operational notifications.</p></div></div></Section>
    </div>
    <Section title="Unplanned audit log" meta={hub.loading ? 'Loading…' : plural(unplanned.length, 'record')}>
      <Table loading={hub.loading} empty={!unplanned.length} emptyHint="Try changing the hospital or ward filter."><thead><tr><th>Ref</th><th>Trigger</th><th>Subject</th><th>Ward</th><th>Date raised</th><th>Priority</th><th>Status</th></tr></thead>
        <tbody>{unplanned.map(x => <tr key={x.ref}><td><strong>{x.ref}</strong></td><td>{x.trigger_type}</td><td>{x.subject}</td><td><WardCell id={x.ward_id} /></td><td className="nowrap">{fmtDate(x.raised_on)}</td><td><Status value={x.priority} /></td><td><Status value={x.status} /></td></tr>)}</tbody></Table>
    </Section>
    {open && <Modal label="Request an unplanned audit" eyebrow="NEW REQUEST" onClose={() => setOpen(false)}>
      <label>Subject<input value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} placeholder="Describe the audit topic" /></label>
      <label>Ward<select value={form.ward_id} onChange={e => setForm({ ...form, ward_id: e.target.value })}><option value="">Select a ward</option><WardOptions wards={hub.scopedWards} /></select></label>
      <label>Trigger<select value={form.trigger} onChange={e => setForm({ ...form, trigger: e.target.value })}>{TRIGGERS.map(t => <option key={t}>{t}</option>)}</select></label>
      <label>Priority<select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}><option>Medium</option><option>High</option><option>Low</option></select></label>
      <div className="modal-actions"><button className="btn" onClick={() => setOpen(false)}>Cancel</button><button className="btn primary" onClick={save}>Save request</button></div>
    </Modal>}
  </>;
}

export function Pending() {
  const hub = useHub();
  const { queue } = useScoped();
  const age: [string, number][] = [['0–14 days', queue.filter(x => x.days <= 14).length], ['15–30 days', queue.filter(x => x.days > 14 && x.days <= 30).length], ['Over 30 days', queue.filter(x => x.days > 30).length]];
  const blockers = Array.from(new Set(queue.map(x => x.waiting_for)));
  return <>
    <PageIntro title="Pending audits" subtitle="Remove waiting time from the audit cycle with clear ownership and reminders." />
    <div className="grid-2">
      <Section title="Ageing profile" meta="Days since the audit entered the queue">{hub.loading ? <Loading /> : <div className="age-bars">{age.map(([label, count], i) => <div className="age-row" key={label}><span>{label}</span><div role="img" aria-label={`${label}: ${plural(count, 'audit')}`}><i className={i === 2 ? 'critical-bg' : i === 1 ? 'warning-bg' : 'good-bg'} style={{ width: `${queue.length ? count / queue.length * 100 : 0}%` }} /></div><strong>{count}</strong></div>)}</div>}</Section>
      <Section title="Waiting for" meta="Current blockers">{hub.loading ? <Loading /> : blockers.length ? <div className="compact-list">{blockers.map(x => <div className="list-row" key={x}><div><strong>{x}</strong><span>{plural(queue.filter(r => r.waiting_for === x).length, 'audit')}</span></div><ChevronRight size={16} aria-hidden="true" /></div>)}</div> : <Empty title="Nothing waiting" hint="No pending audits in this scope." />}</Section>
    </div>
    <Section title="Queue by waiting time" meta={plural(queue.length, 'pending audit')}>
      <Table loading={hub.loading} empty={!queue.length} emptyTitle="Nothing waiting" emptyHint="No pending audits in this scope."><thead><tr><th>Audit ref</th><th>Ward</th><th>Waiting for</th><th>Since</th><th>Days waiting</th><th>Owner</th><th><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>{queue.map(x => <tr key={x.id}><td><strong>{x.audit_ref}</strong></td><td><WardCell id={x.ward_id} /></td><td>{x.waiting_for}</td><td className="nowrap">{fmtDate(x.since_date)}</td><td><strong className={x.days > 30 ? 'critical-text' : ''}>{x.days}</strong></td><td>{x.owner}</td><td><Can perm="audit.write"><button className="btn small" aria-label={`Send reminder to ${x.owner} about ${x.audit_ref}`} onClick={() => showToast(`Reminder queued for ${x.owner} (simulation).`)}>Send reminder</button></Can></td></tr>)}</tbody></Table>
    </Section>
  </>;
}

export function Actions() {
  const hub = useHub();
  const { actions, reports } = useScoped();
  return <>
    <PageIntro title="Action plans" subtitle="Corrective actions remain visible until evidence of improvement is complete." />
    <Section title="Corrective action register" meta={`${plural(actions.length, 'action')} in view · ${openActions(actions).length} open`}>
      <Table loading={hub.loading} empty={!actions.length}><thead><tr><th>Ref</th><th>Standard</th><th>Ward</th><th>Finding</th><th>Source</th><th>Owner</th><th>Due</th><th>Progress</th><th>Status</th></tr></thead>
        <tbody>{actions.map(x => { const rep = reports.find(r => r.audit_ref === x.audit_ref); return <tr key={x.ref}><td><strong>{x.ref}</strong></td><td>{x.topic}</td><td><WardCell id={x.ward_id} /></td><td className="finding">{x.finding}</td><td className="nowrap">{x.audit_ref ?? '—'}{rep && <small className="muted block">{rep.serial} · {reportStatus(rep)}</small>}</td><td>{x.owner}</td><td className="nowrap">{fmtDate(x.due_date)}</td><td><div className="table-progress" role="img" aria-label={`${x.progress}% complete`}><i style={{ width: `${x.progress}%` }} /></div><small>{x.progress}%</small></td><td><Status value={actionStatus(x)} /></td></tr>; })}</tbody></Table>
    </Section>
  </>;
}


