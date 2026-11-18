import { describe, expect, it } from 'vitest';
import { fallbackActions, fallbackPending, fallbackPlanned, fallbackReports, fallbackUnplanned, topicNames, wardNames } from './data';
import {
  actionStatus, auditResults, complianceByStandard, complianceTrend, heatmap, openActions, pendingQueue,
  plannedStatus, reportStatus, upcomingAudits, wardsAudited,
} from './derive';
import { daysBetween, fmtDate, parseDate, plural } from './utils';

const NOW = new Date(Date.UTC(2026, 10, 18)); // 18 Nov 2026
const results = auditResults(fallbackPlanned, fallbackUnplanned, fallbackReports);

describe('dates', () => {
  it('never throws on invalid input', () => {
    expect(fmtDate('2026-10--10')).toBe('—');
    expect(fmtDate('')).toBe('—');
    expect(fmtDate(null)).toBe('—');
    expect(parseDate('2026-02-31')).toBeNull();
    expect(daysBetween('nonsense', NOW)).toBeNull();
  });
  it('uses one short month style', () => {
    expect(fmtDate('2026-09-15')).toBe('15 Sep 2026');
  });
  it('pluralises', () => {
    expect(plural(1, 'audit')).toBe('1 audit');
    expect(plural(3, 'audit')).toBe('3 audits');
  });
});

describe('planned audits', () => {
  it('marks a past-due scheduled audit as Overdue and keeps it out of Coming up', () => {
    const pa011 = fallbackPlanned.find(a => a.ref === 'PA-011')!;
    expect(plannedStatus(pa011, NOW)).toBe('Overdue');
    const upcoming = upcomingAudits(fallbackPlanned, NOW).map(a => a.ref);
    expect(upcoming).not.toContain('PA-011');
    expect(upcoming[0]).toBe('PA-012'); // due today, still upcoming
  });
});

describe('pending queue', () => {
  const queue = pendingQueue(fallbackPending, fallbackPlanned, fallbackReports, NOW);
  it('has valid day counts sorted longest first', () => {
    expect(queue.every(q => Number.isFinite(q.days))).toBe(true);
    expect(queue[0].days).toBeGreaterThanOrEqual(queue[queue.length - 1].days);
  });
  it('adds overdue planned audits that have no queue row', () => {
    expect(queue.map(q => q.audit_ref)).toContain('PA-011');
  });
  it('does not list completed audits whose report is published', () => {
    const published = fallbackReports.filter(r => reportStatus(r) === 'Published').map(r => r.audit_ref);
    expect(queue.some(q => published.includes(q.audit_ref))).toBe(false);
  });
});

describe('actions', () => {
  it('excludes closed actions from open actions', () => {
    expect(openActions(fallbackActions, NOW).map(a => a.ref)).not.toContain('AP-006');
    expect(openActions(fallbackActions, NOW)).toHaveLength(5);
    expect(fallbackActions.filter(a => actionStatus(a, NOW) === 'Overdue').map(a => a.ref)).toEqual(['AP-002', 'AP-004']);
  });
});

describe('consistency across pages', () => {
  it('every report links to an existing audit and has dated history', () => {
    const refs = new Set([...fallbackPlanned.map(a => a.ref), ...fallbackUnplanned.map(u => u.ref)]);
    for (const r of fallbackReports) {
      expect(refs.has(r.audit_ref)).toBe(true);
      expect(r.history.every(h => parseDate(h.date))).toBe(true);
    }
  });
  it('no report exists for an audit that is not complete or closed', () => {
    for (const r of fallbackReports) {
      const a = fallbackPlanned.find(p => p.ref === r.audit_ref);
      const u = fallbackUnplanned.find(p => p.ref === r.audit_ref);
      expect(a ? plannedStatus(a, NOW) === 'Completed' : u?.status === 'Closed').toBe(true);
    }
  });
});

describe('heatmap', () => {
  it('comes from audit results: ICU Hand Hygiene equals PA-001', () => {
    const grid = heatmap(wardNames, topicNames, results);
    const icu = grid.find(r => r.ward === 'ICU')!;
    expect(icu.cells[topicNames.indexOf('Hand Hygiene')]).toMatchObject({ score: 94, source: 'PA-001' });
  });
  it('leaves unaudited cells empty instead of inventing values', () => {
    const grid = heatmap(wardNames, topicNames, results);
    const filled = grid.flatMap(r => r.cells).filter(Boolean).length;
    expect(filled).toBe(results.length);
  });
  it('compliance by standard and trend use the same results', () => {
    const hh = complianceByStandard(topicNames, results).find(s => s.name === 'Hand Hygiene')!;
    expect(hh).toMatchObject({ score: 94, wards: 1 });
    const trend = complianceTrend(results, 2026, NOW);
    expect(trend).toHaveLength(11);
    expect(trend[0].value).toBeNull();
    expect(trend[2].value).toBeCloseTo((94 + 88 + 92) / 3, 1);
  });
  it('counts wards audited this year', () => {
    expect(wardsAudited(results, 2026).size).toBe(8);
  });
});
