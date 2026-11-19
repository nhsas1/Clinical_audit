import { useMemo, useState } from 'react';
import { Copy, LayoutGrid, Pencil, Plus, Table2, Trash2 } from 'lucide-react';
import { useHub } from '../../lib/store';
import { useAuth } from '../../lib/auth';
import { T } from '../../lib/content';
import { useTraining } from '../../lib/trainingStore';
import { SESSION_STATUSES, SESSION_TYPES, TARGET_GROUPS, type TrainingSession } from '../../lib/training';
import { MONTHS, fmtDate, plural, showToast } from '../../lib/utils';
import { Loading, Modal, Section, Status, Table } from '../../components/ui';
import { WardOptions } from '../../components/hierarchy';
import { useScopedSessions } from './TrainingLibrary';

const blank = (year: number, hospital: string): TrainingSession => ({ id: '', title: '', type: 'Lecture', topic: null, target_group: TARGET_GROUPS[0], hospital_id: hospital, ward_id: null, date: `${year}-01-15`, trainer: '', duration_minutes: 60, venue: '', status: 'Planned', capacity: 15 });

export function YearlyPlan() {
  const hub = useHub();
  const auth = useAuth();
  const tr = useTraining();
  const scoped = useScopedSessions();
  const canEdit = auth.can('audit.write');
  const years = useMemo(() => [...new Set([2026, 2027, ...tr.sessions.map(s => Number(s.date.slice(0, 4)))])].sort(), [tr.sessions]);
  const [year, setYear] = useState(2026);
  const [view, setView] = useState<'table' | 'grid'>('table');
  const [edit, setEdit] = useState<TrainingSession | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<TrainingSession | null>(null);
  const rows = scoped.filter(s => s.date.startsWith(String(year))).sort((a, b) => a.date.localeCompare(b.date));
  const where = (s: TrainingSession) => s.ward_id ? `${hub.wardName(s.ward_id)} · ${hub.wardContext(s.ward_id)}` : hub.hospital(s.hospital_id)?.name ?? '—';

  function nextCode(y: number) {
    const max = tr.sessions.filter(s => s.id.startsWith(`TS-${y}-`)).reduce((n, s) => Math.max(n, Number(s.id.slice(8)) || 0), 0);
    return `TS-${y}-${String(max + 1).padStart(3, '0')}`;
  }
  const startNew = () => setEdit(blank(year, hub.scope.hospital || hub.hospitals[0]?.id || ''));
  const duplicate = (s: TrainingSession) => setEdit({ ...s, id: '', dbId: undefined, status: 'Planned', title: `${s.title} (copy)` });

  if (tr.loading) return <Loading />;
  return <>
    <div className="toolbar">
      <div className="inline-filters">
        <label className="field-inline"><span><T>Year</T></span><select value={year} onChange={e => setYear(Number(e.target.value))}>{years.map(y => <option key={y}>{y}</option>)}</select></label>
        <div className="seg" role="group" aria-label="View">
          <button className={view === 'table' ? 'seg-btn active' : 'seg-btn'} aria-pressed={view === 'table'} onClick={() => setView('table')}><Table2 size={13} aria-hidden="true" /> <T>Table</T></button>
          <button className={view === 'grid' ? 'seg-btn active' : 'seg-btn'} aria-pressed={view === 'grid'} onClick={() => setView('grid')}><LayoutGrid size={13} aria-hidden="true" /> <T>Month grid</T></button>
        </div>
      </div>
      {canEdit && <button className="btn primary" onClick={startNew}><Plus size={15} aria-hidden="true" /> <T>Add session</T></button>}
    </div>
    {view === 'table' ? <Section title={`Training plan ${year}`} meta={`${plural(rows.length, 'session')} · ${hub.scopeLabel}`}>
      <Table empty={!rows.length} emptyTitle="No sessions planned" emptyHint="Add a session or change the year or hospital filter." className="sticky-first"><thead><tr><th><T>Date</T></th><th><T>Title</T></th><th><T>Type</T></th><th><T>Target group</T></th><th><T>Hospital and ward</T></th><th><T>Trainer</T></th><th><T>Duration</T></th><th><T>Venue</T></th><th><T>Status</T></th>{canEdit && <th><span className="sr-only">Actions</span></th>}</tr></thead>
        <tbody>{rows.map(s => <tr key={s.id}><td className="nowrap">{fmtDate(s.date)}<small className="muted block">{s.id}</small></td><td><strong>{s.title}</strong></td><td>{s.type}</td><td>{s.target_group}</td><td>{where(s)}</td><td>{s.trainer}</td><td className="nowrap">{s.duration_minutes} min</td><td>{s.venue}</td><td><Status value={s.status} /></td>
          {canEdit && <td className="nowrap row-actions"><button className="icon-btn" aria-label={`Edit ${s.title}, ${fmtDate(s.date)}`} onClick={() => setEdit(s)}><Pencil size={14} aria-hidden="true" /></button><button className="icon-btn" aria-label={`Duplicate ${s.title}`} onClick={() => duplicate(s)}><Copy size={14} aria-hidden="true" /></button><button className="icon-btn danger" aria-label={`Delete ${s.title}, ${fmtDate(s.date)}`} onClick={() => setConfirmDelete(s)}><Trash2 size={14} aria-hidden="true" /></button></td>}
        </tr>)}</tbody></Table>
    </Section> :
      <div className="month-grid">{MONTHS.map((m, i) => { const inMonth = rows.filter(s => new Date(s.date).getUTCMonth() === i); return <section className="month-card" key={m} aria-label={`${m} ${year}: ${plural(inMonth.length, 'session')}`}>
        <h3>{m} <span className="muted">{inMonth.length}</span></h3>
        {inMonth.length ? <ul>{inMonth.map(s => <li key={s.id} className={'month-item ' + s.status.toLowerCase()}>
          <button className="month-link" onClick={() => canEdit ? setEdit(s) : undefined} disabled={!canEdit} aria-label={`${s.title}, ${fmtDate(s.date)}, ${s.status}${canEdit ? ', edit' : ''}`}><strong>{new Date(s.date).getUTCDate()} · {s.title}</strong><span>{s.type} · {s.ward_id ? hub.wardName(s.ward_id) : hub.hospital(s.hospital_id)?.short}</span></button></li>)}</ul> : <p className="muted">—</p>}
      </section>; })}</div>}
    {edit && <SessionForm session={edit} onClose={() => setEdit(null)} onSave={async s => {
      const isNew = !s.id;
      const toSave = isNew ? { ...s, id: nextCode(Number(s.date.slice(0, 4))) } : s;
      const err = await tr.saveSession(toSave);
      if (err) { showToast(err); return; }
      setEdit(null); showToast(`${toSave.id} ${isNew ? 'added' : 'saved'}${tr.mode === 'sample' ? ' (sample mode, not stored)' : ''}.`);
    }} />}
    {confirmDelete && <Modal label="Delete this session?" eyebrow="TRAINING PLAN" onClose={() => setConfirmDelete(null)}>
      <p className="modal-text"><strong>{confirmDelete.title}</strong>, {fmtDate(confirmDelete.date)} ({confirmDelete.id}). Its attendee sheet is deleted too. Issued certificates stay in the register.</p>
      <div className="modal-actions"><button className="btn" onClick={() => setConfirmDelete(null)}><T>Cancel</T></button><button className="btn danger" onClick={async () => { const err = await tr.deleteSession(confirmDelete.id); showToast(err ?? `${confirmDelete.id} deleted.`); setConfirmDelete(null); }}><Trash2 size={14} aria-hidden="true" /> <T>Delete session</T></button></div>
    </Modal>}
  </>;
}

function SessionForm({ session, onClose, onSave }: { session: TrainingSession; onClose: () => void; onSave: (s: TrainingSession) => void }) {
  const hub = useHub();
  const [f, setF] = useState(session);
  const [tried, setTried] = useState(false);
  const set = <K extends keyof TrainingSession>(k: K, v: TrainingSession[K]) => setF(x => ({ ...x, [k]: v }));
  const wards = hub.wards.filter(w => w.hospital_id === f.hospital_id);
  const errors: Partial<Record<keyof TrainingSession, string>> = {};
  if (f.title.trim().length < 2) errors.title = 'Enter a title.';
  if (!f.hospital_id) errors.hospital_id = 'Choose a hospital.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date)) errors.date = 'Choose a date.';
  if (!f.trainer.trim()) errors.trainer = 'Enter the trainer.';
  if (!f.venue.trim()) errors.venue = 'Enter the venue.';
  if (!(f.duration_minutes >= 5 && f.duration_minutes <= 600)) errors.duration_minutes = 'Between 5 and 600 minutes.';
  if (f.capacity != null && !(f.capacity >= 1 && f.capacity <= 500)) errors.capacity = 'Between 1 and 500.';
  const err = (k: keyof TrainingSession) => tried && errors[k] ? <span className="field-error">{errors[k]}</span> : null;
  return <Modal label={session.id ? `Edit ${session.id}` : 'Add a training session'} eyebrow="TRAINING PLAN" onClose={onClose}>
    <form className="form-grid" onSubmit={e => { e.preventDefault(); setTried(true); if (!Object.keys(errors).length) onSave({ ...f, title: f.title.trim(), trainer: f.trainer.trim(), venue: f.venue.trim() }); }} noValidate>
      <label className="span-2">Title<input value={f.title} onChange={e => set('title', e.target.value)} aria-invalid={tried && !!errors.title} />{err('title')}</label>
      <label>Type<select value={f.type} onChange={e => set('type', e.target.value as TrainingSession['type'])}>{SESSION_TYPES.map(t => <option key={t}>{t}</option>)}</select></label>
      <label>Target group<select value={f.target_group} onChange={e => set('target_group', e.target.value)}>{TARGET_GROUPS.map(t => <option key={t}>{t}</option>)}</select></label>
      <label>Hospital<select value={f.hospital_id} onChange={e => setF(x => ({ ...x, hospital_id: e.target.value, ward_id: null }))}>{hub.hospitals.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}</select>{err('hospital_id')}</label>
      <label>Ward<select value={f.ward_id ?? ''} onChange={e => set('ward_id', e.target.value || null)}><option value="">Hospital-wide</option><WardOptions wards={wards} /></select></label>
      <label>Date<input type="date" value={f.date} onChange={e => set('date', e.target.value)} aria-invalid={tried && !!errors.date} />{err('date')}</label>
      <label>Status<select value={f.status} onChange={e => set('status', e.target.value as TrainingSession['status'])}>{SESSION_STATUSES.map(t => <option key={t}>{t}</option>)}</select></label>
      <label>Trainer<input value={f.trainer} onChange={e => set('trainer', e.target.value)} placeholder="e.g. Educator 2" aria-invalid={tried && !!errors.trainer} />{err('trainer')}</label>
      <label>Venue<input value={f.venue} onChange={e => set('venue', e.target.value)} placeholder="e.g. Skills lab" aria-invalid={tried && !!errors.venue} />{err('venue')}</label>
      <label>Duration (minutes)<input type="number" min={5} max={600} value={f.duration_minutes} onChange={e => set('duration_minutes', Number(e.target.value))} />{err('duration_minutes')}</label>
      <label>Places<input type="number" min={1} max={500} value={f.capacity ?? ''} onChange={e => set('capacity', e.target.value ? Number(e.target.value) : null)} />{err('capacity')}</label>
      {tried && Object.keys(errors).length > 0 && <div className="form-msg error span-2" role="alert">Please fix {plural(Object.keys(errors).length, 'field')} marked above.</div>}
      <div className="modal-actions span-2"><button type="button" className="btn" onClick={onClose}><T>Cancel</T></button><button type="submit" className="btn primary"><T>Save session</T></button></div>
    </form>
  </Modal>;
}
