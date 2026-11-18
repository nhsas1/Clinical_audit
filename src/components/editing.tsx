import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { History, Pencil, RotateCcw, Save, X } from 'lucide-react';
import { useContent, type HistoryEntry } from '../lib/content';
import { fmtDate, plural, showToast } from '../lib/utils';
import { Modal, useEscape } from './ui';

/** "Edit page" toggle for admins, in the top bar. */
export function EditToggle() {
  const c = useContent();
  const [confirm, setConfirm] = useState(false);
  if (!c.canEdit) return null;
  const n = Object.keys(c.drafts).length;
  const toggle = () => { if (c.editMode && n) setConfirm(true); else c.setEditMode(!c.editMode); };
  return <>
    <button className={c.editMode ? 'btn small edit-toggle on' : 'btn small edit-toggle'} aria-pressed={c.editMode} onClick={toggle}><Pencil size={13} aria-hidden="true" /> {c.editMode ? 'Done editing' : 'Edit page'}</button>
    {confirm && <UnsavedPrompt count={n} onClose={() => setConfirm(false)} after={() => c.setEditMode(false)} />}
  </>;
}

/** In-app warning about unsaved changes (instead of a browser dialog). */
export function UnsavedPrompt({ count, onClose, after }: { count: number; onClose: () => void; after: () => void }) {
  const c = useContent();
  return <Modal label="Unsaved text changes" eyebrow="EDIT PAGE" onClose={onClose}>
    <p className="modal-text">You have {plural(count, 'unsaved change')}. Save them before leaving edit mode, or discard them.</p>
    <div className="modal-actions">
      <button className="btn" onClick={onClose}>Keep editing</button>
      <button className="btn" onClick={() => { c.discard(); onClose(); after(); showToast('Changes discarded.'); }}>Discard</button>
      <button className="btn primary" disabled={c.saving} onClick={async () => { const err = await c.save(); if (err) { showToast(err); return; } onClose(); after(); showToast(`Saved ${plural(count, 'change')}.`); }}><Save size={14} aria-hidden="true" /> Save and finish</button>
    </div>
  </Modal>;
}

/** Bar under the header: edit-mode help, unsaved count, save and discard. */
export function EditBar() {
  const c = useContent();
  const n = Object.keys(c.drafts).length;
  if (!c.canEdit) return null;
  if (!c.editMode) {
    if (!n) return null;
    return <div className="edit-bar pending" role="status"><Pencil size={14} aria-hidden="true" /><span>{plural(n, 'unsaved text change')} from your last edit session.</span><button className="btn small" onClick={() => c.setEditMode(true)}>Review</button></div>;
  }
  async function save() {
    const err = await c.save();
    showToast(err ?? `Saved ${plural(n, 'change')}.`);
  }
  return <div className="edit-bar" role="region" aria-label="Edit page mode">
    <Pencil size={14} aria-hidden="true" />
    <span><strong>Edit page mode.</strong> Select any outlined text to change it. {n ? <em className="unsaved">{plural(n, 'unsaved change')}, kept when you switch pages.</em> : 'No unsaved changes.'}</span>
    <div className="edit-bar-actions">
      <button className="btn small" disabled={!n || c.saving} onClick={() => { c.discard(); showToast('Changes discarded.'); }}>Discard</button>
      <button className="btn small primary" disabled={!n || c.saving} onClick={save}><Save size={13} aria-hidden="true" /> {c.saving ? 'Saving…' : 'Save changes'}</button>
    </div>
  </div>;
}

/** Popover editor for one text. */
export function TextEditor() {
  const c = useContent();
  const e = c.editing;
  const [value, setValue] = useState('');
  const [hist, setHist] = useState<HistoryEntry[] | null>(null);
  const [showHist, setShowHist] = useState(false);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const box = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  useEscape(Boolean(e), c.close);

  useEffect(() => {
    if (!e) return;
    setValue(c.text(e.key, e.def)); setHist(null); setShowHist(false);
    setTimeout(() => area.current?.focus(), 0);
  }, [e?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    if (!e || !box.current) return;
    const w = box.current.offsetWidth, h = box.current.offsetHeight;
    const left = Math.max(8, Math.min(e.x, window.innerWidth - w - 8));
    const top = e.y + 6 + h > window.innerHeight ? Math.max(8, e.y - h - 34) : e.y + 6;
    setPos({ left, top });
  }, [e, showHist, hist]);

  if (!e) return null;
  const trimmed = value.trim();
  const apply = () => { if (!trimmed) return; c.setDraft(e.key, e.page, trimmed); c.close(); };
  const reset = () => { c.setDraft(e.key, e.page, null); c.close(); };
  const loadHistory = async () => { setShowHist(s => !s); if (!hist) setHist(await c.history(e.key)); };
  const changed = c.isOverridden(e.key) || c.hasDraft(e.key);

  return <div className="text-editor" ref={box} style={pos} role="dialog" aria-label="Edit text" onMouseDown={ev => ev.stopPropagation()}>
    <div className="text-editor-head"><span className="eyebrow">EDIT TEXT</span><code>{e.key}</code><button className="icon-btn" onClick={c.close} aria-label="Close text editor"><X size={15} aria-hidden="true" /></button></div>
    <textarea ref={area} rows={Math.min(5, Math.max(2, Math.ceil(value.length / 42)))} maxLength={2000} value={value} onChange={ev => setValue(ev.target.value)}
      onKeyDown={ev => { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); apply(); } }} aria-label="Text" />
    <div className="text-editor-default"><span>Default:</span> {e.def}</div>
    {!trimmed && <div className="form-msg error" role="alert">Text cannot be empty. Use “Reset to default” instead.</div>}
    <div className="text-editor-actions">
      <button className="btn small" onClick={loadHistory} aria-expanded={showHist}><History size={13} aria-hidden="true" /> History</button>
      <button className="btn small" onClick={reset} disabled={!changed}><RotateCcw size={13} aria-hidden="true" /> Reset to default</button>
      <button className="btn small primary" onClick={apply} disabled={!trimmed}>Apply</button>
    </div>
    {showHist && <div className="text-editor-history">{hist == null ? <span className="muted">Loading history…</span> : !hist.length ? <span className="muted">No saved versions yet.</span> :
      <ol>{hist.map((h, i) => <li key={i}><span className="muted">{fmtDate(h.at)} · {h.action === 'reset' ? 'Reset to default' : 'Saved'}</span>{h.value != null && <><q>{h.value}</q><button className="link-btn" onClick={() => setValue(h.value!)}>Use this</button></>}</li>)}</ol>}</div>}
    <p className="muted text-editor-note">Apply keeps the change as a draft. Use “Save changes” in the edit bar to publish.</p>
  </div>;
}
