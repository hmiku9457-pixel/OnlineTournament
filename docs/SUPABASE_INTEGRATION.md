# Supabase integration — Phase A

## Scope and status

The existing local tournament director remains the authoritative IndexedDB implementation.
This change adds a real database connectivity probe, a browser-side manual connection
test, and a scheduled GitHub Actions health check. It does not yet persist tournaments
in Supabase. No automatic migration or synchronization of existing local test events is planned.

## Configure the project

1. Create or select a Supabase project in an EU region (if creating a new project).
2. For the initial connectivity test, apply only
   `supabase/migrations/0006_database_health.sql` through the Supabase SQL editor
   or the connected Supabase management tool. Do not deploy the old competition
   migrations to a public production project until their RLS, grants, and scoring
   RPCs have been reviewed. If this probe is applied manually, reconcile migration
   history before subsequently running the full migration chain; do not run the
   same migration twice.
3. In GitHub: Settings → Secrets and variables → Actions → Repository secrets,
   set `VITE_SUPABASE_URL` (project URL) and `VITE_SUPABASE_ANON_KEY`
   (publishable key or legacy anon key). Never use a service-role key, database
   password, or secret key in Vite or in this workflow.
4. On the default branch, run Deploy GitHub Pages to rebuild the frontend with
   those values. Open the login page and use “Datenbankverbindung prüfen”.
5. Run Supabase database health manually in Actions. The RPC must return true.
   The scheduled workflow performs the same read-only query at 05:23, 13:23,
   and 21:23 UTC. No tournament or participant records are touched.

The probe table contains only a non-sensitive boolean marker; anonymous and
 authenticated clients can read but cannot modify it. Its RPC uses invoker
 privileges and a fixed search path. Missing config, unavailable
database, or a missing RPC fails the workflow rather than reporting a false success.
Supabase Free project pausing is not guaranteed to be prevented by health checks.
GitHub may disable scheduled workflows on public repositories after 60 days of
repository inactivity. Enable Actions notifications and verify both the project and
workflow before a live event. Do not generate dummy repository commits to hide inactivity.

References:
- https://supabase.com/docs/guides/platform/free-project-pausing
- https://docs.github.com/en/actions/how-tos/manage-workflow-runs/disable-and-enable-workflows

## Remaining integration gates

- Audit 0001–0005 against current local domain: teams and sports, break phases,
  participant IDs, actual and planned schedules, Swiss cutoff fixtures, results,
  approvals, withdrawals, venue layouts and audit events.
- Review public visibility defaults, table-level vs column-level grants, profile
  updates, all SECURITY DEFINER RPCs, auth account restrictions and cross-tournament
  foreign-key invariants. No player or spectator write API is required for the first release.
- Define shared domain commands and separate IndexedDB/PostgreSQL adapters.
- Implement authenticated server-authoritative tournament creation and operation
  with per-tournament revision checks, atomic mutations and idempotency.
- Add tests for RLS (different organizers and anonymous access), invalid commands,
  retry after ambiguous network failures, and restoration before the first online tournament.
- Keep local mode unchanged until parity is verified; no silent switching between
  local and online authority.
