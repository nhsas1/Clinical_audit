import { useMemo, useState } from 'react';
import { ExternalLink, FileText, Image, Pencil, Plus, Presentation, Search, Upload, Users } from 'lucide-react';
import { useHub } from '../../lib/store';
import { useAuth } from '../../lib/auth';
import { T } from '../../lib/content';
import { useTraining } from '../../lib/trainingStore';
import { ACTIVITY_KINDS, type ActivityKind, type TrainingActivity } from '../../lib/training';
import { fmtDate, plural, showToast } from '../../lib/utils';
import { Empty, Loading, Modal, Section } from '../../components/ui';

const ICON: Record<ActivityKind, React.ElementType> = { Presentation, Workshop: Users, Poster: Image };
const ACCEPT: Record<ActivityKind, string> = { Presentation: '.pptx,.ppt,.pdf', Workshop: '.pdf,.docx,.pptx', Poster: '.pdf,.png,.jpg,.jpeg' };
const MAX_MB = 25;

export function ActivityTab() {
  const hub = useHub();
  const auth = useAuth();
  const tr = useTraining();
  const canEdit = auth.can('audit.write');
  const [kind, setKind] = useState<ActivityKind>('Presentation');
  const [q, setQ] = useState('');
  const [year, setYear] = useState('');
  const [edit, setEdit] = useState<TrainingActivity | null>(null);
  const years = useMemo(() => [...new Set(tr.activity.map(a => a.year))].sort((a, b) => b - a), [tr.activity]);
  const rows = tr.activity.filter(a => a.kind === kind && (!year || a.year === Number(year)) && (!hub.scope.hospital || a.hospital_id === hub.scope.hospital)
    && `${a.title} ${a.presenter} ${a.topic ?? ''} ${a.description}`.toLowerCase().includes(q.toLowerCase()));
  const session = (id: string | null) => (id ? tr.sessions.find(s => s.id === id) : undefined);
  async function open(a: TrainingActivity) {
    const url = await tr.fileUrl(a.file_path ?? '');
    if (url) window.open(url, '_blank', 'noopener'); else showToast(a.file_path ? 'The file link could not be created.' : 'No file is attached yet in this sample.');
  }
  if (tr.loading) return <Loading />;
  return <>
    <div className="toolbar">
      <div className="seg" role="group" aria-label="Activity type">{ACTIVITY_KINDS.map(k => { const Icon = ICON[k]; const n = tr.activity.filter(a => a.kind === k).length; return <button key={k} className={kind === k ? 'seg-btn active' : 'seg-btn'} aria-pressed={kind === k} onClick={() => setKind(k)}><Icon size={13} aria-hidden="true" /> <T>{`${k}s`}</T> <span className="count">{n}</span></button>; })}</div>
      {canEdit && <button className="btn primary" onClick={() => setEdit({ id: '', kind, title: '', year: 2026, date: new Date().toISOString().slice(0, 10), presenter: '', hospital_id: hub.scope.hospital || null, session_id: null, topic: null, file_name: null, description: '' })}><Upload size={15} aria-hidden="true" /> Add {kind.toLowerCase()}</button>}
    </div>
    <Section title={`${kind}s`} meta={`${plural(rows.length, 'item')}${hub.scope.hospital ? ` · ${hub.hospital(hub.scope.hospital)?.name}` : ''}`} action={<div className="inline-filters">
      <label className="search"><Search size={15} aria-hidden="true" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search title, presenter or topic" aria-label="Search training activity" /></label>
      <label className="field-inline"><span><T>Year</T></span><select value={year} onChange={e => setYear(e.target.value)}><option value="">All years</option>{years.map(y => <option key={y}>{y}</option>)}</select></label></div>}>
      {!rows.length ? <Empty title={`No ${kind.toLowerCase()}s found`} hint="Change the search, year or hospital filter." /> :
        <div className="activity-grid">{rows.map(a => { const Icon = ICON[a.kind]; const se = session(a.session_id); return <article className="activity-card" key={a.id}>
          <div className="activity-top"><span className="tool-icon"><Icon size={16} aria-hidden="true" /></span><span className="muted">{a.id} · {fmtDate(a.date)}</span></div>
          <h3>{a.title}</h3>
          <p className="muted">{a.description}</p>
          <dl className="activity-meta"><div><dt>Presenter</dt><dd>{a.presenter}</dd></div><div><dt>Hospital</dt><dd>{a.hospital_id ? hub.hospital(a.hospital_id)?.short : '—'}</dd></div><div><dt>Session</dt><dd>{se ? `${se.id} · ${se.title}` : 'Not linked'}</dd></div><div><dt>File</dt><dd className="file-name"><FileText size={12} aria-hidden="true" /> {a.file_name ?? 'None'}</dd></div></dl>
          <div className="tool-actions"><button className="btn small" onClick={() => open(a)} aria-label={`Open file for ${a.title}`}><ExternalLink size={13} aria-hidden="true" /> <T>Open file</T></button>{canEdit && <button className="btn small" onClick={() => setEdit(a)} aria-label={`Edit ${a.title}`}><Pencil size={13} aria-hidden="true" /> <T>Edit</T></button>}</div>
        </article>; })}</div>}
    </Section>
    {edit && <ActivityForm item={edit} onClose={() => setEdit(null)} />}
  </>;
}

function ActivityForm({ item, onClose }: { item: TrainingActivity; onClose: () => void }) {
  const hub = useHub();
  const tr = useTraining();
  const [f, setF] = useState(item);
  const [file, setFile] = useState<File | null>(null);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const errors: string[] = [];
  if (f.title.trim().length < 2) errors.push('Enter a title.');
  if (!f.presenter.trim()) errors.push('Enter the presenter.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date)) errors.push('Choose a date.');
  if (file && file.size > MAX_MB * 1024 * 1024) errors.push(`The file is larger than ${MAX_MB} MB.`);
  if (file && !ACCEPT[f.kind].split(',').some(ext => file.name.toLowerCase().endsWith(ext))) errors.push(`Use one of: ${ACCEPT[f.kind]}.`);
  const sessions = tr.sessions.filter(s => s.status === 'Delivered' || s.status === 'Planned').sort((a, b) => b.date.localeCompare(a.date));
  async function save() {
    setTried(true); if (errors.length) return;
    setBusy(true);
    const prefix = { Presentation: 'PR', Workshop: 'WS', Poster: 'PO' }[f.kind];
    const id = f.id || `TA-${prefix}${String(tr.activity.filter(a => a.id.startsWith(`TA-${prefix}`)).length + 1).padStart(2, '0')}`;
    const err = await tr.saveActivity({ ...f, id, title: f.title.trim(), presenter: f.presenter.trim(), year: Number(f.date.slice(0, 4)), file_name: file?.name ?? f.file_name }, file);
    setBusy(false);
    if (err) { showToast(err); return; }
    showToast(`${id} saved${tr.mode === 'sample' ? ' (sample mode: file not uploaded)' : ''}.`); onClose();
  }
  return <Modal label={item.id ? `Edit ${item.id}` : `Add a ${f.kind.toLowerCase()}`} eyebrow="TRAINING ACTIVITY" onClose={onClose}>
    <form className="form-grid" onSubmit={e => { e.preventDefault(); void save(); }} noValidate>
      <label className="span-2">Title<input value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></label>
      <label>Type<select value={f.kind} onChange={e => setF({ ...f, kind: e.target.value as ActivityKind })} disabled={Boolean(item.id)}>{ACTIVITY_KINDS.map(k => <option key={k}>{k}</option>)}</select></label>
      <label>Date<input type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></label>
      <label>Presenter<input value={f.presenter} onChange={e => setF({ ...f, presenter: e.target.value })} placeholder="e.g. Educator 3" /></label>
      <label>Hospital<select value={f.hospital_id ?? ''} onChange={e => setF({ ...f, hospital_id: e.target.value || null })}><option value="">Not specific</option>{hub.hospitals.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}</select></label>
      <label className="span-2">Linked session<select value={f.session_id ?? ''} onChange={e => setF({ ...f, session_id: e.target.value || null })}><option value="">Not linked</option>{sessions.map(s => <option key={s.id} value={s.id}>{s.id} · {fmtDate(s.date)} · {s.title}</option>)}</select></label>
      <label className="span-2">Description<textarea rows={2} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></label>
      <label className="span-2">File ({ACCEPT[f.kind]}, up to {MAX_MB} MB){f.file_name && !file && <span className="muted"> · current: {f.file_name}</span>}<input type="file" accept={ACCEPT[f.kind]} onChange={e => setFile(e.target.files?.[0] ?? null)} /></label>
      {tried && errors.length > 0 && <div className="form-msg error span-2" role="alert">{errors.join(' ')}</div>}
      <div className="modal-actions span-2"><button type="button" className="btn" onClick={onClose}><T>Cancel</T></button><button type="submit" className="btn primary" disabled={busy}><Plus size={14} aria-hidden="true" /> {busy ? 'Saving…' : 'Save'}</button></div>
    </form>
  </Modal>;
}
