import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Award, ClipboardPaste, Download, FileSpreadsheet, Plus, Save, Search, Trash2, Upload } from 'lucide-react';
import { useHub } from '../../lib/store';
import { useAuth } from '../../lib/auth';
import { T } from '../../lib/content';
import { useTraining } from '../../lib/trainingStore';
import { STAFF_ROLES, certificatePdf, downloadBlob, parseDelimited, validateAttendees, zipBlobs, type Attendee, type ImportResult, type TrainingCertificate } from '../../lib/training';
import { fmtDate, plural, showToast } from '../../lib/utils';
import { Empty, Loading, Section, Status, Table } from '../../components/ui';
import { WardCell, WardOptions } from '../../components/hierarchy';
import { useScopedSessions } from './TrainingLibrary';

type Row = Omit<Attendee, 'session_id'>;

export function AttendanceTab() {
  const hub = useHub();
  const auth = useAuth();
  const tr = useTraining();
  const sessions = useScopedSessions().filter(s => s.status !== 'Cancelled').sort((a, b) => b.date.localeCompare(a.date));
  const [sessionId, setSessionId] = useState('');
  const session = tr.sessions.find(s => s.id === sessionId) ?? null;
  useEffect(() => { if (!sessionId && sessions.length) setSessionId((sessions.find(s => s.status === 'Delivered') ?? sessions[0]).id); }, [sessions, sessionId]);

  const saved = useMemo(() => tr.attendance.filter(a => a.session_id === sessionId).map(({ session_id: _s, ...r }) => r).sort((a, b) => a.name.localeCompare(b.name)), [tr.attendance, sessionId]);
  const [sheet, setSheet] = useState<Row[]>(saved);
  useEffect(() => { setSheet(saved); setPreview(null); }, [saved]);
  const dirty = JSON.stringify(sheet) !== JSON.stringify(saved);
  const canEdit = auth.can('audit.write');
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [paste, setPaste] = useState('');
  const [mode, setMode] = useState<'type' | 'paste' | 'file'>('type');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const issuedFor = new Set(tr.certificates.filter(c => c.session_id === sessionId).map(c => c.staff_number));
  const pendingCerts = sheet.filter(r => r.attended && !issuedFor.has(r.staff_number)).length;

  const ctx = { wards: hub.wards, hospitals: hub.hospitals, departments: hub.departments, existing: sheet.map(r => r.staff_number) };
  const runImport = (rows: string[][]) => setPreview(validateAttendees(rows, ctx));
  async function onFile(file: File) {
    try {
      if (/\.xlsx$/i.test(file.name)) {
        const { default: readXlsx } = await import('read-excel-file');
        const rows = await readXlsx(file);
        runImport(rows.map(r => r.map(c => (c instanceof Date ? c.toISOString().slice(0, 10) : c == null ? '' : String(c)))));
      } else if (/\.(csv|txt|tsv)$/i.test(file.name)) runImport(parseDelimited(await file.text()));
      else showToast('Use an .xlsx, .csv or .txt file.');
    } catch { showToast('The file could not be read. Save it as .xlsx or .csv and try again.'); }
  }

  async function save() {
    setBusy(true);
    const removed = saved.filter(s => !sheet.some(r => r.staff_number === s.staff_number));
    for (const r of removed) { const e = await tr.removeAttendee(sessionId, r.staff_number); if (e) { showToast(e); setBusy(false); return; } }
    const err = await tr.saveAttendees(sessionId, sheet.map(r => ({ ...r, session_id: sessionId })));
    setBusy(false);
    showToast(err ?? `Attendee sheet saved${tr.mode === 'sample' ? ' (sample mode, not stored)' : ''}.`);
  }

  async function pdfFor(c: TrainingCertificate) {
    return certificatePdf({ number: c.number, name: c.trainee, title: c.title, date: fmtDate(c.issued_on), detail: session ? `${session.type}, ${session.duration_minutes} minutes` : undefined, verifyUrl: `${window.location.origin}/verify/${c.number}` });
  }
  async function generate() {
    if (!session) return;
    setBusy(true);
    const { error, issued } = await tr.issueCertificates(session.id);
    if (error) { setBusy(false); showToast(error); return; }
    if (!issued.length) { setBusy(false); showToast('Everyone marked attended already has a certificate.'); return; }
    const files = await Promise.all(issued.map(async c => { const blob = await pdfFor(c); await tr.storeCertificatePdf(c.number, blob); return { name: `${c.number}.pdf`, blob }; }));
    downloadBlob(await zipBlobs(files), `${session.id}-certificates.zip`);
    setBusy(false);
    showToast(`${plural(issued.length, 'certificate')} issued and downloaded${tr.mode === 'supabase' ? ', copies stored in the certificates bucket' : ''}.`);
  }

  if (tr.loading) return <Loading />;
  if (!sessions.length) return <section className="panel"><Empty title="No sessions in this scope" hint="Add sessions in the Yearly plan or change the hospital filter." /></section>;
  const sessionCerts = tr.certificates.filter(c => c.session_id === sessionId);

  return <>
    <Section title="Session" meta="Choose a session to see and edit its attendee sheet">
      <div className="session-pick">
        <label className="field-label grow">Session<select aria-label="Session" value={sessionId} onChange={e => setSessionId(e.target.value)}>
          {sessions.map(s => <option key={s.id} value={s.id}>{fmtDate(s.date)} · {s.title} · {s.ward_id ? hub.wardName(s.ward_id) : hub.hospital(s.hospital_id)?.short} ({s.status})</option>)}</select></label>
        {session && <dl className="session-facts"><div><dt>Status</dt><dd><Status value={session.status} /></dd></div><div><dt>Trainer</dt><dd>{session.trainer}</dd></div><div><dt>Where</dt><dd>{session.venue} · {session.ward_id ? `${hub.wardName(session.ward_id)} (${hub.wardContext(session.ward_id)})` : hub.hospital(session.hospital_id)?.name}</dd></div><div><dt>Places</dt><dd>{sheet.filter(r => r.attended).length} attended / {session.capacity ?? '—'}</dd></div></dl>}
      </div>
    </Section>

    <Section title="Attendee sheet" meta={`${plural(sheet.length, 'person', 'people')} · ${sheet.filter(r => r.attended).length} attended`} action={canEdit ? <div className="btn-row">
      {dirty && <span className="unsaved-tag" role="status">Unsaved changes</span>}
      <button className="btn" disabled={!dirty || busy} onClick={() => setSheet(saved)}><T>Undo changes</T></button>
      <button className="btn primary" disabled={!dirty || busy} onClick={save}><Save size={14} aria-hidden="true" /> <T>Save sheet</T></button>
    </div> : undefined}>
      {canEdit && <div className="add-modes">
        <div className="seg" role="group" aria-label="How to add attendees">
          <button className={mode === 'type' ? 'seg-btn active' : 'seg-btn'} aria-pressed={mode === 'type'} onClick={() => setMode('type')}><Plus size={13} aria-hidden="true" /> <T>Type</T></button>
          <button className={mode === 'paste' ? 'seg-btn active' : 'seg-btn'} aria-pressed={mode === 'paste'} onClick={() => setMode('paste')}><ClipboardPaste size={13} aria-hidden="true" /> <T>Bulk paste</T></button>
          <button className={mode === 'file' ? 'seg-btn active' : 'seg-btn'} aria-pressed={mode === 'file'} onClick={() => setMode('file')}><FileSpreadsheet size={13} aria-hidden="true" /> <T>Excel or CSV</T></button>
        </div>
        {mode === 'type' && <TypeRow existing={sheet.map(r => r.staff_number)} onAdd={r => setSheet(s => [...s, r].sort((a, b) => a.name.localeCompare(b.name)))} />}
        {mode === 'paste' && <div className="paste-box">
          <label className="field-label">Paste rows from a spreadsheet: name, staff number, hospital, ward, role, attended (a header row is optional)
            <textarea rows={5} aria-label="Rows to paste" value={paste} onChange={e => setPaste(e.target.value)} placeholder={'Name\tStaff number\tHospital\tWard\tRole\tAttended\nHuda M.\tN12345\tSMC\tWard 33 (Surgical)\tStaff nurse\tyes'} /></label>
          <button className="btn" disabled={!paste.trim()} onClick={() => runImport(parseDelimited(paste))}><Search size={14} aria-hidden="true" /> <T>Check rows</T></button>
        </div>}
        {mode === 'file' && <div className="paste-box">
          <p className="muted">Columns: name, staff number, hospital, ward, role, attended. Use “Ward 33 (Surgical)” where a ward name repeats. Fictional data only.</p>
          <input ref={fileRef} type="file" accept=".xlsx,.csv,.txt,.tsv" className="sr-only" id="attendee-file" onChange={e => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ''; }} />
          <label htmlFor="attendee-file" className="btn"><Upload size={14} aria-hidden="true" /> <T>Choose file</T></label>
        </div>}
        {preview && <ImportPreview result={preview} onCancel={() => setPreview(null)} onAdd={() => { setSheet(s => [...s, ...preview.valid].sort((a, b) => a.name.localeCompare(b.name))); setPreview(null); setPaste(''); showToast(`${plural(preview.valid.length, 'row')} added to the sheet. Save the sheet to keep them.`); }} />}
      </div>}
      <Table empty={!sheet.length} emptyTitle="No attendees yet" emptyHint={canEdit ? 'Type, paste or upload attendees above.' : 'Nobody has been added to this session.'}>
        <thead><tr><th><T>Name</T></th><th><T>Staff number</T></th><th><T>Ward</T></th><th><T>Role</T></th><th><T>Attended</T></th><th><T>Certificate</T></th>{canEdit && <th><span className="sr-only">Remove</span></th>}</tr></thead>
        <tbody>{sheet.map(r => { const cert = sessionCerts.find(c => c.staff_number === r.staff_number); return <tr key={r.staff_number}>
          <td><strong>{r.name}</strong></td><td className="mono">{r.staff_number}</td><td>{r.ward_id ? <WardCell id={r.ward_id} /> : '—'}</td><td>{r.role}</td>
          <td>{canEdit && !cert ? <label className="check"><input type="checkbox" checked={r.attended} onChange={e => setSheet(s => s.map(x => x.staff_number === r.staff_number ? { ...x, attended: e.target.checked } : x))} aria-label={`${r.name} attended`} /> {r.attended ? 'Yes' : 'No'}</label> : r.attended ? 'Yes' : 'No'}</td>
          <td>{cert ? <button className="link-btn" onClick={async () => downloadBlob(await pdfFor(cert), `${cert.number}.pdf`)} aria-label={`Download certificate ${cert.number} for ${r.name}`}>{cert.number}</button> : <span className="muted">—</span>}</td>
          {canEdit && <td>{!cert && <button className="icon-btn danger" aria-label={`Remove ${r.name} from the sheet`} onClick={() => setSheet(s => s.filter(x => x.staff_number !== r.staff_number))}><Trash2 size={14} aria-hidden="true" /></button>}</td>}
        </tr>; })}</tbody>
      </Table>
      {canEdit && <div className="cert-actions">
        <button className="btn primary" disabled={busy || dirty || session?.status !== 'Delivered' || !pendingCerts} onClick={generate}><Award size={15} aria-hidden="true" /> {busy ? 'Working…' : <T>Generate certificates</T>}</button>
        <span className="muted">{session?.status !== 'Delivered' ? 'Certificates can be issued once the session is marked Delivered.' : dirty ? 'Save the sheet first.' : pendingCerts ? `${plural(pendingCerts, 'certificate')} to issue for attendees marked attended.` : 'Everyone marked attended has a certificate.'}</span>
        {sessionCerts.length > 0 && <button className="btn" disabled={busy} onClick={async () => { setBusy(true); const files = await Promise.all(sessionCerts.map(async c => ({ name: `${c.number}.pdf`, blob: await pdfFor(c) }))); downloadBlob(await zipBlobs(files), `${sessionId}-certificates.zip`); setBusy(false); }}><Download size={14} aria-hidden="true" /> Download all ({sessionCerts.length}, ZIP)</button>}
      </div>}
    </Section>
    <CertificateRegister />
  </>;
}

function TypeRow({ existing, onAdd }: { existing: string[]; onAdd: (r: Row) => void }) {
  const hub = useHub();
  const empty = { name: '', staff_number: '', ward_id: '', role: STAFF_ROLES[0], attended: true };
  const [f, setF] = useState(empty);
  const [msg, setMsg] = useState<string[]>([]);
  function add() {
    const w = hub.ward(f.ward_id);
    const res = validateAttendees([[f.name, f.staff_number, w ? hub.hospital(w.hospital_id)!.code : '', w ? `${w.name}${w.department_id ? ` (${hub.department(w.department_id)!.name})` : ''}` : '', f.role, f.attended ? 'yes' : 'no']], { wards: hub.wards, hospitals: hub.hospitals, departments: hub.departments, existing });
    if (res.errors.length) { setMsg(res.errors[0].messages); return; }
    onAdd({ ...res.valid[0], ward_id: f.ward_id || null }); setF(empty); setMsg([]);
  }
  return <form className="type-row" onSubmit={e => { e.preventDefault(); add(); }} noValidate>
    <label>Name<input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Fictional name" /></label>
    <label>Staff number<input value={f.staff_number} onChange={e => setF({ ...f, staff_number: e.target.value })} placeholder="N12345" /></label>
    <label>Ward<select value={f.ward_id} onChange={e => setF({ ...f, ward_id: e.target.value })}><option value="">Choose…</option><WardOptions wards={hub.scopedWards} /></select></label>
    <label>Role<select value={f.role} onChange={e => setF({ ...f, role: e.target.value })}>{STAFF_ROLES.map(r => <option key={r}>{r}</option>)}</select></label>
    <label className="check"><input type="checkbox" checked={f.attended} onChange={e => setF({ ...f, attended: e.target.checked })} /> Attended</label>
    <button className="btn" type="submit"><Plus size={14} aria-hidden="true" /> <T>Add</T></button>
    {msg.length > 0 && <div className="form-msg error span-all" role="alert">{msg.join(' ')}</div>}
  </form>;
}

function ImportPreview({ result, onAdd, onCancel }: { result: ImportResult; onAdd: () => void; onCancel: () => void }) {
  return <div className="import-preview" role="region" aria-label="Import check">
    <p><strong>{plural(result.valid.length, 'row')} ready</strong>{result.errors.length > 0 && <>, <strong className="critical-text">{plural(result.errors.length, 'row')} with problems</strong> (not added)</>}.</p>
    {result.errors.length > 0 && <div className="table-wrap"><table className="data-table compact"><thead><tr><th>Row</th><th>Problem</th><th>Content</th></tr></thead><tbody>
      {result.errors.map(e => <tr key={e.row}><td>{e.row}</td><td className="critical-text">{e.messages.join(' ')}</td><td className="muted">{e.raw}</td></tr>)}</tbody></table></div>}
    <div className="btn-row"><button className="btn" onClick={onCancel}><T>Cancel</T></button><button className="btn primary" disabled={!result.valid.length} onClick={onAdd}>Add {plural(result.valid.length, 'valid row')}</button></div>
  </div>;
}

export function CertificateRegister() {
  const hub = useHub();
  const tr = useTraining();
  const [q, setQ] = useState('');
  const [source, setSource] = useState('');
  const sessionScope = new Set(useScopedSessions().map(s => s.id));
  const rows = tr.certificates.filter(c => (c.session_id ? sessionScope.has(c.session_id) : hub.inScope(c.ward_id)) && (!source || c.source === source) && `${c.number} ${c.trainee} ${c.title} ${c.staff_number ?? ''}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.number.localeCompare(a.number));
  const shown = rows.slice(0, 100);
  return <Section title="Certificate register" meta={`${plural(rows.length, 'certificate')} · sessions and exams${rows.length > 100 ? ' · newest 100 shown, search to narrow' : ''}`}>
    <div className="toolbar"><label className="search"><Search size={15} aria-hidden="true" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search number, name or title" aria-label="Search certificates" /></label>
      <div className="filters" role="group" aria-label="Filter by source">{[['', 'All'], ['session', 'Sessions'], ['exam', 'Exams']].map(([v, l]) => <button key={v} className={source === v ? 'chip active' : 'chip'} aria-pressed={source === v} onClick={() => setSource(v)}>{l}</button>)}</div></div>
    <Table empty={!rows.length} className="sticky-first"><thead><tr><th><T>Certificate number</T></th><th><T>Name</T></th><th><T>Session or course</T></th><th><T>Source</T></th><th><T>Ward</T></th><th><T>Issued</T></th><th><span className="sr-only">Actions</span></th></tr></thead>
      <tbody>{shown.map(c => <tr key={c.number}><td className="mono"><strong>{c.number}</strong></td><td>{c.trainee}</td><td>{c.title}</td><td><Status value={c.source === 'exam' ? 'Exam' : 'Session'} /></td><td>{c.ward_id ? <WardCell id={c.ward_id} /> : '—'}</td><td className="nowrap">{fmtDate(c.issued_on)}</td>
        <td className="nowrap row-actions"><button className="icon-btn" aria-label={`Download certificate ${c.number}`} onClick={async () => downloadBlob(await certificatePdf({ number: c.number, name: c.trainee, title: c.title, date: fmtDate(c.issued_on), detail: c.score != null && c.source === 'exam' ? `exam score ${c.score}%` : undefined, verifyUrl: `${window.location.origin}/verify/${c.number}` }), `${c.number}.pdf`)}><Download size={14} aria-hidden="true" /></button><Link className="text-link" to={`/verify/${c.number}`}>Verify</Link></td></tr>)}</tbody></Table>
  </Section>;
}
