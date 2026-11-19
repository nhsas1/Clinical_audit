import { describe, expect, it } from 'vitest';
import seed from './seed.generated.json';
import { fallbackDepartments, fallbackHospitals, fallbackWards } from './data';
import { nextCertificateNumbers, parseDelimited, trainingDashboard, validateAttendees, type Attendee, type TrainingCertificate, type TrainingSession } from './training';

const ctx = { wards: fallbackWards, hospitals: fallbackHospitals, departments: fallbackDepartments, existing: ['N10001'] };
const sessions = seed.trainingSessions as TrainingSession[];
const attendance = seed.attendance as Attendee[];
const certificates = seed.certificates as TrainingCertificate[];

describe('parseDelimited', () => {
  it('reads tabs, commas, semicolons and quoted values', () => {
    expect(parseDelimited('a\tb\tc\n1\t2\t3')).toEqual([['a', 'b', 'c'], ['1', '2', '3']]);
    expect(parseDelimited('"Ali, K.",N1\r\n')).toEqual([['Ali, K.', 'N1']]);
    expect(parseDelimited('x;y;z')).toEqual([['x', 'y', 'z']]);
    expect(parseDelimited('"say ""hi""",b')).toEqual([['say "hi"', 'b']]);
  });
});

describe('validateAttendees', () => {
  it('accepts a header row and maps columns by name', () => {
    const r = validateAttendees([['Staff number', 'Name', 'Ward', 'Hospital', 'Attended'], ['n20001', 'Huda M.', 'ICU', 'SMC', 'yes']], ctx);
    expect(r.errors).toEqual([]);
    expect(r.valid[0]).toMatchObject({ staff_number: 'N20001', name: 'Huda M.', ward_id: 'smc/excellence-department/icu', attended: true, role: 'Staff nurse' });
  });
  it('asks for the department when a ward name repeats, and accepts “Ward 33 (Surgical)”', () => {
    const amb = validateAttendees([['Ali K.', 'N20002', 'SMC', 'Ward 33', 'Staff nurse', 'yes']], ctx);
    expect(amb.errors[0].messages.join(' ')).toMatch(/more than once/);
    const ok = validateAttendees([['Ali K.', 'N20002', 'SMC', 'Ward 33 (Surgical)', 'Staff nurse', 'yes']], ctx);
    expect(ok.valid[0].ward_id).toBe('smc/surgical-department/ward-33');
  });
  it('keeps “307 (NICU)” as a real ward name rather than a department hint', () => {
    const r = validateAttendees([['Sara T.', 'N20003', 'SMC', '307 (NICU)', 'Staff nurse', 'yes']], ctx);
    expect(r.valid[0]?.ward_id).toBe('smc/surgical-department/307-nicu');
  });
  it('separates wards with the same name in different hospitals', () => {
    expect(validateAttendees([['A B.', 'N20004', 'ARK', 'PDU', '', 'yes']], ctx).valid[0].ward_id).toBe('ark/-/pdu');
    expect(validateAttendees([['A B.', 'N20005', 'EKK', 'Ward 4', '', '']], ctx).valid[0].ward_id).toBe('ekk/-/ward-4');
  });
  it('reports every problem per row and keeps the valid rows', () => {
    const r = validateAttendees([
      ['', 'bad no!', 'Nowhere', 'Ward 99', 'Staff nurse', 'maybe'],
      ['Dana J.', 'N10001', 'SMC', 'ICU', '', 'yes'],        // already on the sheet
      ['Omar R.', 'N20006', 'SMC', 'ICU', '', 'no'],
      ['Omar R.', 'N20006', 'SMC', 'ICU', '', 'no'],         // duplicate in the file
    ], ctx);
    expect(r.valid).toHaveLength(1);
    expect(r.valid[0]).toMatchObject({ staff_number: 'N20006', attended: false });
    expect(r.errors.map(e => e.row)).toEqual([1, 2, 4]);
    expect(r.errors[0].messages.length).toBeGreaterThanOrEqual(4);
  });
});

describe('certificate numbers', () => {
  it('continue after the highest number in use', () => {
    expect(nextCertificateNumbers(['NA-CERT-2026-0009', 'NA-CERT-2026-0010', 'junk'], 2026, 2)).toEqual(['NA-CERT-2026-0011', 'NA-CERT-2026-0012']);
  });
});

describe('generated training sample', () => {
  it('has unique certificate numbers, only for attended people on delivered sessions', () => {
    expect(new Set(certificates.map(c => c.number)).size).toBe(certificates.length);
    for (const c of certificates.filter(x => x.source === 'session')) {
      const s = sessions.find(x => x.id === c.session_id)!;
      expect(s.status).toBe('Delivered');
      expect(attendance.some(a => a.session_id === s.id && a.staff_number === c.staff_number && a.attended)).toBe(true);
    }
  });
  it('only has attendance on delivered sessions, with one row per person per session', () => {
    const delivered = new Set(sessions.filter(s => s.status === 'Delivered').map(s => s.id));
    expect(attendance.every(a => delivered.has(a.session_id))).toBe(true);
    const keys = attendance.map(a => `${a.session_id}|${a.staff_number}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it('links activity only to existing sessions', () => {
    const ids = new Set(sessions.map(s => s.id));
    expect((seed.activity as { session_id: string | null }[]).every(a => !a.session_id || ids.has(a.session_id))).toBe(true);
  });
});

describe('trainingDashboard', () => {
  const d = trainingDashboard(sessions, attendance, certificates, fallbackWards, fallbackHospitals, fallbackDepartments);
  it('counts delivered against planned and unique attendees', () => {
    expect(d.kpis.delivered).toBe(sessions.filter(s => s.status === 'Delivered').length);
    expect(d.kpis.planned).toBe(sessions.filter(s => s.status !== 'Cancelled').length);
    expect(d.kpis.attendees).toBe(attendance.filter(a => a.attended).length);
    expect(d.kpis.unique).toBeLessThanOrEqual(d.kpis.attendees);
    expect(d.kpis.certificates).toBe(certificates.length);
  });
  it('monthly and quarterly figures add up', () => {
    expect(d.months.reduce((n, m) => n + m.delivered, 0)).toBe(d.kpis.delivered);
    expect(d.quarters.reduce((n, q) => n + q.planned, 0)).toBe(d.kpis.planned);
    expect(d.byGroup.reduce((n, g) => n + g.attendees, 0)).toBe(d.kpis.attendees);
  });
  it('a filtered set only counts its own sessions', () => {
    const one = sessions.filter(s => s.status === 'Delivered').slice(0, 1);
    const f = trainingDashboard(one, attendance, certificates.filter(c => c.session_id === one[0].id), fallbackWards, fallbackHospitals, fallbackDepartments);
    expect(f.kpis.attendees).toBe(attendance.filter(a => a.session_id === one[0].id && a.attended).length);
  });
});

describe('certificate files', () => {
  it('builds an A4 landscape PDF and zips several of them', async () => {
    const { certificatePdf, zipBlobs } = await import('./training');
    const pdf = await certificatePdf({ number: 'NA-CERT-2026-0001', name: 'Test Nurse A.', title: 'Five moments refresher', date: '04 Jan 2026', verifyUrl: 'http://localhost/verify/NA-CERT-2026-0001' });
    const head = new TextDecoder().decode(new Uint8Array(await pdf.arrayBuffer()).slice(0, 5));
    expect(head).toBe('%PDF-');
    const zip = await zipBlobs([{ name: 'a.pdf', blob: pdf }, { name: 'b.pdf', blob: pdf }]);
    const { default: JSZip } = await import('jszip');
    const opened = await JSZip.loadAsync(await zip.arrayBuffer());
    expect(Object.keys(opened.files).sort()).toEqual(['a.pdf', 'b.pdf']);
  });
});
