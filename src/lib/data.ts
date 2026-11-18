// Fictional sample data — the single embedded source of truth used when
// Supabase is not configured or a table is empty. All names are generic
// placeholders. Statuses that depend on time (overdue, days waiting, report
// status) are NOT stored here; they are derived in ./derive.ts.

export type Ward = { id: string; name: string };
export type Topic = { id: string; name: string };

export type PlannedStatus = 'Completed' | 'In progress' | 'Scheduled' | 'Overdue';
export type PlannedAudit = {
  ref: string; topic: string; ward: string; quarter: string; due_date: string;
  auditor: string; status: PlannedStatus; score: number | null;
};
export type UnplannedAudit = {
  ref: string; trigger_type: string; subject: string; ward: string; raised_on: string;
  priority: 'Low' | 'Medium' | 'High'; status: 'Open' | 'In progress' | 'Closed';
  description: string; topic?: string | null; score?: number | null;
};
export type PendingAudit = { id: string; audit_ref: string; ward: string; waiting_for: string; since_date: string; owner: string };
export type ActionPlan = {
  ref: string; topic: string; ward: string; finding: string; owner: string;
  due_date: string; progress: number; status: 'Open' | 'Overdue' | 'Closed'; audit_ref?: string | null;
};
export type ReportStage = 'Drafted' | 'Peer reviewed' | 'Approved' | 'Published' | 'Action plan agreed';
export type Report = {
  serial: string; title: string; ward: string; audit_ref: string;
  history: { stage: ReportStage; date: string }[];
  references: string[];
};
export type ReferenceKind = 'External standard' | 'Internal policy' | 'Audit method';
export type Reference = { code: string; title: string; kind: ReferenceKind; url: string };
export type Initiative = {
  ref: string; title: string; ward: string; category: string; stage: 'Plan' | 'Do' | 'Study' | 'Act';
  progress: number; lead: string; measure: string;
};
export type Liaison = {
  ward: string; name: string; role: string; ext: string;
  training_status: 'Trained' | 'Refresher due' | 'Not yet trained'; last_meeting: string;
};
export type CertificateRecord = { trainee: string; ward: string; course: string; score: number; number: string | null };

export const PASS_MARK = 80;

export const wardNames = ['ICU', 'Medical A', 'Medical B', 'Surgical A', 'Surgical B', 'Paediatrics', 'Maternity', 'ED', 'Orthopaedics', 'Oncology'];
export const topicNames = ['Hand Hygiene', 'Medication Safety', 'Patient ID', 'Pressure Injury', 'Falls Prevention', 'IV Cannula', 'Documentation'];
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
export const fallbackWards: Ward[] = wardNames.map(name => ({ id: slug(name), name }));
export const fallbackTopics: Topic[] = topicNames.map(name => ({ id: slug(name), name }));

type PlannedRow = [string, string, string, string, string, string, PlannedStatus, number | null];
export const fallbackPlanned: PlannedAudit[] = ([
  ['PA-001', 'Hand Hygiene', 'ICU', 'Q1', '2026-03-15', 'Auditor 1', 'Completed', 94],
  ['PA-002', 'Medication Safety', 'Medical A', 'Q1', '2026-03-28', 'Auditor 2', 'Completed', 88],
  ['PA-003', 'Patient ID', 'Surgical A', 'Q1', '2026-03-30', 'Auditor 1', 'Completed', 92],
  ['PA-004', 'Pressure Injury', 'Medical B', 'Q2', '2026-05-14', 'Auditor 3', 'Completed', 79],
  ['PA-005', 'Falls Prevention', 'ED', 'Q2', '2026-06-12', 'Auditor 2', 'Completed', 83],
  ['PA-006', 'IV Cannula', 'Oncology', 'Q2', '2026-06-28', 'Auditor 1', 'Completed', 91],
  ['PA-007', 'Documentation', 'Paediatrics', 'Q3', '2026-08-20', 'Auditor 3', 'Completed', 82],
  ['PA-008', 'Hand Hygiene', 'Maternity', 'Q3', '2026-09-15', 'Auditor 2', 'Scheduled', null],
  ['PA-009', 'Medication Safety', 'Medical B', 'Q3', '2026-09-22', 'Auditor 1', 'Scheduled', null],
  ['PA-010', 'Patient ID', 'Orthopaedics', 'Q3', '2026-10-10', 'Auditor 3', 'In progress', null],
  ['PA-011', 'Pressure Injury', 'Surgical B', 'Q4', '2026-11-12', 'Auditor 2', 'Scheduled', null],
  ['PA-012', 'Falls Prevention', 'Medical A', 'Q4', '2026-11-18', 'Auditor 1', 'Scheduled', null],
  ['PA-013', 'IV Cannula', 'ICU', 'Q4', '2026-12-03', 'Auditor 3', 'Scheduled', null],
  ['PA-014', 'Documentation', 'Oncology', 'Q4', '2026-12-15', 'Auditor 2', 'Scheduled', null],
] as PlannedRow[]).map(([ref, topic, ward, quarter, due_date, auditor, status, score]) => ({ ref, topic, ward, quarter, due_date, auditor, status, score }));

export const fallbackUnplanned: UnplannedAudit[] = [
  { ref: 'UA-001', trigger_type: 'Incident report', subject: 'Medication omission review', ward: 'Medical B', raised_on: '2026-10-05', priority: 'High', status: 'In progress', description: '', topic: 'Medication Safety' },
  { ref: 'UA-002', trigger_type: 'Patient complaint', subject: 'Communication at handover', ward: 'Surgical A', raised_on: '2026-09-18', priority: 'Medium', status: 'Open', description: '' },
  { ref: 'UA-003', trigger_type: 'Infection alert', subject: 'Cannula care observations', ward: 'ED', raised_on: '2026-10-22', priority: 'High', status: 'Open', description: '', topic: 'IV Cannula' },
  { ref: 'UA-004', trigger_type: 'Risk register', subject: 'Falls prevention rounding', ward: 'Orthopaedics', raised_on: '2026-08-30', priority: 'Medium', status: 'Closed', description: '', topic: 'Falls Prevention', score: 88 },
  { ref: 'UA-005', trigger_type: 'Management request', subject: 'Documentation completeness', ward: 'Oncology', raised_on: '2026-10-28', priority: 'Low', status: 'Open', description: '', topic: 'Documentation' },
];

// Explicit, valid ISO dates. Overdue planned audits with no row here are
// added to the queue automatically by derive.pendingQueue().
export const fallbackPending: PendingAudit[] = [
  { id: 'pq-1', audit_ref: 'PA-007', ward: 'Paediatrics', waiting_for: 'Awaiting sign-off', since_date: '2026-09-04', owner: 'Owner 3' },
  { id: 'pq-2', audit_ref: 'PA-008', ward: 'Maternity', waiting_for: 'Awaiting data collection', since_date: '2026-09-15', owner: 'Owner 1' },
  { id: 'pq-3', audit_ref: 'PA-009', ward: 'Medical B', waiting_for: 'Awaiting data collection', since_date: '2026-09-22', owner: 'Owner 2' },
  { id: 'pq-4', audit_ref: 'UA-002', ward: 'Surgical A', waiting_for: 'Awaiting auditor allocation', since_date: '2026-09-29', owner: 'Owner 5' },
  { id: 'pq-5', audit_ref: 'PA-010', ward: 'Orthopaedics', waiting_for: 'Awaiting analysis', since_date: '2026-10-10', owner: 'Owner 4' },
  { id: 'pq-6', audit_ref: 'UA-001', ward: 'Medical B', waiting_for: 'Awaiting report', since_date: '2026-10-19', owner: 'Owner 3' },
];

export const fallbackActions: ActionPlan[] = [
  { ref: 'AP-001', topic: 'Hand Hygiene', ward: 'ICU', finding: 'Missed hand hygiene opportunity at bay entrance.', owner: 'Owner 1', due_date: '2026-11-20', progress: 72, status: 'Open', audit_ref: 'PA-001' },
  { ref: 'AP-002', topic: 'Medication Safety', ward: 'Medical A', finding: 'Second-check documentation incomplete.', owner: 'Owner 2', due_date: '2026-10-15', progress: 45, status: 'Open', audit_ref: 'PA-002' },
  { ref: 'AP-003', topic: 'Patient ID', ward: 'Surgical A', finding: 'Two identifiers not consistently verbalised.', owner: 'Owner 3', due_date: '2026-12-01', progress: 60, status: 'Open', audit_ref: 'PA-003' },
  { ref: 'AP-004', topic: 'Pressure Injury', ward: 'Medical B', finding: 'Risk reassessment not visible in notes.', owner: 'Owner 4', due_date: '2026-09-30', progress: 30, status: 'Open', audit_ref: 'PA-004' },
  { ref: 'AP-005', topic: 'Falls Prevention', ward: 'ED', finding: 'Rounding prompt needs standardisation.', owner: 'Owner 5', due_date: '2026-12-15', progress: 80, status: 'Open', audit_ref: 'PA-005' },
  { ref: 'AP-006', topic: 'IV Cannula', ward: 'Oncology', finding: 'Daily site review field inconsistently completed.', owner: 'Owner 1', due_date: '2026-08-30', progress: 100, status: 'Closed', audit_ref: 'PA-006' },
];

export const fallbackReferences: Reference[] = [
  { code: 'WHO-HH-2009', title: 'WHO Guidelines on Hand Hygiene in Health Care (2009)', kind: 'External standard', url: 'https://www.who.int/publications/i/item/9789241597906' },
  { code: 'HQIP-BPCA', title: 'HQIP Best Practice in Clinical Audit', kind: 'Audit method', url: 'https://www.hqip.org.uk/guidance/best-practice-in-clinical-audit/' },
  { code: 'NPIAP-EPUAP', title: 'International Guideline on Prevention and Treatment of Pressure Ulcers/Injuries', kind: 'External standard', url: '' },
  { code: 'POL-HH', title: 'Hand hygiene policy — internal code to be added', kind: 'Internal policy', url: '' },
  { code: 'POL-MED', title: 'Medication management policy — internal code to be added', kind: 'Internal policy', url: '' },
  { code: 'POL-ID', title: 'Patient identification policy — internal code to be added', kind: 'Internal policy', url: '' },
  { code: 'POL-PI', title: 'Pressure injury prevention policy — internal code to be added', kind: 'Internal policy', url: '' },
  { code: 'POL-FALLS', title: 'Falls prevention policy — internal code to be added', kind: 'Internal policy', url: '' },
  { code: 'POL-IV', title: 'Peripheral IV cannula policy — internal code to be added', kind: 'Internal policy', url: '' },
  { code: 'POL-DOC', title: 'Nursing documentation policy — internal code to be added', kind: 'Internal policy', url: '' },
];

// Each report belongs to exactly one audit; its score, ward and topic come
// from that audit. Status is the last stage reached in `history`.
export const fallbackReports: Report[] = [
  { serial: 'NA-2026-001', title: 'Hand hygiene audit — ICU', ward: 'ICU', audit_ref: 'PA-001', references: ['WHO-HH-2009', 'POL-HH', 'HQIP-BPCA'],
    history: [{ stage: 'Drafted', date: '2026-03-20' }, { stage: 'Peer reviewed', date: '2026-03-24' }, { stage: 'Approved', date: '2026-03-26' }, { stage: 'Published', date: '2026-03-27' }, { stage: 'Action plan agreed', date: '2026-04-02' }] },
  { serial: 'NA-2026-002', title: 'Medication safety audit — Medical A', ward: 'Medical A', audit_ref: 'PA-002', references: ['POL-MED', 'HQIP-BPCA'],
    history: [{ stage: 'Drafted', date: '2026-04-02' }, { stage: 'Peer reviewed', date: '2026-04-06' }, { stage: 'Approved', date: '2026-04-09' }, { stage: 'Published', date: '2026-04-10' }, { stage: 'Action plan agreed', date: '2026-04-17' }] },
  { serial: 'NA-2026-003', title: 'Patient identification audit — Surgical A', ward: 'Surgical A', audit_ref: 'PA-003', references: ['POL-ID', 'HQIP-BPCA'],
    history: [{ stage: 'Drafted', date: '2026-04-06' }, { stage: 'Peer reviewed', date: '2026-04-09' }, { stage: 'Approved', date: '2026-04-13' }, { stage: 'Published', date: '2026-04-14' }, { stage: 'Action plan agreed', date: '2026-04-21' }] },
  { serial: 'NA-2026-004', title: 'Pressure injury prevention audit — Medical B', ward: 'Medical B', audit_ref: 'PA-004', references: ['NPIAP-EPUAP', 'POL-PI', 'HQIP-BPCA'],
    history: [{ stage: 'Drafted', date: '2026-05-20' }, { stage: 'Peer reviewed', date: '2026-05-25' }, { stage: 'Approved', date: '2026-05-29' }] },
  { serial: 'NA-2026-005', title: 'Falls prevention audit — ED', ward: 'ED', audit_ref: 'PA-005', references: ['POL-FALLS', 'HQIP-BPCA'],
    history: [{ stage: 'Drafted', date: '2026-06-19' }, { stage: 'Peer reviewed', date: '2026-06-23' }, { stage: 'Approved', date: '2026-06-25' }, { stage: 'Published', date: '2026-06-26' }, { stage: 'Action plan agreed', date: '2026-07-03' }] },
  { serial: 'NA-2026-006', title: 'IV cannula care audit — Oncology', ward: 'Oncology', audit_ref: 'PA-006', references: ['POL-IV', 'HQIP-BPCA'],
    history: [{ stage: 'Drafted', date: '2026-07-03' }, { stage: 'Peer reviewed', date: '2026-07-07' }, { stage: 'Approved', date: '2026-07-09' }, { stage: 'Published', date: '2026-07-10' }, { stage: 'Action plan agreed', date: '2026-07-14' }] },
  { serial: 'NA-2026-007', title: 'Documentation audit — Paediatrics', ward: 'Paediatrics', audit_ref: 'PA-007', references: ['POL-DOC', 'HQIP-BPCA'],
    history: [{ stage: 'Drafted', date: '2026-08-28' }, { stage: 'Peer reviewed', date: '2026-09-04' }] },
  { serial: 'NA-2026-008', title: 'Falls prevention rounding review — Orthopaedics', ward: 'Orthopaedics', audit_ref: 'UA-004', references: ['POL-FALLS', 'HQIP-BPCA'],
    history: [{ stage: 'Drafted', date: '2026-09-11' }, { stage: 'Peer reviewed', date: '2026-09-14' }, { stage: 'Approved', date: '2026-09-16' }, { stage: 'Published', date: '2026-09-18' }] },
];

export const fallbackInitiatives: Initiative[] = [
  { ref: 'QI-001', title: 'Improve bedside handover reliability', ward: 'ICU', category: 'Communication', stage: 'Study', progress: 68, lead: 'Lead 1', measure: 'Handovers complete: 89%' },
  { ref: 'QI-002', title: 'Reduce missed medication checks', ward: 'Medical A', category: 'Medication safety', stage: 'Do', progress: 44, lead: 'Lead 2', measure: 'Second checks done: 84%' },
  { ref: 'QI-003', title: 'Pressure injury prevention bundle', ward: 'Medical B', category: 'Pressure injury', stage: 'Plan', progress: 25, lead: 'Lead 3', measure: 'Bundle use: 70%' },
  { ref: 'QI-004', title: 'Falls rounding reliability', ward: 'Orthopaedics', category: 'Falls', stage: 'Act', progress: 90, lead: 'Lead 4', measure: 'Rounds completed: 92%' },
  { ref: 'QI-005', title: 'Documentation improvement', ward: 'Oncology', category: 'Documentation', stage: 'Do', progress: 52, lead: 'Lead 5', measure: 'Records complete: 81%' },
];

export const fallbackLiaisons: Liaison[] = [
  ['ICU', 'Liaison Nurse 1', '401', 'Trained', '2026-10-24'], ['Medical A', 'Liaison Nurse 2', '402', 'Trained', '2026-10-20'],
  ['Medical B', 'Liaison Nurse 3', '403', 'Trained', '2026-10-16'], ['Surgical A', 'Liaison Nurse 4', '404', 'Trained', '2026-10-12'],
  ['Surgical B', 'Liaison Nurse 5', '405', 'Trained', '2026-10-08'], ['Paediatrics', 'Liaison Nurse 6', '406', 'Trained', '2026-10-04'],
  ['Maternity', 'Liaison Nurse 7', '407', 'Trained', '2026-09-30'], ['ED', 'Liaison Nurse 8', '408', 'Refresher due', '2026-09-23'],
  ['Orthopaedics', 'Liaison Nurse 9', '409', 'Refresher due', '2026-09-18'], ['Oncology', 'Liaison Nurse 10', '410', 'Not yet trained', '2026-09-10'],
].map(([ward, name, ext, training_status, last_meeting]) => ({ ward, name, role: 'Quality liaison', ext, training_status: training_status as Liaison['training_status'], last_meeting }));

export const fallbackCertificates: CertificateRecord[] = [
  { trainee: 'Trainee Nurse A', ward: 'ICU', course: 'Hand Hygiene: Five Moments', score: 100, number: 'NA-CERT-2026-0001' },
  { trainee: 'Trainee Nurse B', ward: 'Medical A', course: 'Medication Safety: Administration Checks', score: 60, number: null },
  { trainee: 'Trainee Nurse C', ward: 'ED', course: 'Hand Hygiene: Five Moments', score: 80, number: 'NA-CERT-2026-0002' },
];
