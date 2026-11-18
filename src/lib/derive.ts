// Pure derivations. Every page, KPI tile and sidebar badge reads from these
// functions so the same question always gets the same answer.
import type { ActionPlan, PendingAudit, PlannedAudit, PlannedStatus, Report, ReportStage, UnplannedAudit } from './data';
import { daysBetween, parseDate, today } from './utils';

// ---------------------------------------------------------------- planned

/** A Scheduled or In-progress audit whose due date has passed is Overdue. */
export function plannedStatus(a: PlannedAudit, now: Date = today()): PlannedStatus {
  if (a.status === 'Completed') return 'Completed';
  const due = parseDate(a.due_date);
  if (due && due.getTime() < now.getTime()) return 'Overdue';
  return a.status === 'Overdue' ? 'Scheduled' : a.status;
}

/** Scheduled audits due today or later, soonest first. */
export function upcomingAudits(planned: PlannedAudit[], now: Date = today()) {
  return planned
    .filter(a => plannedStatus(a, now) === 'Scheduled')
    .sort((a, b) => (parseDate(a.due_date)?.getTime() ?? 0) - (parseDate(b.due_date)?.getTime() ?? 0));
}

// ---------------------------------------------------------------- pending

export type QueueItem = PendingAudit & { days: number };

/**
 * The pending queue: stored queue rows plus any overdue planned audit that has
 * no row yet (waiting for data collection since its due date). Rows for audits
 * that are complete with a published report are dropped.
 */
export function pendingQueue(pending: PendingAudit[], planned: PlannedAudit[], reports: Report[], now: Date = today()): QueueItem[] {
  const published = new Set(reports.filter(r => reportStatus(r) === 'Published').map(r => r.audit_ref));
  const rows: PendingAudit[] = pending.filter(p => !published.has(p.audit_ref));
  const queued = new Set(rows.map(p => p.audit_ref));
  for (const a of planned) {
    if (!queued.has(a.ref) && plannedStatus(a, now) === 'Overdue') {
      rows.push({ id: `auto-${a.ref}`, audit_ref: a.ref, ward: a.ward, waiting_for: 'Awaiting data collection', since_date: a.due_date, owner: a.auditor });
    }
  }
  return rows
    .map(p => ({ ...p, days: daysBetween(p.since_date, now) ?? 0 }))
    .sort((a, b) => b.days - a.days);
}

// ---------------------------------------------------------------- actions

export function actionStatus(a: ActionPlan, now: Date = today()): ActionPlan['status'] {
  if (a.status === 'Closed' || a.progress >= 100) return 'Closed';
  const due = parseDate(a.due_date);
  return due && due.getTime() < now.getTime() ? 'Overdue' : 'Open';
}

export function openActions(actions: ActionPlan[], now: Date = today()) {
  return actions.filter(a => actionStatus(a, now) !== 'Closed');
}

// ---------------------------------------------------------------- reports

const STAGE_TO_STATUS: Record<ReportStage, string> = {
  'Drafted': 'Draft', 'Peer reviewed': 'Under review', 'Approved': 'Approved', 'Published': 'Published', 'Action plan agreed': 'Published',
};
export const REPORT_STAGES: ReportStage[] = ['Drafted', 'Peer reviewed', 'Approved', 'Published', 'Action plan agreed'];

export function reportStatus(r: Report) {
  const last = r.history[r.history.length - 1];
  return last ? STAGE_TO_STATUS[last.stage] : 'Draft';
}
export function reportDate(r: Report) {
  return r.history[r.history.length - 1]?.date ?? '';
}

// ---------------------------------------------------------------- results

export type AuditResult = { ward: string; topic: string; date: string; score: number; source: string };

/** Scored audit results: completed planned audits and closed, scored unplanned audits. */
export function auditResults(planned: PlannedAudit[], unplanned: UnplannedAudit[], reports: Report[]): AuditResult[] {
  const out: AuditResult[] = [];
  for (const a of planned) {
    if (a.status === 'Completed' && a.score != null) out.push({ ward: a.ward, topic: a.topic, date: a.due_date, score: Number(a.score), source: a.ref });
  }
  for (const u of unplanned) {
    if (u.status === 'Closed' && u.score != null && u.topic) {
      const report = reports.find(r => r.audit_ref === u.ref);
      out.push({ ward: u.ward, topic: u.topic, date: report ? reportDate(report) : u.raised_on, score: Number(u.score), source: u.ref });
    }
  }
  return out.filter(r => parseDate(r.date));
}

/** Latest result for each ward × topic, optionally only up to `asOf`. */
export function latestResults(results: AuditResult[], asOf?: Date) {
  const map = new Map<string, AuditResult>();
  for (const r of results) {
    const d = parseDate(r.date)!;
    if (asOf && d.getTime() > asOf.getTime()) continue;
    const key = `${r.ward}|${r.topic}`;
    const prev = map.get(key);
    if (!prev || parseDate(prev.date)!.getTime() <= d.getTime()) map.set(key, r);
  }
  return map;
}

export function heatmap(wards: string[], topics: string[], results: AuditResult[]) {
  const latest = latestResults(results);
  return wards.map(ward => ({ ward, cells: topics.map(topic => latest.get(`${ward}|${topic}`) ?? null) }));
}

/** Mean of the latest result per ward for each topic. */
export function complianceByStandard(topics: string[], results: AuditResult[]) {
  const latest = [...latestResults(results).values()];
  return topics.map(topic => {
    const rows = latest.filter(r => r.topic === topic);
    return { name: topic, score: rows.length ? Math.round(rows.reduce((s, r) => s + r.score, 0) / rows.length) : null, wards: rows.length };
  });
}

/** Month-end mean of the latest result per ward × topic, Jan → current month. */
export function complianceTrend(results: AuditResult[], year: number, now: Date = today()) {
  const lastMonth = now.getUTCFullYear() > year ? 11 : now.getUTCMonth();
  const out: { month: string; value: number | null }[] = [];
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  for (let m = 0; m <= lastMonth; m++) {
    const monthEnd = new Date(Date.UTC(year, m + 1, 0));
    const latest = [...latestResults(results, monthEnd).values()];
    out.push({ month: names[m], value: latest.length ? Math.round(latest.reduce((s, r) => s + r.score, 0) / latest.length * 10) / 10 : null });
  }
  return out;
}

/** Distinct wards with at least one scored audit result in `year`. */
export function wardsAudited(results: AuditResult[], year: number) {
  return new Set(results.filter(r => parseDate(r.date)!.getUTCFullYear() === year).map(r => r.ward));
}
