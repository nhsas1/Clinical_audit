// One data provider for the whole app. Pages never fetch on their own, so the
// Overview, the page tables and the sidebar badges always see the same rows.
// While loading, `loading` is true and pages show a loading state instead of
// an empty state (fixes /unplanned showing "0 records" on a direct load).
//
// Rows reference wards by id: ward names repeat across hospitals and
// departments (Ward 33, PICU, PDU, Ward 4), so a name alone is ambiguous.
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { readTable, supabase } from './supabase';
import { useAuth } from './auth';
import {
  fallbackActions, fallbackCertificates, fallbackDepartments, fallbackHospitals, fallbackInitiatives, fallbackLiaisons,
  fallbackPending, fallbackPlanned, fallbackReferences, fallbackReports, fallbackTopics, fallbackUnplanned, fallbackWards,
  type ActionPlan, type CertificateRecord, type Department, type Hospital, type Initiative, type Liaison, type PendingAudit,
  type PlannedAudit, type Reference, type Report, type Topic, type UnplannedAudit, type Ward,
} from './data';

export type HubData = {
  hospitals: Hospital[]; departments: Department[]; wards: Ward[]; topics: Topic[];
  planned: PlannedAudit[]; unplanned: UnplannedAudit[]; pending: PendingAudit[]; actions: ActionPlan[];
  reports: Report[]; references: Reference[]; initiatives: Initiative[]; liaisons: Liaison[]; certificates: CertificateRecord[];
  source: 'supabase' | 'sample';
};

/** '' means "all" at that level. */
export type Scope = { hospital: string; department: string; ward: string };
export const EMPTY_SCOPE: Scope = { hospital: '', department: '', ward: '' };

type Ctx = HubData & {
  loading: boolean;
  error: string;
  scope: Scope;
  setScope: (s: Scope) => void;
  /** Wards inside the current scope, in hierarchy order. */
  scopedWards: Ward[];
  inScope: (wardId: string | undefined | null) => boolean;
  scopeLabel: string;
  ward: (id: string) => Ward | undefined;
  wardName: (id: string) => string;
  /** "SMC · Surgical" — where the ward sits. */
  wardContext: (id: string) => string;
  hospital: (id: string) => Hospital | undefined;
  department: (id: string | null) => Department | undefined;
  setUnplanned: (rows: UnplannedAudit[]) => void;
  setLiaisons: (rows: Liaison[]) => void;
  /** Saves changed liaisons to Supabase (admin only, enforced by RLS). Returns an error message or null. */
  saveLiaisons: (rows: Liaison[]) => Promise<string | null>;
};

export const shortDept = (name: string) => name.replace(/ Department$/, '');

const fallback: HubData = {
  hospitals: fallbackHospitals, departments: fallbackDepartments, wards: fallbackWards, topics: fallbackTopics,
  planned: fallbackPlanned, unplanned: fallbackUnplanned, pending: fallbackPending, actions: fallbackActions,
  reports: fallbackReports, references: fallbackReferences, initiatives: fallbackInitiatives, liaisons: fallbackLiaisons,
  certificates: fallbackCertificates, source: 'sample',
};

const HubContext = createContext<Ctx | null>(null);

function structure(h: Row[], d: Row[], w: Row[], t: Row[]) {
  const bySort = (x: Row, y: Row) => (x.sort_order ?? 0) - (y.sort_order ?? 0);
  const hospitals: Hospital[] = [...h].sort(bySort).map(x => ({ id: x.id, code: x.code, short: x.short_name ?? x.code, name: x.name }));
  const departments: Department[] = [...d].sort(bySort).map(x => ({ id: x.id, hospital_id: x.hospital_id, name: x.name }));
  const hOrder = new Map(hospitals.map((x, i) => [x.id, i])), dOrder = new Map(departments.map((x, i) => [x.id, i]));
  const wards: Ward[] = [...w].sort((x, y) => (hOrder.get(x.hospital_id)! - hOrder.get(y.hospital_id)!) || ((dOrder.get(x.department_id) ?? -1) - (dOrder.get(y.department_id) ?? -1)) || bySort(x, y))
    .map(x => ({ id: x.id, name: x.name, hospital_id: x.hospital_id, department_id: x.department_id ?? null }));
  const topics: Topic[] = t.length ? t.map(x => ({ id: String(x.id), name: String(x.name) })) : fallback.topics;
  const topicName = (id: unknown) => topics.find(x => x.id === id)?.name ?? String(id ?? '');
  return { hospitals, departments, wards, topics, topicName };
}

/** Signed out: only the minimal Overview fields from public_dashboard(); no names or free text. */
async function loadPublicDashboard(h: Row[], d: Row[], w: Row[], t: Row[]): Promise<HubData> {
  const { hospitals, departments, wards, topics, topicName } = structure(h, d, w, t);
  const { data, error } = await supabase!.rpc('public_dashboard');
  if (error || !data) throw error ?? new Error('No dashboard data');
  const x = data as Record<string, Row[]>;
  return {
    source: 'supabase', hospitals, departments, wards, topics,
    planned: x.planned.map(r => ({ ref: r.ref, topic: topicName(r.topic_id), ward_id: r.ward_id, quarter: r.quarter, due_date: r.due_date, auditor: '', status: r.status, score: num(r.score) })),
    unplanned: x.unplanned.map(r => ({ ref: r.ref, trigger_type: r.trigger_type, subject: '', ward_id: r.ward_id, raised_on: r.raised_on, priority: r.priority, status: r.status, description: '', topic: r.topic_id ? topicName(r.topic_id) : null, score: num(r.score) })),
    pending: x.pending.map(r => ({ id: String(r.id), audit_ref: r.audit_ref, ward_id: r.ward_id, waiting_for: r.waiting_for, since_date: r.since_date, owner: '' })),
    actions: x.actions.map(r => ({ ref: r.ref, topic: topicName(r.topic_id), ward_id: r.ward_id, finding: '', owner: '', due_date: r.due_date, progress: Number(r.progress), status: r.status, audit_ref: r.audit_ref ?? null })),
    reports: x.reports.map(r => ({ serial: r.serial, title: '', ward_id: r.ward_id, audit_ref: r.audit_ref ?? '', history: (r.history ?? []).map((y: Row) => ({ stage: y.stage, date: String(y.date).slice(0, 10) })), references: [] })),
    references: [], initiatives: [], liaisons: [], certificates: [],
  };
}

type Row = Record<string, any>;
const num = (v: unknown) => (v == null ? null : Number(v));

async function loadFromSupabase(signedIn: boolean): Promise<HubData> {
  if (!supabase) return fallback;
  // The hierarchy (migration 003) must be present; otherwise the database
  // still has the old flat sample and mixing it with this UI would mislead.
  const h = await readTable<Row>('hospitals', 'id,code,short_name,name,sort_order').catch(() => [] as Row[]);
  if (!h.length) return fallback;
  const [d, w] = await Promise.all([
    readTable<Row>('departments', 'id,hospital_id,name,sort_order').catch(() => [] as Row[]),
    readTable<Row>('wards', 'id,name,hospital_id,department_id,sort_order').catch(() => [] as Row[]),
  ]);
  if (!h.length || !w.length || w.some(x => !x.hospital_id)) return fallback;

  const safe = (t: string, q = '*') => readTable<Row>(t, q).catch(() => [] as Row[]);
  if (!signedIn) return loadPublicDashboard(h, d, w, await safe('standards_topics', 'id,name'));
  const [t, p, u, pe, a, refs, qi, li, rep, hist, rr] = await Promise.all([
    safe('standards_topics', 'id,name'), safe('planned_audits'), safe('unplanned_audits'), safe('pending_audits'),
    safe('action_plans'), safe('references_library'), safe('qi_projects'), safe('liaisons'), safe('reports'),
    safe('report_status_history', 'report_id,stage,reached_on'), safe('report_references', 'report_id,reference_id'),
  ]);
  const { hospitals, departments, wards, topics, topicName } = structure(h, d, w, t);
  const refCode = (id: unknown) => refs.find(x => x.id === id)?.code as string | undefined;
  return {
    source: 'supabase', hospitals, departments, wards, topics,
    planned: p.map(x => ({ ref: x.ref, topic: topicName(x.topic_id), ward_id: x.ward_id, quarter: x.quarter, due_date: x.due_date, auditor: x.auditor, status: x.status, score: num(x.score) })),
    unplanned: u.map(x => ({ ref: x.ref, trigger_type: x.trigger_type, subject: x.subject, ward_id: x.ward_id, raised_on: x.raised_on, priority: x.priority, status: x.status, description: x.description ?? '', topic: x.topic_id ? topicName(x.topic_id) : null, score: num(x.score) })),
    pending: pe.map(x => ({ id: String(x.id), audit_ref: x.audit_ref, ward_id: x.ward_id, waiting_for: x.waiting_for, since_date: x.since_date, owner: x.owner })),
    actions: a.map(x => ({ ref: x.ref, topic: topicName(x.topic_id), ward_id: x.ward_id, finding: x.finding, owner: x.owner, due_date: x.due_date, progress: Number(x.progress), status: x.status, audit_ref: x.audit_ref ?? null })),
    reports: rep.map(x => ({
      serial: x.serial, title: x.title, ward_id: x.ward_id, audit_ref: x.audit_ref ?? '',
      history: hist.filter(y => y.report_id === x.id).sort((m, n) => String(m.reached_on).localeCompare(String(n.reached_on))).map(y => ({ stage: y.stage, date: String(y.reached_on).slice(0, 10) })),
      references: rr.filter(z => z.report_id === x.id).map(z => refCode(z.reference_id)).filter((c): c is string => Boolean(c)),
    })),
    references: refs.length ? refs.map(x => ({ code: x.code, title: x.title, kind: x.kind, url: x.url ?? '' })) : fallback.references,
    initiatives: qi.map(x => ({ ref: x.ref, title: x.title, ward_id: x.ward_id, category: x.category, stage: x.pdsa_stage, progress: Number(x.progress), lead: x.lead, measure: x.measure_text })),
    liaisons: li.map(x => ({ ward_id: x.ward_id, name: x.name, role: x.role, ext: String(x.contact_ext ?? ''), training_status: x.training_status, last_meeting: x.last_meeting })),
    certificates: fallback.certificates.filter(c => wards.some(w => w.id === c.ward_id)),
  };
}

export function HubProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const signedIn = Boolean(auth.session);
  const [data, setData] = useState<HubData>(fallback);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState('');
  const [scope, setScopeState] = useState<Scope>(EMPTY_SCOPE);

  useEffect(() => {
    if (!auth.ready) return;
    let live = true;
    setLoading(Boolean(supabase));
    loadFromSupabase(signedIn)
      .then(r => { if (live) setData(r); })
      .catch(() => { if (live) setError('Supabase data could not be loaded; showing the embedded fictional sample.'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [auth.ready, signedIn]);

  const value = useMemo<Ctx>(() => {
    const wardMap = new Map(data.wards.map(w => [w.id, w]));
    const hospMap = new Map(data.hospitals.map(h => [h.id, h]));
    const deptMap = new Map(data.departments.map(d => [d.id, d]));
    const matches = (w: Ward | undefined) => !!w && (!scope.hospital || w.hospital_id === scope.hospital) && (!scope.department || w.department_id === scope.department) && (!scope.ward || w.id === scope.ward);
    const scopedWards = data.wards.filter(matches);
    const label = scope.ward ? wardMap.get(scope.ward)?.name : scope.department ? deptMap.get(scope.department)?.name : scope.hospital ? hospMap.get(scope.hospital)?.name : 'All hospitals';
    return {
      ...data, loading, error, scope, scopedWards,
      // Selecting a level clears the levels below it.
      setScope: s => setScopeState(s),
      inScope: id => (!scope.hospital && !scope.department && !scope.ward) || matches(wardMap.get(id ?? '')),
      scopeLabel: label ?? 'All hospitals',
      ward: id => wardMap.get(id),
      wardName: id => wardMap.get(id)?.name ?? '—',
      wardContext: id => { const w = wardMap.get(id); if (!w) return ''; const h = hospMap.get(w.hospital_id); const d = w.department_id ? deptMap.get(w.department_id) : undefined; return [h?.short, d && shortDept(d.name)].filter(Boolean).join(' · '); },
      hospital: id => hospMap.get(id),
      department: id => (id ? deptMap.get(id) : undefined),
      setUnplanned: rows => setData(d => ({ ...d, unplanned: rows })),
      setLiaisons: rows => setData(d => ({ ...d, liaisons: rows })),
      saveLiaisons: async rows => {
        if (data.source !== 'supabase' || !supabase) { setData(d => ({ ...d, liaisons: rows })); return null; }
        const before = new Map(data.liaisons.map(l => [l.ward_id, JSON.stringify(l)]));
        const changed = rows.filter(l => before.get(l.ward_id) !== JSON.stringify(l));
        for (const l of changed) {
          const { error: e } = await supabase.from('liaisons').update({ name: l.name, role: l.role, contact_ext: l.ext, training_status: l.training_status, last_meeting: l.last_meeting || null }).eq('ward_id', l.ward_id);
          if (e) return 'Changes could not be saved. Only admins can edit the directory.';
        }
        setData(d => ({ ...d, liaisons: rows }));
        return null;
      },
    };
  }, [data, loading, error, scope]);

  return <HubContext.Provider value={value}>{children}</HubContext.Provider>;
}

export function useHub() {
  const ctx = useContext(HubContext);
  if (!ctx) throw new Error('useHub must be used inside HubProvider');
  return ctx;
}
