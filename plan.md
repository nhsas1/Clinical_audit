# Nursing Audit Hub — implementation plan

## Product and delivery
Build the full twelve-module fictional-data simulation described in the supplied brief. The interface will explicitly say “Simulation with sample data. Not for clinical or operational use.” No real people or patient data will be used.

Use React, TypeScript, Vite, Tailwind CSS, shadcn/ui primitives, Recharts, React Router, TanStack Query and jsPDF. Supabase remains the requested database, email/password authentication and storage provider. Prepare SQL migrations, seed data, role-based RLS, database-generated report/certificate serials, secure server-side exam scoring, overdue functions and overview views. Connect version control to the user's GitHub using the platform's repository confirmation workflow.

A Supabase project URL and anon key, plus permission/access to apply migrations, are not supplied. Proposed approach: build a clearly labelled local simulation backed by fictional seed data and browser persistence alongside the real Supabase adapter. This makes the prototype immediately interactive; Supabase authentication, durable storage, database RLS and production certificate verification can only be confirmed after the user's Supabase project is configured. Never impersonate a real logged-in user. Demo roles are explicitly labelled simulation controls. Keep correct exam answers out of client bundles; a small Express server scores demo exams, while Supabase uses a Postgres RPC. Demo certificates use server-generated numbers; configured Supabase certificates use its database sequence.

## Five build phases
1. Design tokens, responsive shell, routes, theme switch, shared primitives, auth interface, data services, SQL migrations and consistent seeds. Verify compilation and seed invariants before proceeding.
2. Overview KPIs, trend, standards bars, ward heatmap, attention/upcoming lists and audit cycle; planned, unplanned and pending audit routes with working filters, forms, edits and simulated reminder logging.
3. Action progress/status updates, tool resource cards and admin replacement/link editing, reports with search/sort/status filters, reference and history drawers and report uploads.
4. Standards link editing, QI PDSA cards and editing, training resources, searchable/editable liaison directory.
5. Both five-question exams, server-scored attempts, automatic landscape certificate PDF, preview, register and limited public verification route.

For each phase, run available compile/type and targeted data/server checks before continuing. Finish with one independent read-only code review against the brief. Maintain full acceptance clauses and honest unresolved integration states in TODO.md. Include setup, environment variables, migrations, seeds and role model in README.md.

## Design
Reuse the user's formal, calm hospital design: light background #F3F5F7, white surfaces, navy #1F4E79, teal #2B7A78; thin borders and 4–6px radii with no gradients or heavy shadows. Status colours are reserved for status/compliance only. Dark mode follows the specified dark palette.

- **Design movement:** Swiss institutional information design, softened by serif editorial titles.
- **Principles:** clarity over decoration, data density with breathing room, consistent status semantics, accessible interactions.
- **Layout:** 236px grouped left navigation, slim top utility/filter bar and expansive content workspace; mobile navigation becomes a horizontal scrollable bar, with horizontally scrollable wide tables.
- **Signature elements:** compact navy audit-ledger mark, serif page titles with section eyebrows, understated target annotations and rule-separated data.
- **Interaction:** persistent global ward selection, visible focus rings, labelled inputs, drawer-based editing, concise confirmation toasts and in-interface confirmation for destructive actions.
- **Motion:** restrained 120–180ms hover/drawer transitions; respect reduced-motion preferences.
- **Typography:** Source Serif 4 page/certificate headings; IBM Plex Sans UI and body; tabular numerals on every metric.
- **Brand essence:** a clear working view of nursing audit and improvement. Professional, measured, accountable.
- **Voice:** factual, reassuring and direct. “A clearer view of quality.” “6 audits need your attention.”
- **Wordmark:** audit-ledger/page motif next to the two-line Nursing Audit Hub name.
- **Signature colour:** institutional navy, used for navigation and primary actions.

## Project structure
- `src/app/`: routes, shell, global ward/theme/auth state.
- `src/components/shared/`: StatusPill, KpiTile, DataTable, Drawer, BandBadge and filter controls.
- `src/components/ui/`: shadcn-style accessible Radix primitives.
- `src/modules/<module>/`: one folder per requested module with page, forms and module helpers.
- `src/data/`: typed fictional seed data and invariants.
- `src/lib/`: query/Supabase services, formatting, certificate PDF helpers and upload handling.
- `server/`: Express/Vite serving, server-only demo questions/answers, scoring and certificate verification service. Environment-configured Supabase scoring uses RPC rather than client answer keys.
- `supabase/migrations/`: schema, role policies, storage policies, sequences, views and RPCs.
- `supabase/seed.sql`: complete consistent fictional dataset.
- `public/`: brand mark, route manifest and clearly labelled sample downloadable resources.
- root: build configuration, Dockerfile, README, plan and acceptance TODO.

## Serving
Development server listens on 0.0.0.0:3000 and serves both Vite and `/api` demo exam endpoints. Production uses an Express container serving the compiled SPA and API with `/api/health` readiness. Browser-facing API/resource URLs remain relative. Supabase uses only the anon/publishable key on the client; no service role key is committed or exposed.

## Material limitations
Supabase infrastructure cannot be provisioned or migration-applied without user configuration/access. Microsoft Forms URLs and Word/report/training files are not supplied; seed resources will be labelled simulated samples, with unavailable external forms honestly identified. GitHub connection requires the owner to approve the repository card. These are integration blockers, not grounds to claim the application is clinically usable.
