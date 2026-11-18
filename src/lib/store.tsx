// One data provider for the whole app. Pages never fetch on their own, so the
// Overview, the page tables and the sidebar badges always see the same rows.
// While loading, `loading` is true and pages show a loading state instead of
// an empty state (fixes /unplanned showing "0 records" on a direct load).
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { readTable, supabase } from './supabase';
import {
  fallbackActions, fallbackCertificates, fallbackInitiatives, fallbackLiaisons, fallbackPending, fallbackPlanned,
  fallbackReferences, fallbackReports, fallbackTopics, fallbackUnplanned, fallbackWards,
  type ActionPlan, type CertificateRecord, type Initiative, type Liaison, type PendingAudit, type PlannedAudit,
  type Reference, type Report, type Topic, type UnplannedAudit, type Ward,
} from './data';

export type HubData = {
  wards: Ward[]; topics: Topic[]; planned: PlannedAudit[]; unplanned: UnplannedAudit[]; pending: PendingAudit[];
  actions: ActionPlan[]; reports: Report[]; references: Reference[]; initiatives: Initiative[];
  liaisons: Liaison[]; certificates: CertificateRecord[];
};

type Ctx = HubData & {
  loading: boolean;
  error: string;
  ward: string;
  setWard: (w: string) => void;
  inScope: (wardName: string | undefined | null) => boolean;
  setUnplanned: (rows: UnplannedAudit[]) => void;
  setLiaisons: (rows: Liaison[]) => void;
};

export const ALL_WARDS = 'All wards';

const fallback: HubData = {
  wards: fallbackWards, topics: fallbackTopics, planned: fallbackPlanned, unplanned: fallbackUnplanned,
  pending: fallbackPending, actions: fallbackActions, reports: fallbackReports, references: fallbackReferences,
  initiatives: fallbackInitiatives, liaisons: fallbackLiaisons, certificates: fallbackCertificates,
};

const HubContext = createContext<Ctx | null>(null);

type Row = Record<string, any>;
const num = (v: unknown) => (v == null ? null : Number(v));

async function loadFromSupabase(): Promise<{ data: HubData; error: string }> {
  if (!supabase) return { data: fallback, error: '' };
  const safe = (t: string, q = '*') => readTable<Row>(t, q).catch(() => [] as Row[]);
  const [w, t, p, u, pe, a, refs, qi, li, rep, hist, rr] = await Promise.all([
    safe('wards', 'id,name'), safe('standards_topics', 'id,name'), safe('planned_audits'), safe('unplanned_audits'),
    safe('pending_audits'), safe('action_plans'), safe('references_library'), safe('qi_projects'), safe('liaisons'),
    safe('reports'), safe('report_status_history', 'report_id,stage,reached_on'), safe('report_references', 'report_id,reference_id'),
  ]);
  const refCode = (id: unknown) => refs.find(x => x.id === id)?.code as string | undefined;
  const wards: Ward[] = w.length ? w.map(x => ({ id: String(x.id), name: String(x.name) })) : fallback.wards;
  const topics: Topic[] = t.length ? t.map(x => ({ id: String(x.id), name: String(x.name) })) : fallback.topics;
  const wardName = (id: unknown) => wards.find(x => x.id === id)?.name ?? String(id ?? '');
  const topicName = (id: unknown) => topics.find(x => x.id === id)?.name ?? String(id ?? '');
  const data: HubData = {
    ...fallback,
    wards, topics,
    planned: p.length ? p.map(x => ({ ref: x.ref, topic: topicName(x.topic_id), ward: wardName(x.ward_id), quarter: x.quarter, due_date: x.due_date, auditor: x.auditor, status: x.status, score: num(x.score) })) : fallback.planned,
    unplanned: u.length ? u.map(x => ({ ref: x.ref, trigger_type: x.trigger_type, subject: x.subject, ward: wardName(x.ward_id), raised_on: x.raised_on, priority: x.priority, status: x.status, description: x.description ?? '', topic: x.topic_id ? topicName(x.topic_id) : null, score: num(x.score) })) : fallback.unplanned,
    pending: pe.length ? pe.map(x => ({ id: String(x.id), audit_ref: x.audit_ref, ward: wardName(x.ward_id), waiting_for: x.waiting_for, since_date: x.since_date, owner: x.owner })) : fallback.pending,
    actions: a.length ? a.map(x => ({ ref: x.ref, topic: topicName(x.topic_id), ward: wardName(x.ward_id), finding: x.finding, owner: x.owner, due_date: x.due_date, progress: Number(x.progress), status: x.status, audit_ref: x.audit_ref ?? null })) : fallback.actions,
    reports: rep.length && rep.every(x => x.audit_ref) ? rep.map(x => ({
      serial: x.serial, title: x.title, ward: wardName(x.ward_id), audit_ref: x.audit_ref,
      history: hist.filter(h => h.report_id === x.id).sort((m, n) => String(m.reached_on).localeCompare(String(n.reached_on))).map(h => ({ stage: h.stage, date: String(h.reached_on).slice(0, 10) })),
      references: rr.filter(z => z.report_id === x.id).map(z => refCode(z.reference_id)).filter((c): c is string => Boolean(c)),
    })) : fallback.reports,
    references: refs.length ? refs.map(x => ({ code: x.code, title: x.title, kind: x.kind, url: x.url ?? '' })) : fallback.references,
    initiatives: qi.length ? qi.map(x => ({ ref: x.ref, title: x.title, ward: wardName(x.ward_id), category: x.category, stage: x.pdsa_stage, progress: Number(x.progress), lead: x.lead, measure: x.measure_text })) : fallback.initiatives,
    liaisons: li.length ? li.map(x => ({ ward: wardName(x.ward_id), name: x.name, role: x.role, ext: String(x.contact_ext ?? ''), training_status: x.training_status, last_meeting: x.last_meeting })) : fallback.liaisons,
  };
  return { data, error: '' };
}

export function HubProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<HubData>(fallback);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState('');
  const [ward, setWard] = useState(ALL_WARDS);

  useEffect(() => {
    let live = true;
    loadFromSupabase()
      .then(r => { if (live) { setData(r.data); setError(r.error); } })
      .catch(() => { if (live) setError('Supabase data could not be loaded; showing the embedded fictional sample.'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);

  const value = useMemo<Ctx>(() => ({
    ...data, loading, error, ward, setWard,
    inScope: (w) => ward === ALL_WARDS || w === ward,
    setUnplanned: rows => setData(d => ({ ...d, unplanned: rows })),
    setLiaisons: rows => setData(d => ({ ...d, liaisons: rows })),
  }), [data, loading, error, ward]);

  return <HubContext.Provider value={value}>{children}</HubContext.Provider>;
}

export function useHub() {
  const ctx = useContext(HubContext);
  if (!ctx) throw new Error('useHub must be used inside HubProvider');
  return ctx;
}
