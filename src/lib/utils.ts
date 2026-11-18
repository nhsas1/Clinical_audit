// Shared formatting helpers. Every date shown in the app goes through these,
// so an invalid value renders as "—" instead of throwing (Intl throws a
// RangeError on an Invalid Date, which previously blanked /pending).

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_MS = 86_400_000;

export function band(value: number | null | undefined) {
  if (value == null) return 'neutral';
  return value >= 90 ? 'good' : value >= 80 ? 'warning' : 'critical';
}

export function bandLabel(value: number | null | undefined) {
  if (value == null) return 'Not scored';
  return value >= 90 ? 'On target' : value >= 80 ? 'Watch' : 'Below target';
}

/** Parses an ISO date (YYYY-MM-DD or full timestamp). Returns null when invalid. */
export function parseDate(value: string | Date | null | undefined): Date | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const d = dateOnly ? new Date(Date.UTC(+dateOnly[1], +dateOnly[2] - 1, +dateOnly[3])) : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  // Reject rolled-over dates such as 2026-02-31.
  if (dateOnly && d.getUTCDate() !== +dateOnly[3]) return null;
  return d;
}

/** "08 Sep 2026" — one date style everywhere (Intl's en-GB gives "Sept"). */
export function fmtDate(value: string | Date | null | undefined) {
  const d = parseDate(value);
  if (!d) return '—';
  return `${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Today's date at UTC midnight. */
export function today(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

/** Whole days from `from` to `to` (never negative). Null when `from` is invalid. */
export function daysBetween(from: string | Date | null | undefined, to: Date = today()): number | null {
  const d = parseDate(from);
  if (!d) return null;
  return Math.max(0, Math.floor((to.getTime() - d.getTime()) / DAY_MS));
}

/** plural(1,'audit') → "1 audit"; plural(2,'audit') → "2 audits". */
export function plural(n: number, singular: string, pluralForm = `${singular}s`) {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}

export function showToast(message: string) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  window.setTimeout(() => el.classList.remove('show'), 2800);
}

export { MONTHS };
