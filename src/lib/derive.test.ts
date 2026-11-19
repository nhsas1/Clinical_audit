import { describe, expect, it } from 'vitest';
import hierarchy from './hierarchy.json';
import {
  fallbackActions, fallbackDepartments, fallbackHospitals, fallbackLiaisons, fallbackPending, fallbackPlanned,
  fallbackReports, fallbackUnplanned, fallbackWards, topicNames,
} from './data';
import {
  actionStatus, auditResults, complianceByStandard, complianceTrend, heatmap, latestResults, openActions, pendingQueue,
  plannedStatus, reportStatus, upcomingAudits, wardsAudited,
} from './derive';
import { daysBetween, fmtDate, parseDate, plural } from './utils';

const NOW = new Date(Date.UTC(2026, 10, 18)); // 18 Nov 2026, the sample's reference date
const results = auditResults(fallbackPlanned, fallbackUnplanned, fallbackReports);
const wardIds = new Set(fallbackWards.map(w => w.id));

describe('dates', () => {
  it('never throws on invalid input', () => {
    expect(fmtDate('2026-10--10')).toBe('—');
    expect(fmtDate('')).toBe('—');
    expect(fmtDate(null)).toBe('—');
    expect(parseDate('2026-02-31')).toBeNull();
    expect(daysBetween('nonsense', NOW)).toBeNull();
  });
  it('uses one short month style', () => expect(fmtDate('2026-09-15')).toBe('15 Sep 2026'));
  it('pluralises', () => { expect(plural(1, 'audit')).toBe('1 audit'); expect(plural(3, 'audit')).toBe('3 audits'); });
});

describe('hospital hierarchy', () => {
  const listed = hierarchy.hospitals.reduce((n, h) => n + ('departments' in h && h.departments ? h.departments.reduce((m, d) => m + d.wards.length, 0) : (h as { wards: string[] }).wards.length), 0);
  it('keeps every listed ward, each in its own hospital', () => {
    expect(fallbackHospitals).toHaveLength(5);
    expect(fallbackWards).toHaveLength(listed);
    expect(fallbackWards.every(w => fallbackHospitals.some(h => h.id === w.hospital_id))).toBe(true);
  });
  it('departments belong to the ward’s hospital; only SMC has departments', () => {
    for (const w of fallbackWards.filter(x => x.department_id)) {
      expect(fallbackDepartments.find(d => d.id === w.department_id)?.hospital_id).toBe(w.hospital_id);
    }
    expect(new Set(fallbackDepartments.map(d => d.hospital_id))).toEqual(new Set(['smc']));
  });
  it('allows repeated names but keeps hospital + department + name unique', () => {
    const keys = fallbackWards.map(w => `${w.hospital_id}|${w.department_id}|${w.name}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(fallbackWards.filter(w => w.name === 'Ward 33')).toHaveLength(2);
    expect(fallbackWards.filter(w => w.name === 'PICU')).toHaveLength(2);
    expect(new Set(fallbackWards.filter(w => w.name === 'PDU').map(w => w.hospital_id))).toEqual(new Set(['smc', 'ark']));
    expect(new Set(fallbackWards.filter(w => w.name === 'Ward 4').map(w => w.hospital_id))).toEqual(new Set(['smc', 'ekk']));
  });
  it('gives recent activity to about 40% of wards', () => {
    const active = new Set([...fallbackPlanned, ...fallbackUnplanned].map(r => r.ward_id));
    const share = active.size / fallbackWards.length;
    expect(share).toBeGreaterThan(0.35);
    expect(share).toBeLessThan(0.45);
  });
  it('every record points at a real ward', () => {
    for (const rows of [fallbackPlanned, fallbackUnplanned, fallbackPending, fallbackActions, fallbackReports, fallbackLiaisons]) {
      expect(rows.every(r => wardIds.has(r.ward_id))).toBe(true);
    }
  });
});

describe('liaisons', () => {
  it('one per ward, 4-digit extensions, about 70% trained, 2026 meetings', () => {
    expect(new Set(fallbackLiaisons.map(l => l.ward_id)).size).toBe(fallbackWards.length);
    expect(fallbackLiaisons.every(l => /^\d{4}$/.test(l.ext))).toBe(true);
    const trained = fallbackLiaisons.filter(l => l.training_status === 'Trained').length / fallbackLiaisons.length;
    expect(trained).toBeCloseTo(0.7, 1);
    expect(fallbackLiaisons.every(l => l.last_meeting.startsWith('2026-') && parseDate(l.last_meeting))).toBe(true);
  });
});

describe('planned audits', () => {
  it('a past-due audit that is not completed is Overdue and not in Coming up', () => {
    const upcoming = new Set(upcomingAudits(fallbackPlanned, NOW).map(a => a.ref));
    for (const a of fallbackPlanned) {
      const overdue = a.status !== 'Completed' && parseDate(a.due_date)!.getTime() < NOW.getTime();
      expect(plannedStatus(a, NOW) === 'Overdue').toBe(overdue);
      if (overdue) expect(upcoming.has(a.ref)).toBe(false);
    }
  });
  it('a completed audit has a score and is not due in the future', () => {
    for (const a of fallbackPlanned.filter(x => x.status === 'Completed')) {
      expect(a.score).not.toBeNull();
      expect(parseDate(a.due_date)!.getTime()).toBeLessThanOrEqual(NOW.getTime());
    }
  });
});

describe('pending queue', () => {
  const queue = pendingQueue(fallbackPending, fallbackPlanned, fallbackReports, NOW);
  it('has valid day counts, longest first', () => {
    expect(queue.every(q => Number.isFinite(q.days))).toBe(true);
    for (let i = 1; i < queue.length; i++) expect(queue[i - 1].days).toBeGreaterThanOrEqual(queue[i].days);
  });
  it('includes every overdue planned audit', () => {
    const refs = new Set(queue.map(q => q.audit_ref));
    for (const a of fallbackPlanned.filter(x => plannedStatus(x, NOW) === 'Overdue')) expect(refs.has(a.ref)).toBe(true);
  });
  it('never lists an audit whose report is published', () => {
    const published = new Set(fallbackReports.filter(r => reportStatus(r) === 'Published').map(r => r.audit_ref));
    expect(queue.some(q => published.has(q.audit_ref))).toBe(false);
  });
});

describe('actions', () => {
  it('open actions exclude closed ones', () => {
    const open = openActions(fallbackActions, NOW);
    expect(open.every(a => actionStatus(a, NOW) !== 'Closed')).toBe(true);
    expect(open.length).toBe(fallbackActions.filter(a => a.progress < 100).length);
  });
});

describe('consistency across pages', () => {
  it('each report belongs to a completed or closed audit on the same ward, with dated history', () => {
    for (const r of fallbackReports) {
      const a = fallbackPlanned.find(p => p.ref === r.audit_ref);
      const u = fallbackUnplanned.find(p => p.ref === r.audit_ref);
      expect(a ? a.status === 'Completed' : u?.status === 'Closed').toBe(true);
      expect((a ?? u)!.ward_id).toBe(r.ward_id);
      expect(r.history.length).toBeGreaterThan(0);
      expect(r.history.every(h => parseDate(h.date) && parseDate(h.date)!.getTime() <= NOW.getTime())).toBe(true);
    }
  });
});

describe('heatmap and compliance', () => {
  it('each cell is the latest audit result for that ward and standard', () => {
    const latest = latestResults(results);
    const grid = heatmap([...wardIds], topicNames, results);
    for (const row of grid) row.cells.forEach((c, i) => expect(c).toEqual(latest.get(`${row.ward_id}|${topicNames[i]}`) ?? null));
    const pa = fallbackPlanned.find(p => p.status === 'Completed')!;
    const own = latest.get(`${pa.ward_id}|${pa.topic}`)!;
    expect(own.score).toBeTypeOf('number');
  });
  it('compliance by standard and the trend use the same results', () => {
    const byStd = complianceByStandard(topicNames, results);
    expect(byStd.reduce((n, s) => n + s.wards, 0)).toBe(latestResults(results).size);
    expect(complianceTrend(results, 2026, NOW)).toHaveLength(11);
  });
  it('wards audited this year never exceeds wards with activity', () => {
    expect(wardsAudited(results, 2026).size).toBeLessThanOrEqual(new Set(fallbackPlanned.map(p => p.ward_id)).size + fallbackUnplanned.length);
  });
});
