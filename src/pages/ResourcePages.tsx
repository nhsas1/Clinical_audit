import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Download, ExternalLink, FileCheck2, Link2, LockKeyhole, Pencil, Save, Search, ShieldCheck, Sparkles, Upload, UsersRound } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { supabase } from '../lib/supabase';
import { useHub } from '../lib/store';
import { actionStatus, REPORT_STAGES, reportDate, reportStatus } from '../lib/derive';
import { PASS_MARK, type Liaison, type Report } from '../lib/data';
import { fmtDate, plural, showToast } from '../lib/utils';
import { Drawer, Empty, Modal, PageIntro, Score, Section, Status, Table } from '../components/ui';
import { useScoped } from './AuditPages';
import { WardCell } from '../components/hierarchy';

const tools = [['Hand Hygiene Observation', 'v3.1', 12, '2026-02-14'], ['Medication Administration', 'v2.4', 18, '2026-01-22'], ['Patient Identification', 'v2.2', 10, '2026-03-03'], ['Pressure Injury Prevention Bundle', 'v4.0', 15, '2026-02-28'], ['Falls Risk and Prevention', 'v3.0', 14, '2026-01-30'], ['Peripheral IV Cannula Care', 'v2.1', 11, '2026-02-18'], ['Nursing Documentation', 'v3.2', 20, '2026-03-09'], ['Nursing Handover SBAR', 'v1.8', 9, '2026-02-05']] as const;
const learning = [['Five moments refresher', 'Video', 'Hand hygiene', 'Foundation', 12], ['Safe administration checks', 'Slides', 'Medication safety', 'Foundation', 18], ['Patient ID at the bedside', 'PDF guide', 'Patient safety', 'Foundation', 10], ['Pressure injury bundle walk-through', 'Video', 'Pressure injury', 'Intermediate', 22], ['Falls prevention essentials', 'Slides', 'Falls', 'Foundation', 20], ['Peripheral IV review', 'PDF guide', 'Vascular access', 'Intermediate', 15], ['Writing a useful nursing note', 'Video', 'Documentation', 'Foundation', 16], ['SBAR handover practice', 'Slides', 'Communication', 'Foundation', 25]] as const;
const simulated = () => showToast('Files are not attached yet in this simulation.');

export function Tools() {
  return <><PageIntro title="Audit tools" subtitle="Approved observation tools and electronic forms for nursing clinical audit." />
    <div className="tool-grid">{tools.map(([name, version, count, date]) => <div className="tool-card" key={name}><div className="tool-icon"><FileCheck2 size={18} aria-hidden="true" /></div><div className="eyebrow">NURSING TOOL</div><h2>{name}</h2><div className="tool-meta"><span>Version <strong>{version}</strong></span><span><strong>{count}</strong> items</span><span>Reviewed <strong>{fmtDate(date)}</strong></span></div><div className="tool-actions"><button className="btn small" onClick={simulated} aria-label={`Word checklist for ${name}`}><Download size={13} aria-hidden="true" /> Word checklist</button><button className="btn small primary" onClick={simulated} aria-label={`Open form for ${name}`}><ExternalLink size={13} aria-hidden="true" /> Open Form</button></div></div>)}</div>
    <div className="notice"><LockKeyhole size={15} aria-hidden="true" /> Resource actions are simulated until a Supabase Storage file is uploaded.</div></>;
}

export function Reports() {
  const hub = useHub();
  const { reports, actions } = useScoped();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('All');
  const [drawer, setDrawer] = useState<{ kind: 'ref' | 'track'; report: Report } | null>(null);
  const scoreOf = (r: Report) => hub.planned.find(a => a.ref === r.audit_ref)?.score ?? hub.unplanned.find(u => u.ref === r.audit_ref)?.score ?? null;
  const rows = reports.filter(r => (status === 'All' || reportStatus(r) === status) && `${r.serial} ${r.title}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => b.serial.localeCompare(a.serial));
  const d = drawer?.report;
  return <><PageIntro title="Reports" subtitle="Serialised audit reports with reference trails and lifecycle history." action={<button className="btn primary" onClick={simulated}><Upload size={15} aria-hidden="true" /> Upload report</button>} />
    <Section title="Report register" meta={plural(rows.length, 'report') + ' in view'}>
      <div className="toolbar"><label className="search"><Search size={15} aria-hidden="true" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search serial or title" aria-label="Search serial or title" /></label><div className="filters" role="group" aria-label="Filter by status">{['All', 'Draft', 'Under review', 'Approved', 'Published'].map(x => <button className={status === x ? 'chip active' : 'chip'} aria-pressed={status === x} onClick={() => setStatus(x)} key={x}>{x}</button>)}</div></div>
      <Table loading={hub.loading} empty={!rows.length} className="sticky-first reports-table"><thead><tr><th>Serial no.</th><th>Report</th><th>Audit</th><th>Ward</th><th>Date</th><th>Score</th><th>Status</th><th>References</th><th>Track</th></tr></thead>
        <tbody>{rows.map(r => <tr key={r.serial}><td><strong>{r.serial}</strong></td><td>{r.title}</td><td>{r.audit_ref}</td><td><WardCell id={r.ward_id} /></td><td className="nowrap">{fmtDate(reportDate(r))}</td><td><Score value={scoreOf(r)} /></td><td><Status value={reportStatus(r)} /></td>
          <td><button className="icon-btn" onClick={() => setDrawer({ kind: 'ref', report: r })} aria-label={`View references for ${r.serial}`}><Link2 size={16} aria-hidden="true" /></button></td>
          <td><button className="btn small" onClick={() => setDrawer({ kind: 'track', report: r })} aria-label={`Track ${r.serial}`}>Track</button></td></tr>)}</tbody></Table>
    </Section>
    {drawer && d && <Drawer label={drawer.kind === 'ref' ? 'References panel' : 'Tracking panel'} onClose={() => setDrawer(null)}>
      {drawer.kind === 'ref' ? <>
        <div className="eyebrow">REPORT REFERENCES</div><h2>Standards used</h2><p className="muted">{d.serial} · {d.title}</p>
        <div className="drawer-list">{d.references.map(code => hub.references.find(x => x.code === code)).filter(Boolean).map(r => <div key={r!.code}><strong>{r!.code}</strong><span>{r!.title}</span>{r!.url ? <a href={r!.url} target="_blank" rel="noreferrer">Open external link <ExternalLink size={12} aria-hidden="true" /></a> : <span className="muted">No external link</span>}</div>)}</div>
        <div className="eyebrow drawer-sub">LINKED RECORDS</div>
        <div className="drawer-list"><div><strong>Audit {d.audit_ref}</strong><span>{hub.planned.find(a => a.ref === d.audit_ref)?.topic ?? hub.unplanned.find(u => u.ref === d.audit_ref)?.subject ?? ''} · {hub.wardName(d.ward_id)} ({hub.wardContext(d.ward_id)})</span></div>
          {actions.filter(a => a.audit_ref === d.audit_ref).map(a => <div key={a.ref}><strong>Action plan {a.ref} · {actionStatus(a)}</strong><span>{a.finding}</span></div>)}
          {!actions.some(a => a.audit_ref === d.audit_ref) && <div><span>No action plans linked to this audit.</span></div>}</div>
      </> : <>
        <div className="eyebrow">REPORT TRACKING</div><h2>Lifecycle timeline</h2><p className="muted">{d.serial} · {d.title}</p>
        <ol className="timeline">{REPORT_STAGES.map((stage, i) => { const hit = d.history.find(h => h.stage === stage); const isLast = hit && d.history[d.history.length - 1].stage === stage; return <li className={isLast ? 'timeline-item current' : hit ? 'timeline-item complete' : 'timeline-item'} key={stage}><i aria-hidden="true" /><div><strong>{stage}</strong><span>{hit ? `${isLast ? 'Current stage' : 'Reached'} · ${fmtDate(hit.date)}` : i === d.history.length ? 'Next stage' : 'Upcoming stage'}</span></div></li>; })}</ol>
      </>}
    </Drawer>}
  </>;
}

export function Standards() {
  const hub = useHub();
  const [filter, setFilter] = useState('All');
  const [show, setShow] = useState(false);
  const rows = hub.references.filter(x => filter === 'All' || x.kind === filter);
  return <><PageIntro title="Standards and policies" subtitle="The reference library behind audit methods, reports and improvement work." action={<button className="btn primary" onClick={() => setShow(true)}><Link2 size={15} aria-hidden="true" /> Add link</button>} />
    <Section title="Reference library" meta={plural(rows.length, 'reference')} action={<div className="filters" role="group" aria-label="Filter by type">{['All', 'External standard', 'Internal policy', 'Audit method'].map(x => <button className={filter === x ? 'chip active' : 'chip'} aria-pressed={filter === x} onClick={() => setFilter(x)} key={x}>{x}</button>)}</div>}>
      <Table loading={hub.loading} empty={!rows.length}><thead><tr><th>Code</th><th>Title</th><th>Type</th><th>Link</th></tr></thead><tbody>{rows.map(x => <tr key={x.code}><td><strong>{x.code}</strong></td><td>{x.title}</td><td><Status value={x.kind} /></td><td>{x.url ? <a className="text-link" href={x.url} target="_blank" rel="noreferrer">Open source <ExternalLink size={12} aria-hidden="true" /></a> : <span className="muted">No external link</span>}</td></tr>)}</tbody></Table>
    </Section>
    {show && <Modal label="Add internal link" eyebrow="REFERENCE LIBRARY" onClose={() => setShow(false)}><label>Reference title<input placeholder="Internal policy title" /></label><label>URL<input placeholder="https://..." /></label><div className="modal-actions"><button className="btn" onClick={() => setShow(false)}>Cancel</button><button className="btn primary" onClick={() => { setShow(false); showToast('Saving links needs a signed-in admin (not enabled yet).'); }}>Save link</button></div></Modal>}
  </>;
}

export function Initiatives() {
  const hub = useHub();
  const rows = hub.initiatives.filter(x => hub.inScope(x.ward_id));
  return <><PageIntro title="Quality initiatives" subtitle="PDSA workstreams turning audit findings into measurable improvement." action={<button className="btn primary" onClick={() => showToast('Adding initiatives is not enabled in this simulation yet.')}><Sparkles size={15} aria-hidden="true" /> Add initiative</button>} />
    {!rows.length ? <section className="panel"><Empty title="No initiatives for this ward" hint="Choose another ward or All wards in the filter at the top." /></section> :
      <div className="initiative-grid">{rows.map(x => <div className="initiative-card" key={x.ref}><div className="initiative-top"><strong>{x.ref}</strong><Status value={x.stage} /></div><h2>{x.title}</h2><div className="muted">{hub.wardName(x.ward_id)} ({hub.wardContext(x.ward_id)}) · {x.category} · {x.lead}</div><div className="pdsa" aria-label={`PDSA stage: ${x.stage}`}>{['Plan', 'Do', 'Study', 'Act'].map(s => <span className={s === x.stage ? 'current' : ''} key={s}>{s}</span>)}</div><div className="initiative-progress" role="img" aria-label={`${x.progress}% complete`}><i style={{ width: `${x.progress}%` }} /></div><div className="initiative-foot"><span>{x.progress}% complete</span><strong>{x.measure}</strong></div></div>)}</div>}
  </>;
}

export function Training() {
  const [cat, setCat] = useState('All');
  const cats = ['All', 'Hand hygiene', 'Medication safety', 'Patient safety', 'Pressure injury', 'Falls', 'Vascular access', 'Documentation', 'Communication'];
  const rows = learning.filter(x => cat === 'All' || x[2] === cat);
  return <><PageIntro title="Training library" subtitle="Short, practical learning resources for quality and audit readiness." />
    <div className="filters category-filters" role="group" aria-label="Filter by category">{cats.map(x => <button className={cat === x ? 'chip active' : 'chip'} aria-pressed={cat === x} onClick={() => setCat(x)} key={x}>{x}</button>)}</div>
    <Section title="Learning resources" meta={plural(rows.length, 'resource')}><Table empty={!rows.length}><thead><tr><th>Title</th><th>Format</th><th>Category</th><th>Level</th><th>Minutes</th><th><span className="sr-only">Open</span></th></tr></thead><tbody>{rows.map(x => <tr key={x[0]}><td><strong>{x[0]}</strong></td><td>{x[1]}</td><td>{x[2]}</td><td>{x[3]}</td><td>{x[4]}</td><td><button className="btn small" onClick={simulated} aria-label={`Open ${x[0]}`}><ExternalLink size={13} aria-hidden="true" /> Open</button></td></tr>)}</tbody></Table></Section></>;
}

function PassFail({ score }: { score: number }) { return <Status value={score >= PASS_MARK ? 'Pass' : 'Fail'} />; }

export function Certificates() {
  const hub = useHub();
  const [course, setCourse] = useState('Hand Hygiene: Five Moments');
  const [name, setName] = useState('');
  const [answers, setAnswers] = useState<number[]>(Array(5).fill(-1));
  const [result, setResult] = useState<{ score: number; passed: boolean; number?: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const register = hub.certificates.filter(c => hub.inScope(c.ward_id));
  const hand = course.startsWith('Hand');
  const questions = hand ? ['When should hand hygiene be performed before a clean procedure?', 'Which action is required after touching a patient?', 'Gloves replace hand hygiene.', 'The correct product depends on local policy and the task.', 'Hand hygiene is part of preventing transmission.'] : ['What is checked before administration?', 'A discrepancy should be escalated before administration.', 'Which is a safe documentation practice?', 'A second check is required where local policy specifies it.', 'If unsure, seek advice before proceeding.'];
  const options = hand ? [['After touching surroundings', 'Immediately before the procedure', 'Only at the end of the shift'], ['Hand hygiene', 'Record the contact', 'No action'], ['True', 'False'], ['True', 'False'], ['True', 'False']] : [['The patient identity and prescription', 'Only the room number', 'Nothing if familiar'], ['True', 'False'], ['Document immediately according to policy', 'Document at month end', 'Skip documentation'], ['True', 'False'], ['True', 'False']];
  async function submit() {
    setSubmitting(true); setResult(null);
    try {
      if (supabase) {
        const courseRow = await supabase.from('courses').select('id').eq('name', course).single();
        if (!courseRow.error && courseRow.data) {
          const { data, error } = await supabase.rpc('score_exam', { p_course_id: courseRow.data.id, p_answers: Object.fromEntries(answers.map((a, i) => [String(i + 1), a])), p_trainee_name: name.trim() });
          if (!error && data) { setResult({ score: Number(data.score), passed: Boolean(data.passed), number: data.certificate_number || undefined }); return; }
        }
      }
      showToast('The exam could not be scored right now. Please try again later.');
    } finally { setSubmitting(false); }
  }
  function download() {
    if (!result?.passed) return;
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    pdf.setDrawColor(31, 78, 121); pdf.setLineWidth(1.2); pdf.rect(12, 12, 273, 186); pdf.setLineWidth(.35); pdf.rect(16, 16, 265, 178);
    pdf.setFont('times', 'bold'); pdf.setFontSize(28); pdf.text('Certificate of Completion', 148, 48, { align: 'center' });
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(12); pdf.text('Nursing Audit Hub · Clinical Audit Department', 148, 62, { align: 'center' });
    pdf.setFontSize(21); pdf.text(name || 'Trainee Nurse', 148, 91, { align: 'center' });
    pdf.setFontSize(13); pdf.text(`has completed ${course}`, 148, 106, { align: 'center' }); pdf.text(`Score: ${result.score}%    Certificate: ${result.number}`, 148, 121, { align: 'center' });
    pdf.setFontSize(10); pdf.line(72, 160, 125, 160); pdf.line(165, 160, 218, 160); pdf.text('Head of Clinical Audit', 98, 168, { align: 'center' }); pdf.text('Director of Nursing', 191, 168, { align: 'center' });
    pdf.save(`${result.number}.pdf`);
  }
  return <><PageIntro title="Certificates" subtitle="Complete a short course exam and issue a verifiable learning certificate." />
    <div className="exam-layout"><Section title="Course exam" meta={`Pass mark ${PASS_MARK}%`}>
      <label className="field-label">Course<select value={course} onChange={e => { setCourse(e.target.value); setResult(null); setAnswers(Array(5).fill(-1)); }}><option>Hand Hygiene: Five Moments</option><option>Medication Safety: Administration Checks</option></select></label>
      <label className="field-label">Trainee name<input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Trainee Nurse A" /></label>
      <div className="questions">{questions.map((q, i) => <fieldset key={q}><legend>{i + 1}. {q}</legend>{options[i].map((o, j) => <label className="radio" key={o}><input type="radio" name={`q${i}`} checked={answers[i] === j} onChange={() => setAnswers(a => a.map((v, k) => k === i ? j : v))} />{o}</label>)}</fieldset>)}</div>
      <button className="btn primary" disabled={!name || answers.some(a => a < 0) || submitting} onClick={submit}>{submitting ? 'Submitting securely…' : 'Submit exam'}</button>
    </Section>
      <div>{result ? <div className={result.passed ? 'result-card passed' : 'result-card failed'} role="status"><ShieldCheck size={26} aria-hidden="true" /><div className="eyebrow">EXAM RESULT</div><h2>{result.passed ? 'Pass' : 'Fail'}</h2><strong className="result-score">{result.score}%</strong><p>{result.passed ? `Certificate ${result.number} has been issued.` : `Below the ${PASS_MARK}% pass mark. Review the learning resources and try again.`}</p>{result.passed && <button className="btn primary" onClick={download}><Download size={15} aria-hidden="true" /> Download PDF</button>}</div>
        : <div className="certificate-note"><ShieldCheck size={25} aria-hidden="true" /><strong>Automatic certificate</strong><p>Answers are scored by the Supabase database function. Correct answers are never sent to the browser.</p></div>}</div></div>
    <Section title="Certificate register" meta="Fictional register preview"><Table empty={!register.length}><thead><tr><th>Trainee</th><th>Ward</th><th>Course</th><th>Score</th><th>Result</th><th>Certificate number</th></tr></thead><tbody>{register.map(c => <tr key={c.trainee + c.course}><td>{c.trainee}</td><td><WardCell id={c.ward_id} /></td><td>{c.course}</td><td className="score">{c.score}%</td><td><PassFail score={c.score} /></td><td>{c.number ?? '— (retake required)'}</td></tr>)}</tbody></Table></Section></>;
}

const TRAINING_STATUSES: Liaison['training_status'][] = ['Trained', 'Refresher due', 'Not yet trained'];

export function Liaisons() {
  const hub = useHub();
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<Liaison[] | null>(null);
  const editing = draft != null;
  const source = draft ?? hub.liaisons;
  const scoped = source.filter(x => hub.inScope(x.ward_id));
  const q = query.toLowerCase();
  const rows = scoped.filter(x => `${hub.wardName(x.ward_id)} ${hub.wardContext(x.ward_id)} ${x.name} ${x.role}`.toLowerCase().includes(q));
  const wardsInScope = hub.scopedWards.length;
  const covered = new Set(scoped.map(x => x.ward_id)).size;
  const trained = scoped.filter(x => x.training_status === 'Trained').length;
  const pct = (n: number, d: number) => (d ? Math.round(n / d * 100) : 0);
  const update = (ward_id: string, patch: Partial<Liaison>) => setDraft(d => (d ?? hub.liaisons).map(x => x.ward_id === ward_id ? { ...x, ...patch } : x));
  function save() {
    if (!draft) return;
    const bad = draft.find(x => !x.name.trim() || !/^\d{4}$/.test(x.ext));
    if (bad) { showToast(`Check ${hub.wardName(bad.ward_id)} (${hub.wardContext(bad.ward_id)}): a name and a 4-digit extension are required.`); return; }
    hub.setLiaisons(draft); setDraft(null);
    showToast('Directory updated for this session. Saving to the database needs a signed-in admin.');
  }
  return <><PageIntro title="Quality liaisons" subtitle="A ward-by-ward view of the nursing quality liaison network." action={editing
    ? <div className="btn-row"><button className="btn" onClick={() => setDraft(null)}>Cancel</button><button className="btn primary" onClick={save}><Save size={15} aria-hidden="true" /> Save directory</button></div>
    : <button className="btn primary" onClick={() => setDraft(hub.liaisons)}><Pencil size={15} aria-hidden="true" /> Edit directory</button>} />
    <div className="notice sample-note"><LockKeyhole size={15} aria-hidden="true" /> <strong>Sample data.</strong> Names and extensions are fictional. Use the Hospital and Department filters at the top to narrow the directory.</div>
    {editing && <div className="notice" role="status"><Pencil size={15} aria-hidden="true" /> Editing the directory. Unsaved changes are kept until you save or cancel.</div>}
    <div className="kpi-grid kpi-grid-3">
      <div className="kpi"><div className="kpi-top"><span>Coverage</span><UsersRound size={17} aria-hidden="true" /></div><strong>{pct(covered, wardsInScope)}% <small>{covered} / {wardsInScope} wards</small></strong><small>{covered === wardsInScope ? 'Every ward in scope has a liaison' : `${plural(wardsInScope - covered, 'ward')} without a liaison`}</small></div>
      <div className="kpi"><div className="kpi-top"><span>Fully trained</span><ShieldCheck size={17} aria-hidden="true" /></div><strong>{pct(trained, scoped.length)}% <small>{trained} / {scoped.length}</small></strong><small>{plural(scoped.length - trained, 'liaison')} need follow-up</small></div>
      <div className="kpi"><div className="kpi-top"><span>Scope</span><Search size={17} aria-hidden="true" /></div><strong className="kpi-text">{hub.scopeLabel}</strong><small>Set with the filter at the top</small></div>
    </div>
    <Section title="Liaison directory" meta={plural(rows.length, 'liaison') + ' in view'}>
      <label className="search liaison-search"><Search size={15} aria-hidden="true" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search ward, hospital or liaison" aria-label="Search ward, hospital or liaison" /></label>
      <Table loading={hub.loading} empty={!rows.length} className="sticky-first"><thead><tr><th>Ward</th><th>Quality liaison</th><th>Role</th><th>Extension</th><th>Training status</th><th>Last meeting</th></tr></thead>
        <tbody>{rows.map(x => { const label = `${hub.wardName(x.ward_id)} (${hub.wardContext(x.ward_id)})`; return <tr key={x.ward_id}><td><strong><WardCell id={x.ward_id} /></strong></td>
          {editing ? <>
            <td><input aria-label={`Liaison name for ${label}`} value={x.name} onChange={e => update(x.ward_id, { name: e.target.value })} /></td>
            <td><input aria-label={`Role for ${label}`} value={x.role} onChange={e => update(x.ward_id, { role: e.target.value })} /></td>
            <td><input aria-label={`Extension for ${label}`} inputMode="numeric" className="input-narrow" value={x.ext} onChange={e => update(x.ward_id, { ext: e.target.value.replace(/\D/g, '').slice(0, 4) })} /></td>
            <td><select aria-label={`Training status for ${label}`} value={x.training_status} onChange={e => update(x.ward_id, { training_status: e.target.value as Liaison['training_status'] })}>{TRAINING_STATUSES.map(st => <option key={st}>{st}</option>)}</select></td>
            <td><input aria-label={`Last meeting for ${label}`} type="date" min="2026-01-01" max="2026-12-31" value={x.last_meeting} onChange={e => update(x.ward_id, { last_meeting: e.target.value })} /></td>
          </> : <><td>{x.name}</td><td>{x.role}</td><td>{x.ext}</td><td><Status value={x.training_status} /></td><td className="nowrap">{fmtDate(x.last_meeting)}</td></>}
        </tr>; })}</tbody></Table>
    </Section></>;
}

export function Verify() {
  const { certificateNumber } = useParams();
  const [record, setRecord] = useState<{ trainee_name: string; course_name: string; issued_on: string } | null>(null);
  const [checked, setChecked] = useState(false);
  useEffect(() => { (async () => { try { if (supabase && certificateNumber) { const { data } = await supabase.from('public_certificate_verification').select('trainee_name,course_name,issued_on').eq('number', certificateNumber).maybeSingle(); if (data) setRecord(data); } } finally { setChecked(true); } })(); }, [certificateNumber]);
  return <><PageIntro eyebrow="PUBLIC VERIFICATION" title="Certificate verification" subtitle="Limited public view: only the certificate identity and issue date are shown." />
    <div className="verify-card"><ShieldCheck size={30} aria-hidden="true" /><div className="eyebrow">CERTIFICATE NUMBER</div><h2>{certificateNumber}</h2>{checked && record ? <div className="verify-grid"><span>Trainee</span><strong>{record.trainee_name}</strong><span>Course</span><strong>{record.course_name}</strong><span>Issue date</span><strong>{fmtDate(record.issued_on)}</strong></div> : checked ? <div className="notice warning">No certificate was found for this number.</div> : <p className="muted">Checking the certificate register…</p>}<p className="muted">This is a fictional simulation record.</p></div></>;
}
