# Nursing Audit Hub

Nursing Audit Hub is a responsive React/TypeScript/Vite dashboard prototype for a hospital Nursing Clinical Audit unit. It is a simulation with fictional sample data only and must not be used for clinical or operational decisions.

## Stack

The frontend uses React, TypeScript, Vite, React Router, TanStack Query, Recharts, Lucide icons and jsPDF. The UI follows the supplied formal design system: Source Serif 4 for headings and certificates, IBM Plex Sans for interface text, navy and teal as primary tones, reserved status colours, compact borders and light/dark themes.

Supabase provides the database, authentication boundary and storage model. The browser receives only the public URL and anon key. The migration never requires or stores a service-role key in this repository.

## Run locally

```bash
pnpm install
pnpm dev
```

The development server listens on port 3000. `pnpm check` runs TypeScript checking and `pnpm build` produces the production bundle.

## Production publish

The managed project has server capability enabled, so the publish contract uses the committed `Dockerfile` rather than a static-only upload. The container builds the locked Vite bundle with pnpm, serves `dist/` through Nginx, falls back to `index.html` for React Router routes and exposes an unauthenticated `/health` endpoint for readiness checks. The Webdev deploy declaration points to `Dockerfile` and `/health`.

The final image copies `/app/dist` from the Docker build stage; it does not expect a prebuilt `dist/` directory in the publish context. Container build caching is disabled in the Webdev project configuration while the cache manifest is re-established.

The managed project supplies `SUPABASE_URL` and `SUPABASE_ANON_KEY` as protected environment values. Vite maps these into browser-safe `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` at build time. The anon key is intentionally public; row-level security remains the protection boundary.

## Supabase setup

Run `supabase/migrations/001_nursing_audit_hub_setup.sql` in the Supabase SQL Editor using a project owner/admin role. The migration is intentionally non-destructive: it uses `create ... if not exists`, upserts seed rows and does not drop tables, truncate tables or delete existing rows.

The migration creates the 21 requested application tables, report and certificate sequences, status/overdue functions, overview views, limited certificate verification view, storage buckets (`audit-tools`, `training`, `reports`, `certificates`), RLS policies and the `score_exam` database function. Seed data contains 10 fictional wards, 7 standards, 14 planned audits, 5 unplanned audits, 6 pending audits, 8 action plans, 8 tools, 9 references, 8 reports, 5 quality initiatives, 8 learning resources, 2 courses with 5 questions each and 10 generic liaison nurses.

The `score_exam` function accepts submitted answer indexes, reads correct answers inside Postgres, writes the attempt and issues a certificate when the pass mark is met. Correct answers are not selected or computed in the browser. The public verification view exposes only certificate number, trainee name, course and issue date.

## Roles and access

`user_roles.role` supports `admin`, `auditor` and `viewer`. Viewers can read reference and audit data. Auditors can insert/update audit programme records, reports, action plans, improvement projects and attempts. Admins can manage resources, policies, courses, questions, certificates, liaisons and roles. Certificate exam submission is exposed only through the scoring function, and the verification view is intentionally limited.

The current prototype presents a clearly labelled “Quality admin / Simulation role” shell while real Supabase Auth and role assignment are being connected. No real user or patient data is included.

## Current routes

`/overview`, `/planned`, `/unplanned`, `/pending`, `/actions`, `/tools`, `/reports`, `/standards`, `/initiatives`, `/training`, `/certificates`, `/liaisons` and `/verify/:certificateNumber` are registered. The overview and audit programme are connected to seeded Supabase tables. Resource, report, learning and certificate modules use the same data model and include interactive prototype controls. Reports include reference/history drawers; certificates use the Supabase scoring RPC and client-side A4 landscape PDF generation.

## Storage and external links

Word checklists, training files, report attachments and certificate PDFs are modelled in Supabase Storage. The seeded Microsoft Forms values are safe placeholder URLs for this simulation. Uploads and replacement assets should be performed only by an authenticated admin/auditor after confirming the target bucket and file path.

## Safety note

Simulation with sample data. Not for clinical or operational use.
