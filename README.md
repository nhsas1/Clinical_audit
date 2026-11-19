# Nursing Audit Hub

A responsive React/TypeScript/Vite dashboard for a hospital nursing clinical audit unit.
**Simulation with fictional sample data only. Not for clinical or operational use.**
No real staff, patient or audit records belong anywhere in this repository or its database.

## Stack

React 18, TypeScript, Vite 6, React Router 7, Recharts, Lucide icons, jsPDF, JSZip and read-excel-file, with Supabase for the database, sign-in and file storage.
The design system uses navy and teal, IBM Plex Sans for interface text, Source Serif 4 for headings and certificates, and colour for status only. Light and dark themes are both supported.

## Run locally

Requires Node 22 or later (pnpm 11 needs it) and pnpm.

```bash
pnpm install
pnpm dev        # http://localhost:3000
pnpm check      # TypeScript
pnpm test       # Vitest unit tests
pnpm build      # production bundle
```

Without Supabase settings the app runs in **sample mode**: it shows the generated fictional data, is labelled "Sample mode", behaves as an admin so every screen can be tried, and saves nothing (page-text edits are kept in that browser only).

To connect Supabase, set these when running or building (Vite maps them to `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`):

```bash
SUPABASE_URL=https://<project>.supabase.co SUPABASE_ANON_KEY=<publishable or anon key> pnpm dev
```

The anon/publishable key is public by design; row level security is the protection. **Never put a service-role key, password or token in the repository or the browser.**

## Data model

| Area | Tables / views |
|---|---|
| Structure | `hospitals`, `departments`, `wards` (unique by hospital + department + name), `standards_topics` |
| Audit programme | `planned_audits`, `unplanned_audits`, `pending_audits`, `action_plans`, `reminders` |
| Reporting | `reports`, `report_references`, `report_status_history`, views `report_register`, `audit_results`, `latest_audit_results`, `compliance_by_standard`, `overview_kpis` |
| Resources | `audit_tools`, `references_library`, `training_resources`, `qi_projects`, `liaisons` |
| Training | `training_sessions`, `training_attendance`, `training_activity`, `courses`, `exam_questions`, `exam_attempts`, `certificates` (one register for sessions and exams) |
| Accounts and text | `user_roles`, `site_content`, `site_content_history` |
| Public functions | `public_dashboard()`, `public_training_dashboard()`, `verify_certificate(number)` (name, session or course, date for one number; no listing) |

Time-dependent statuses (overdue, days waiting, report status) are **derived**, never stored: see `src/lib/derive.ts` and the matching SQL functions. Compliance figures come only from audit results.

**Storage buckets:** `training` (presentations, workshop material, posters) and `certificates` (generated PDFs), plus `audit-tools` and `reports` from the first migration. Signed-in users can read; auditors and admins can upload, replace and delete.

## Roles and access

| Who | Can |
|---|---|
| Signed out | Overview and the Training dashboard tab, using limited public functions with no names, owners, findings or free text; certificate verification |
| `viewer` | Read every page |
| `auditor` | Viewer, plus audit records, reports, action plans, initiatives, the training plan, attendance, activity uploads and issuing certificates |
| `admin` | Everything, including reference data, the liaison directory, roles and page text |

Every new account gets `viewer` automatically (a trigger on `auth.users`). There is no self-registration: create users in the Supabase dashboard (Authentication › Users), then promote the first admin in the SQL editor:

```sql
update public.user_roles set role = 'admin'
where user_id = (select id from auth.users where email = 'someone@example.org');
```

The interface hides actions a role cannot take, but row level security in the database is what enforces it.

**When adding a database function:** Supabase grants `EXECUTE` on new functions in `public` to `anon` and `authenticated` by default. Revoke it explicitly (`revoke execute on function … from public, anon;`) unless signed-out visitors should call it.

## Edit page mode

A signed-in admin can turn on **Edit page** (top right) and click any outlined text, such as page titles, subtitles, section titles, KPI labels, table headers, button labels, empty states, sidebar labels, filter labels or the footer. The editor offers Apply (a draft), Reset to default and History.

- Drafts survive page switches and reloads. Leaving edit mode with drafts shows an in-app prompt (Keep editing / Discard / Save and finish); there are no browser dialogs. "Save changes" publishes everything at once.
- Only changed texts are stored, in `site_content(key, page, value, updated_by, updated_at)`. A missing row means the default in the code applies. Every change and reset is copied to `site_content_history`.
- In code, wrap a string in `<T>…</T>` to make it editable. The key is `<page>.<slug of the default>`; pass `k` to set it yourself. Texts containing digits (live counts) are left out on purpose.

## Training Library

`/training` has six tabs: Dashboard, Yearly plan, Attendance, Training activity, Learning resources and Exams. `/certificates` redirects to the Exams tab.

- **Attendance import:** paste or upload `.xlsx`/`.csv` with the columns name, staff number, hospital, ward, role, attended (the header row is optional). Each row is checked on its own. Where a ward name repeats, write `Ward 33 (Surgical)` or add a department column.
- **Certificates:** issued only for attendees marked attended on a *Delivered* session, by `issue_session_certificates()`. Numbers come from the database sequence (`NA-CERT-YYYY-####`). The app builds A4 landscape PDFs with a double navy border, downloads one or a ZIP of all, and stores copies in the `certificates` bucket. `/verify/<number>` is public and shows only the name, the session or course, and the date.

## Fictional data and migrations

All sample data comes from **one generator**, so the embedded app data and the database seed always match:

```bash
pnpm seed:generate   # reads src/lib/hierarchy.json
```

It writes `src/lib/seed.generated.json` and migrations 003, 004 and 008. Edit `src/lib/hierarchy.json` (hospitals › departments › wards) and run it again. It is deterministic: the same input gives the same output. About 40% of wards get recent activity, and liaisons cover every ward (about 70% trained). Names are a given name plus an initial; staff are "Auditor N" and "Educator N".

Migrations, in order:

| File | What it does |
|---|---|
| `001_nursing_audit_hub_setup.sql` | Original schema, RLS, `score_exam`, buckets, first sample |
| `002_review_fixes.sql` | Audit links, consistent sample statuses, report history and references, audit-result views, no hospital-wide compliance figure |
| `003_hospital_hierarchy.sql` *(generated)* | Hospitals, departments, the 123 wards, `ward_id_by_key()` |
| `004_reseed_fictional_data.sql` *(generated)* | **Replaces the sample audit activity** and the 10 old sample wards |
| `005_auth_roles.sql` | Default viewer role, `my_role()`, sign-in-only reads, `public_dashboard()` |
| `006_site_content.sql` | Editable page text and its history |
| `007_training.sql` | Training tables, certificate register, storage policies, `public_training_dashboard()` |
| `008_seed_training.sql` *(generated)* | **Replaces the sample training data** |
| `009_security_hardening.sql` | Closes gaps found on a real Supabase project: Supabase grants new functions to `anon` by default, so exam scoring and certificate numbers are restricted explicitly; verification by number only; `search_path` and index fixes |

**Apply them to a Supabase branch or a dev project first, never straight to production.** For example, with the Supabase CLI linked to a branch run `supabase db push`, or paste each file into the SQL editor of the dev project in order. All files are safe to run again. 004 and 008 delete and re-insert *sample* rows only.

Until migration 003 has been applied, the app keeps showing its embedded sample, so it never mixes the old flat data with the new structure.

## Production publish

The `Dockerfile` builds the Vite bundle with pnpm and serves `dist/` through Nginx with a fallback to `index.html` for client routes, so every route loads directly and after a refresh. `/health` is the readiness endpoint. The hosting project supplies `SUPABASE_URL` and `SUPABASE_ANON_KEY` at build time.

## Safety note

Simulation with sample data. Not for clinical or operational use.
