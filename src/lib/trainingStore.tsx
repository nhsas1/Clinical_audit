// Training data for the Training Library. Same rules as the hub store:
//   Supabase + signed in   -> training tables (writes go to Supabase; RLS decides)
//   Supabase + signed out  -> public_training_dashboard() only (no names)
//   sample mode            -> generated sample; edits live in this browser tab only
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import seed from './seed.generated.json';
import { supabase } from './supabase';
import { useAuth } from './auth';
import { useHub } from './store';
import { nextCertificateNumbers, type Attendee, type ExamAttempt, type TrainingActivity, type TrainingCertificate, type TrainingSession } from './training';

type Row = Record<string, any>;
type Data = { sessions: TrainingSession[]; attendance: Attendee[]; activity: TrainingActivity[]; certificates: TrainingCertificate[]; exams: ExamAttempt[] };

const sample: Data = {
  sessions: seed.trainingSessions as TrainingSession[],
  attendance: seed.attendance as Attendee[],
  activity: seed.activity as TrainingActivity[],
  certificates: seed.certificates as TrainingCertificate[],
  exams: seed.examAttempts as ExamAttempt[],
};
const EMPTY: Data = { sessions: [], attendance: [], activity: [], certificates: [], exams: [] };

type Ctx = Data & {
  loading: boolean;
  mode: 'supabase' | 'public' | 'sample' | 'missing';
  saveSession: (s: TrainingSession) => Promise<string | null>;
  deleteSession: (id: string) => Promise<string | null>;
  saveAttendees: (sessionId: string, rows: Attendee[]) => Promise<string | null>;
  removeAttendee: (sessionId: string, staffNumber: string) => Promise<string | null>;
  issueCertificates: (sessionId: string) => Promise<{ error: string | null; issued: TrainingCertificate[] }>;
  storeCertificatePdf: (number: string, blob: Blob) => Promise<void>;
  saveActivity: (a: TrainingActivity, file?: File | null) => Promise<string | null>;
  fileUrl: (path: string) => Promise<string | null>;
};

const TrainingContext = createContext<Ctx | null>(null);

export function TrainingProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const hub = useHub();
  const [data, setData] = useState<Data>(sample);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Ctx['mode']>('sample');
  const remote = hub.source === 'supabase' && Boolean(supabase);
  const signedIn = Boolean(auth.session);

  const load = useCallback(async () => {
    if (hub.loading) return;
    if (!remote) { setData(sample); setMode('sample'); setLoading(false); return; }
    setLoading(true);
    try {
      if (!signedIn) {
        const { data: d, error } = await supabase!.rpc('public_training_dashboard');
        if (error || !d) { setData(EMPTY); setMode('missing'); return; }
        const x = d as Record<string, Row[]>;
        setData({
          sessions: x.sessions.map(s => ({ id: s.code, title: '', type: s.type, topic: s.topic, target_group: '', hospital_id: s.hospital_id, ward_id: s.ward_id, date: s.session_date, trainer: '', duration_minutes: s.duration_minutes, venue: '', status: s.status, capacity: s.capacity })),
          attendance: x.attendance.map(a => ({ session_id: a.session, staff_number: '', name: '', person: a.person, ward_id: a.ward_id, role: '', attended: a.attended })),
          certificates: x.certificates.map((c, i) => ({ number: String(i), source: c.source, trainee: '', staff_number: null, ward_id: c.ward_id, title: '', session_id: c.session, score: null, issued_on: c.issued_on })),
          activity: [], exams: [],
        });
        setMode('public');
        return;
      }
      const [s, a, t, c, e] = await Promise.all([
        supabase!.from('training_sessions').select('*').order('session_date'),
        supabase!.from('training_attendance').select('*'),
        supabase!.from('training_activity').select('*').order('activity_date', { ascending: false }),
        supabase!.from('certificates').select('number,source,trainee_name,staff_number,ward_id,title,session_id,score,issued_on').order('number'),
        supabase!.from('exam_attempts').select('trainee_name,ward_id,score,passed,attempted_at,courses(name)'),
      ]);
      if (s.error) { setData(EMPTY); setMode('missing'); return; }
      const code = new Map((s.data ?? []).map(r => [r.id as string, r.code as string]));
      setData({
        sessions: (s.data ?? []).map(r => ({ id: r.code, dbId: r.id, title: r.title, type: r.type, topic: r.topic, target_group: r.target_group, hospital_id: r.hospital_id, ward_id: r.ward_id, date: r.session_date, trainer: r.trainer, duration_minutes: r.duration_minutes, venue: r.venue, status: r.status, capacity: r.capacity })),
        attendance: (a.data ?? []).map(r => ({ dbId: r.id, session_id: code.get(r.session_id) ?? '', staff_number: r.staff_number, name: r.name, ward_id: r.ward_id, role: r.role, attended: r.attended })),
        activity: (t.data ?? []).map(r => ({ id: r.code, dbId: r.id, kind: r.kind, title: r.title, year: Number(String(r.activity_date).slice(0, 4)), date: r.activity_date, presenter: r.presenter, hospital_id: r.hospital_id, session_id: r.session_id ? code.get(r.session_id) ?? null : null, topic: r.topic, file_name: r.file_name, file_path: r.file_path, description: r.description })),
        certificates: (c.data ?? []).map(r => ({ number: r.number, source: r.source, trainee: r.trainee_name, staff_number: r.staff_number, ward_id: r.ward_id, title: r.title ?? '', session_id: r.session_id ? code.get(r.session_id) ?? null : null, score: r.score == null ? null : Number(r.score), issued_on: r.issued_on })),
        exams: (e.data ?? []).map((r: Row) => ({ trainee: r.trainee_name, ward_id: r.ward_id, course: r.courses?.name ?? '', score: Number(r.score), passed: r.passed, date: String(r.attempted_at).slice(0, 10), number: null })),
      });
      setMode('supabase');
    } finally { setLoading(false); }
  }, [hub.loading, remote, signedIn]);
  useEffect(() => { void load(); }, [load]);

  const value = useMemo<Ctx>(() => {
    const local = mode !== 'supabase';
    const dbIdOf = (code: string) => data.sessions.find(s => s.id === code)?.dbId;
    const fail = (msg: string) => msg;
    return {
      ...data, loading, mode,
      saveSession: async s => {
        if (local) { setData(d => ({ ...d, sessions: d.sessions.some(x => x.id === s.id) ? d.sessions.map(x => (x.id === s.id ? s : x)) : [...d.sessions, s].sort((a, b) => a.date.localeCompare(b.date)) })); return null; }
        const row = { code: s.id, title: s.title, type: s.type, topic: s.topic, target_group: s.target_group, hospital_id: s.hospital_id, ward_id: s.ward_id, session_date: s.date, trainer: s.trainer, duration_minutes: s.duration_minutes, venue: s.venue, status: s.status, capacity: s.capacity };
        const { error } = s.dbId ? await supabase!.from('training_sessions').update(row).eq('id', s.dbId) : await supabase!.from('training_sessions').insert(row);
        if (error) return fail('The session could not be saved. Auditor or admin role needed.');
        await load(); return null;
      },
      deleteSession: async id => {
        if (local) { setData(d => ({ ...d, sessions: d.sessions.filter(x => x.id !== id), attendance: d.attendance.filter(a => a.session_id !== id) })); return null; }
        const { error } = await supabase!.from('training_sessions').delete().eq('id', dbIdOf(id)!);
        if (error) return fail('The session could not be deleted. Auditor or admin role needed.');
        await load(); return null;
      },
      saveAttendees: async (sessionId, rows) => {
        if (local) { setData(d => ({ ...d, attendance: [...d.attendance.filter(a => a.session_id !== sessionId), ...rows.map(r => ({ ...r, session_id: sessionId }))] })); return null; }
        const sid = dbIdOf(sessionId)!;
        const { error } = await supabase!.from('training_attendance').upsert(rows.map(r => ({ session_id: sid, staff_number: r.staff_number, name: r.name, ward_id: r.ward_id, role: r.role, attended: r.attended })), { onConflict: 'session_id,staff_number' });
        if (error) return fail('The attendee sheet could not be saved. Auditor or admin role needed.');
        await load(); return null;
      },
      removeAttendee: async (sessionId, staffNumber) => {
        if (local) { setData(d => ({ ...d, attendance: d.attendance.filter(a => !(a.session_id === sessionId && a.staff_number === staffNumber)) })); return null; }
        const { error } = await supabase!.from('training_attendance').delete().eq('session_id', dbIdOf(sessionId)!).eq('staff_number', staffNumber);
        if (error) return fail('The attendee could not be removed.');
        await load(); return null;
      },
      issueCertificates: async sessionId => {
        const session = data.sessions.find(s => s.id === sessionId)!;
        const has = new Set(data.certificates.filter(c => c.session_id === sessionId).map(c => c.staff_number));
        const due = data.attendance.filter(a => a.session_id === sessionId && a.attended && !has.has(a.staff_number)).sort((a, b) => a.name.localeCompare(b.name));
        if (local) {
          const nums = nextCertificateNumbers(data.certificates.map(c => c.number), Number(session.date.slice(0, 4)), due.length);
          const today = new Date().toISOString().slice(0, 10);
          const issued: TrainingCertificate[] = due.map((a, i) => ({ number: nums[i], source: 'session', trainee: a.name, staff_number: a.staff_number, ward_id: a.ward_id, title: session.title, session_id: sessionId, score: null, issued_on: today }));
          setData(d => ({ ...d, certificates: [...d.certificates, ...issued] }));
          return { error: null, issued };
        }
        const { data: rows, error } = await supabase!.rpc('issue_session_certificates', { p_session: session.dbId });
        if (error) return { error: error.message.includes('delivered') ? 'Certificates can only be issued for delivered sessions.' : 'Certificates could not be issued. Auditor or admin role needed.', issued: [] };
        await load();
        const today = new Date().toISOString().slice(0, 10);
        return { error: null, issued: (rows as Row[]).map(r => { const a = due.find(x => x.dbId === r.attendance_id); return { number: r.number, source: 'session', trainee: r.trainee_name, staff_number: a?.staff_number ?? null, ward_id: a?.ward_id ?? null, title: session.title, session_id: sessionId, score: null, issued_on: today }; }) };
      },
      storeCertificatePdf: async (number, blob) => {
        if (local) return;
        await supabase!.storage.from('certificates').upload(`${number.slice(8, 12)}/${number}.pdf`, blob, { upsert: true, contentType: 'application/pdf' });
        await supabase!.from('certificates').update({ pdf_path: `${number.slice(8, 12)}/${number}.pdf` }).eq('number', number);
      },
      saveActivity: async (a, file) => {
        if (local) { setData(d => ({ ...d, activity: d.activity.some(x => x.id === a.id) ? d.activity.map(x => (x.id === a.id ? a : x)) : [a, ...d.activity] })); return null; }
        let file_path = a.file_path ?? null;
        if (file) {
          file_path = `${a.year}/${a.kind.toLowerCase()}/${crypto.randomUUID()}-${file.name.replace(/[^A-Za-z0-9._-]+/g, '-')}`;
          const up = await supabase!.storage.from('training').upload(file_path, file, { contentType: file.type || undefined });
          if (up.error) return 'The file could not be uploaded. Auditor or admin role needed.';
        }
        const row = { code: a.id, kind: a.kind, title: a.title, activity_date: a.date, presenter: a.presenter, hospital_id: a.hospital_id, session_id: a.session_id ? dbIdOf(a.session_id) ?? null : null, topic: a.topic, description: a.description, file_name: file?.name ?? a.file_name, file_path };
        const { error } = a.dbId ? await supabase!.from('training_activity').update(row).eq('id', a.dbId) : await supabase!.from('training_activity').insert(row);
        if (error) return 'The item could not be saved. Auditor or admin role needed.';
        await load(); return null;
      },
      fileUrl: async path => {
        if (local || !path) return null;
        const { data: u } = await supabase!.storage.from('training').createSignedUrl(path, 300);
        return u?.signedUrl ?? null;
      },
    };
  }, [data, loading, mode, load]);

  return <TrainingContext.Provider value={value}>{children}</TrainingContext.Provider>;
}

export function useTraining() {
  const ctx = useContext(TrainingContext);
  if (!ctx) throw new Error('useTraining must be used inside TrainingProvider');
  return ctx;
}
