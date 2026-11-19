// Training Library logic (Part B3): types, dashboard figures, attendee import
// validation and certificate PDFs. No React here, so it is unit-tested directly.
import type { Department, Hospital, Ward } from './data';
import { MONTHS, parseDate } from './utils';

export const SESSION_TYPES = ['Lecture', 'Workshop', 'Simulation', 'Skills station', 'Orientation'] as const;
export const SESSION_STATUSES = ['Planned', 'Delivered', 'Cancelled', 'Postponed'] as const;
export const TARGET_GROUPS = ['Staff nurses', 'Charge nurses', 'Quality liaisons', 'New starters', 'All nursing staff'];
export const STAFF_ROLES = ['Staff nurse', 'Senior staff nurse', 'Charge nurse', 'Nursing assistant', 'Nurse educator'];
export const ACTIVITY_KINDS = ['Presentation', 'Workshop', 'Poster'] as const;

export type SessionType = typeof SESSION_TYPES[number];
export type SessionStatus = typeof SESSION_STATUSES[number];
export type ActivityKind = typeof ACTIVITY_KINDS[number];

export type TrainingSession = {
  id: string; dbId?: string; title: string; type: SessionType; topic: string | null; target_group: string;
  hospital_id: string; ward_id: string | null; date: string; trainer: string; duration_minutes: number;
  venue: string; status: SessionStatus; capacity: number | null;
};
export type Attendee = {
  dbId?: string; session_id: string; staff_number: string; name: string; ward_id: string | null; role: string; attended: boolean;
  /** Pseudonymous key for signed-out dashboards (no names). */
  person?: string;
};
export type TrainingActivity = {
  id: string; dbId?: string; kind: ActivityKind; title: string; year: number; date: string; presenter: string;
  hospital_id: string | null; session_id: string | null; topic: string | null; file_name: string | null; file_path?: string | null; description: string;
};
export type TrainingCertificate = {
  number: string; source: 'session' | 'exam'; trainee: string; staff_number: string | null; ward_id: string | null;
  title: string; session_id: string | null; score: number | null; issued_on: string;
};
export type ExamAttempt = { trainee: string; ward_id: string; course: string; score: number; passed: boolean; date: string; number: string | null };

// ------------------------------------------------------------------ dashboard

const personOf = (a: Attendee) => a.person ?? a.staff_number;
const monthOf = (d: string) => (parseDate(d)?.getUTCMonth() ?? -1);

export function trainingDashboard(sessions: TrainingSession[], attendance: Attendee[], certificates: TrainingCertificate[], wards: Ward[], hospitals: Hospital[], departments: Department[]) {
  const sessionIds = new Set(sessions.map(s => s.id));
  const att = attendance.filter(a => sessionIds.has(a.session_id));
  const attended = att.filter(a => a.attended);
  const delivered = sessions.filter(s => s.status === 'Delivered');
  const live = sessions.filter(s => s.status !== 'Cancelled');
  const byId = new Map(sessions.map(s => [s.id, s]));
  const wardMap = new Map(wards.map(w => [w.id, w]));
  const certs = certificates.filter(c => c.source === 'exam' || (c.session_id && sessionIds.has(c.session_id)));

  const staffMinutes = attended.reduce((n, a) => n + (byId.get(a.session_id)?.duration_minutes ?? 0), 0);
  const sessionMinutes = delivered.reduce((n, s) => n + s.duration_minutes, 0);
  const capacity = delivered.reduce((n, s) => n + (s.capacity ?? 0), 0);
  const attendedIn = (s: TrainingSession) => attended.filter(a => a.session_id === s.id).length;

  const months = MONTHS.map((m, i) => ({
    month: m,
    planned: live.filter(s => monthOf(s.date) === i).length,
    delivered: delivered.filter(s => monthOf(s.date) === i).length,
    attendees: attended.filter(a => monthOf(byId.get(a.session_id)!.date) === i).length,
    certificates: certs.filter(c => monthOf(c.issued_on) === i).length,
  }));

  const byType = SESSION_TYPES.map(t => ({ type: t, sessions: delivered.filter(s => s.type === t).length, attendees: attended.filter(a => byId.get(a.session_id)!.type === t).length }));

  const groupLabel = (wardId: string | null) => {
    const w = wardId ? wardMap.get(wardId) : undefined;
    if (!w) return 'Ward not recorded';
    const h = hospitals.find(x => x.id === w.hospital_id);
    const d = w.department_id ? departments.find(x => x.id === w.department_id) : undefined;
    return [h?.short ?? h?.name, d?.name.replace(/ Department$/, '')].filter(Boolean).join(' · ');
  };
  const groups = new Map<string, number>();
  for (const a of attended) groups.set(groupLabel(a.ward_id), (groups.get(groupLabel(a.ward_id)) ?? 0) + 1);
  const byGroup = [...groups].map(([group, attendees]) => ({ group, attendees })).sort((a, b) => b.attendees - a.attendees);

  const wardCounts = new Map<string, number>();
  for (const a of attended) if (a.ward_id) wardCounts.set(a.ward_id, (wardCounts.get(a.ward_id) ?? 0) + 1);
  const topWards = [...wardCounts].map(([ward_id, attendees]) => ({ ward_id, attendees })).sort((a, b) => b.attendees - a.attendees).slice(0, 10);

  const quarters = [0, 1, 2, 3].map(q => {
    const inQ = live.filter(s => Math.floor(monthOf(s.date) / 3) === q);
    const done = inQ.filter(s => s.status === 'Delivered').length;
    return { quarter: `Q${q + 1}`, planned: inQ.length, delivered: done, pct: inQ.length ? Math.round(done / inQ.length * 100) : 0 };
  });

  return {
    kpis: {
      planned: live.length, delivered: delivered.length, cancelled: sessions.length - live.length,
      attendees: attended.length, unique: new Set(attended.map(personOf)).size,
      certificates: certs.length, staffHours: Math.round(staffMinutes / 60), sessionHours: Math.round(sessionMinutes / 60),
      avgAttendance: delivered.length ? Math.round(attended.length / delivered.length * 10) / 10 : 0,
      fillRate: capacity ? Math.round(delivered.reduce((n, s) => n + attendedIn(s), 0) / capacity * 100) : null,
    },
    months, byType, byGroup, topWards, quarters,
  };
}

// ------------------------------------------------------------------ import

export type ImportResult = { valid: Omit<Attendee, 'session_id'>[]; errors: { row: number; messages: string[]; raw: string }[] };

/** Splits pasted or CSV text into rows; handles quotes, commas, tabs and semicolons. */
export function parseDelimited(text: string): string[][] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').filter(l => l.trim() !== '');
  if (!lines.length) return [];
  const sample = lines[0];
  const delim = sample.includes('\t') ? '\t' : (sample.split(';').length > sample.split(',').length ? ';' : ',');
  return lines.map(line => {
    const out: string[] = []; let cur = ''; let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quoted) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') quoted = false; else cur += ch; }
      else if (ch === '"' && cur === '') quoted = true;
      else if (ch === delim) { out.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    out.push(cur.trim());
    return out;
  });
}

const HEADERS: Record<string, string[]> = {
  name: ['name', 'full name', 'attendee', 'staff name'],
  staff_number: ['staff number', 'staff no', 'staff no.', 'staff id', 'employee number', 'id'],
  hospital: ['hospital', 'site'],
  department: ['department', 'dept'],
  ward: ['ward', 'unit', 'ward / unit', 'ward/unit'],
  role: ['role', 'job title', 'position'],
  attended: ['attended', 'present', 'attendance'],
};
const YES = ['yes', 'y', 'true', '1', 'x', 'present', 'attended'];
const NO = ['no', 'n', 'false', '0', 'absent', 'did not attend', 'dna'];

/**
 * Validates attendee rows (first row may be a header). Columns without a header,
 * in order: name, staff number, hospital, ward, role, attended.
 * Every row is checked on its own; valid rows are kept even when others fail.
 */
export function validateAttendees(rows: string[][], ctx: { wards: Ward[]; hospitals: Hospital[]; departments: Department[]; existing: string[] }): ImportResult {
  const result: ImportResult = { valid: [], errors: [] };
  if (!rows.length) return result;
  const norm = (s: unknown) => String(s ?? '').trim().toLowerCase();
  const head = rows[0].map(norm);
  const hasHeader = head.some(h => Object.values(HEADERS).some(list => list.includes(h)));
  const col = (field: string, fallback: number) => { if (!hasHeader) return fallback; const i = head.findIndex(h => HEADERS[field].includes(h)); return i; };
  const idx = { name: col('name', 0), staff_number: col('staff_number', 1), hospital: col('hospital', 2), department: col('department', -1), ward: col('ward', 3), role: col('role', 4), attended: col('attended', 5) };
  const seen = new Set(ctx.existing.map(s => s.toUpperCase()));
  const findHospital = (v: string) => ctx.hospitals.find(h => [h.name, h.code, h.short].some(x => norm(x) === norm(v)));

  (hasHeader ? rows.slice(1) : rows).forEach((r, i) => {
    const rowNo = i + (hasHeader ? 2 : 1);
    const get = (k: keyof typeof idx) => (idx[k] >= 0 ? String(r[idx[k]] ?? '').trim() : '');
    const messages: string[] = [];
    const name = get('name');
    const staff = get('staff_number').toUpperCase().replace(/\s+/g, '');
    if (name.length < 2) messages.push('Name is missing.');
    else if (name.length > 120) messages.push('Name is longer than 120 characters.');
    if (!staff) messages.push('Staff number is missing.');
    else if (!/^[A-Z0-9-]{3,20}$/.test(staff)) messages.push(`Staff number “${staff}” must be 3–20 letters, digits or dashes.`);
    else if (seen.has(staff)) messages.push(`Staff number ${staff} is already on this sheet.`);

    let ward_id: string | null = null;
    const hospText = get('hospital'), wardText = get('ward'), deptText = get('department');
    const hospital = hospText ? findHospital(hospText) : undefined;
    if (hospText && !hospital) messages.push(`Hospital “${hospText}” is not recognised.`);
    if (wardText) {
      // "Ward 33 (Surgical)" picks the department inline.
      const m = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(wardText);
      const wardName = m && !ctx.wards.some(w => norm(w.name) === norm(wardText)) ? m[1] : wardText;
      const deptHint = m && wardName !== wardText ? m[2] : deptText;
      let candidates = ctx.wards.filter(w => norm(w.name) === norm(wardName) && (!hospital || w.hospital_id === hospital.id));
      if (deptHint) candidates = candidates.filter(w => { const d = ctx.departments.find(x => x.id === w.department_id); return d && (norm(d.name) === norm(deptHint) || norm(d.name).startsWith(norm(deptHint))); });
      if (!candidates.length) messages.push(`Ward “${wardText}” was not found${hospital ? ` in ${hospital.name}` : ''}.`);
      else if (candidates.length > 1) messages.push(`Ward “${wardText}” exists more than once; add the hospital or department, e.g. “${wardName} (Surgical)”.`);
      else ward_id = candidates[0].id;
    } else if (hospText) messages.push('Ward is missing.');

    const attText = norm(get('attended'));
    let attended = true;
    if (attText && YES.includes(attText)) attended = true;
    else if (attText && NO.includes(attText)) attended = false;
    else if (attText) messages.push(`Attended “${get('attended')}” should be yes or no.`);

    if (messages.length) result.errors.push({ row: rowNo, messages, raw: r.join(' | ') });
    else { seen.add(staff); result.valid.push({ staff_number: staff, name, ward_id, role: get('role') || 'Staff nurse', attended }); }
  });
  return result;
}

// ------------------------------------------------------------------ certificates

export type CertificateContent = { number: string; name: string; title: string; date: string; detail?: string; verifyUrl: string };

/** A4 landscape certificate with a double navy border. Returns the PDF as a Blob. */
export async function certificatePdf(c: CertificateContent): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  pdf.setDrawColor(31, 78, 121);
  pdf.setLineWidth(1.6); pdf.rect(10, 10, 277, 190);
  pdf.setLineWidth(0.5); pdf.rect(15, 15, 267, 180);
  pdf.setTextColor(31, 78, 121); pdf.setFont('times', 'bold'); pdf.setFontSize(30);
  pdf.text('Certificate of Attendance', 148.5, 48, { align: 'center' });
  pdf.setTextColor(27, 39, 51); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(12);
  pdf.text('Nursing Audit Hub · Clinical Audit Department', 148.5, 60, { align: 'center' });
  pdf.setFontSize(12); pdf.text('This is to certify that', 148.5, 82, { align: 'center' });
  pdf.setFont('times', 'bold'); pdf.setFontSize(24); pdf.text(c.name, 148.5, 96, { align: 'center' });
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(13);
  pdf.text(pdf.splitTextToSize(`completed “${c.title}”`, 220), 148.5, 110, { align: 'center' });
  pdf.text(`on ${c.date}${c.detail ? ` · ${c.detail}` : ''}`, 148.5, 122, { align: 'center' });
  pdf.setLineWidth(0.3); pdf.line(60, 160, 120, 160); pdf.line(177, 160, 237, 160);
  pdf.setFontSize(10); pdf.text('Head of Clinical Audit', 90, 167, { align: 'center' }); pdf.text('Nurse Educator', 207, 167, { align: 'center' });
  pdf.setFontSize(9); pdf.setTextColor(91, 107, 122);
  pdf.text(`Certificate ${c.number} · verify at ${c.verifyUrl}`, 148.5, 185, { align: 'center' });
  pdf.text('Simulation with fictional data. Not a real qualification.', 148.5, 190, { align: 'center' });
  return pdf.output('blob');
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function zipBlobs(files: { name: string; blob: Blob }[]): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  // Plain bytes in and out: works the same in browsers and in Node (tests).
  for (const f of files) zip.file(f.name, new Uint8Array(await f.blob.arrayBuffer()));
  const bytes = await zip.generateAsync({ type: 'uint8array' });
  return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/zip' });
}

/** Next NA-CERT-YYYY-#### after the highest number in use (sample mode only; Supabase uses its sequence). */
export function nextCertificateNumbers(existing: string[], year: number, count: number) {
  let max = 0;
  for (const n of existing) { const m = /^NA-CERT-(\d{4})-(\d{4,})$/.exec(n); if (m) max = Math.max(max, Number(m[2])); }
  return Array.from({ length: count }, (_, i) => `NA-CERT-${year}-${String(max + i + 1).padStart(4, '0')}`);
}
