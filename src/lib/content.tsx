// Editable page text (Part B6).
//
// <T>Default text</T> renders the saved text for its key, or the default.
// The key is `${page}.${slug(default)}` unless `k` is given, so wrapping a
// string is all a page needs. Only texts an admin changed are stored
// (Supabase table site_content; in sample mode this browser's storage).
//
// Edit mode: a signed-in admin turns on "Edit page" and clicks any outlined
// text. Changes are drafts until "Save changes"; drafts survive navigation and
// reloads (kept in local storage) and are flagged in the interface, never with
// a browser dialog.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { supabase } from './supabase';
import { useAuth } from './auth';

export const slugKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'text';
export const contentKey = (page: string, text: string) => `${page}.${slugKey(text)}`;

type Draft = { page: string; value: string | null }; // null = reset to default
export type HistoryEntry = { value: string | null; action: 'set' | 'reset'; at: string; by?: string | null };
type Editing = { key: string; page: string; def: string; x: number; y: number };

type ContentCtx = {
  text: (key: string, def: string) => string;
  isOverridden: (key: string) => boolean;
  hasDraft: (key: string) => boolean;
  canEdit: boolean;
  editMode: boolean;
  setEditMode: (on: boolean) => void;
  drafts: Record<string, Draft>;
  setDraft: (key: string, page: string, value: string | null) => void;
  discard: () => void;
  save: () => Promise<string | null>;
  saving: boolean;
  history: (key: string) => Promise<HistoryEntry[]>;
  editing: Editing | null;
  open: (e: Editing) => void;
  close: () => void;
  defaults: Map<string, string>;
};

const DRAFTS_KEY = 'nah.content.drafts';
const LOCAL_KEY = 'nah.content.sample';
const LOCAL_HISTORY = 'nah.content.sample-history';
const read = <T,>(k: string, fb: T): T => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) as T : fb; } catch { return fb; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } };

const Ctx = createContext<ContentCtx | null>(null);
const PageCtx = createContext('shell');

export function ContentPage({ name, children }: { name: string; children: ReactNode }) {
  return <PageCtx.Provider value={name}>{children}</PageCtx.Provider>;
}

export function ContentProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const remote = auth.enabled && Boolean(supabase);
  const canEdit = auth.can('content.edit');
  const [overrides, setOverrides] = useState<Record<string, string>>(() => (remote ? {} : read(LOCAL_KEY, {})));
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => read(DRAFTS_KEY, {}));
  const [editMode, setEditModeState] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [saving, setSaving] = useState(false);
  const [defaults] = useState(() => new Map<string, string>());

  const load = useCallback(async () => {
    if (!remote) { setOverrides(read(LOCAL_KEY, {})); return; }
    const { data } = await supabase!.from('site_content').select('key,value');
    setOverrides(Object.fromEntries((data ?? []).map(r => [r.key as string, r.value as string])));
  }, [remote]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { write(DRAFTS_KEY, drafts); }, [drafts]);
  useEffect(() => { if (!canEdit) { setEditModeState(false); setEditing(null); } }, [canEdit]);

  const value = useMemo<ContentCtx>(() => ({
    text: (key, def) => { defaults.set(key, def); const d = drafts[key]; if (d) return d.value ?? def; return overrides[key] ?? def; },
    isOverridden: key => key in overrides,
    hasDraft: key => key in drafts,
    canEdit, editMode, editing, saving, drafts, defaults,
    setEditMode: on => { setEditModeState(on && canEdit); if (!on) setEditing(null); },
    setDraft: (key, page, v) => setDrafts(d => {
      const next = { ...d };
      const saved = overrides[key] ?? null;
      const def = defaults.get(key);
      // A draft equal to what is already saved is no change at all.
      const normalised = v != null && v === def ? null : v;
      if (normalised === saved) delete next[key]; else next[key] = { page, value: normalised };
      return next;
    }),
    discard: () => { setDrafts({}); setEditing(null); },
    save: async () => {
      const entries = Object.entries(drafts);
      if (!entries.length) return null;
      setSaving(true);
      try {
        if (!remote) {
          const next = { ...overrides };
          const hist = read<Record<string, HistoryEntry[]>>(LOCAL_HISTORY, {});
          for (const [key, d] of entries) {
            if (d.value == null) delete next[key]; else next[key] = d.value;
            hist[key] = [{ value: d.value, action: (d.value == null ? 'reset' : 'set') as HistoryEntry['action'], at: new Date().toISOString() }, ...(hist[key] ?? [])].slice(0, 20);
          }
          write(LOCAL_KEY, next); write(LOCAL_HISTORY, hist); setOverrides(next); setDrafts({});
          return null;
        }
        const upserts = entries.filter(([, d]) => d.value != null).map(([key, d]) => ({ key, page: d.page, value: d.value! }));
        const resets = entries.filter(([, d]) => d.value == null).map(([key]) => key);
        if (upserts.length) { const { error } = await supabase!.from('site_content').upsert(upserts); if (error) return 'Changes could not be saved. Only admins can edit page text.'; }
        if (resets.length) { const { error } = await supabase!.from('site_content').delete().in('key', resets); if (error) return 'Some texts could not be reset. Only admins can edit page text.'; }
        setDrafts({});
        await load();
        return null;
      } finally { setSaving(false); }
    },
    history: async key => {
      if (!remote) return read<Record<string, HistoryEntry[]>>(LOCAL_HISTORY, {})[key] ?? [];
      const { data } = await supabase!.from('site_content_history').select('value,action,changed_at,changed_by').eq('key', key).order('changed_at', { ascending: false }).limit(10);
      return (data ?? []).map(r => ({ value: r.value, action: r.action, at: r.changed_at, by: r.changed_by }));
    },
    open: e => setEditing(e),
    close: () => setEditing(null),
  }), [canEdit, editMode, editing, saving, drafts, overrides, defaults, remote, load]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useContent() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useContent must be used inside ContentProvider');
  return ctx;
}

/** Editable text. Children must be a plain string (the default). */
export function T({ children, k, page }: { children: string; k?: string; page?: string }) {
  const c = useContent();
  const ctxPage = useContext(PageCtx);
  const pg = page ?? ctxPage;
  const key = k ?? contentKey(pg, children);
  const value = c.text(key, children);
  if (!c.editMode) return <>{value}</>;
  const openEditor = (e: MouseEvent | KeyboardEvent) => {
    e.preventDefault(); e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    c.open({ key, page: pg, def: children, x: r.left, y: r.bottom });
  };
  const cls = 'editable' + (c.hasDraft(key) ? ' draft' : c.isOverridden(key) ? ' changed' : '') + (c.editing?.key === key ? ' active' : '');
  return <span className={cls} role="button" tabIndex={0} title={`Edit text (${key})`} aria-label={`Edit text: ${value}`}
    onClick={openEditor} onMouseDown={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') openEditor(e); }}>{value}</span>;
}
