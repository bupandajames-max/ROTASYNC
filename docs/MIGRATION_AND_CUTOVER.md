# Migration, Parallel Run, Cutover & Rollback

Working rule: **Firebase stays live and authoritative until the new system is
verified.** Nothing below disrupts current users until the final flip, and the
flip itself is reversible.

## Recommended strategy: phased cutover with a one-shot migration + short freeze

Considered and rejected for v1:
- **Dual-write from the SPA** (client writes to both backends): doubles every
  failure mode in the least reliable place (user devices, flaky connections),
  and inconsistencies are unresolvable after the fact. Not worth it at this
  data volume.
- **Continuous CDC mirror**: Firestore→Postgres streaming needs Cloud
  Functions + infra that outlives the migration. Overkill for tens of users.

Chosen: **read-only mirror for verification → brief write-freeze → final sync
→ flip**. Total user-visible impact: minutes of read-only mode, announced.

## Phase 0 — now (done in this repo)

- `backend/` skeleton with tenant isolation (3 layers) and isolation test.
- Firebase app untouched, still deploying from the repo root.

## Phase 1 — build out the API (Firebase untouched)

1. Implement remaining endpoints per `API_CONTRACT.md` (staff slice is the
   template; each entity is mechanical from here).
2. Deploy API + Postgres to the parallel environment (below). Seed a **test
   tenant only**.
3. Point a **staging build** of the SPA (`VITE_DATA_BACKEND=api`) at it.
   Production SPA still ships `firebase`.
4. Exit criteria: staging passes the same live-verification pass we ran on
   Firebase (manager + member personas, cross-department isolation, invite
   flow, roster round-trip, timesheet lifecycle).

## Phase 2 — data migration tooling

One Node script (runs locally with a Firebase service account + `DATABASE_URL`):

```
scripts/migrate-firestore-to-pg.ts
  1. export: read all collections per facility (staff, cycles+shards,
     dailyTasks, timesheets, approvals, extraHours, workspaceConfigs,
     organizations, users, invites) → newline-JSON files (kept as backup)
  2. transform: Firestore doc ids → deterministic UUIDs (uuidv5 of old id,
     stored in a legacy_id column mapping table for traceability);
     cycle shard docs → roster_assignments rows; emails → app_users +
     memberships (accessLevel → role mapping: superuser→ORG_ADMIN,
     facility_manager/dept_head→MANAGER, staff→MEMBER)
  3. load: upsert into Postgres inside one transaction per tenant,
     with app.bypass_rls='on' (migration role only)
  4. verify: row counts + per-entity field-level diff report (old vs new),
     fails loudly on any mismatch
```

The script is **idempotent** (upserts keyed by legacy id) so it can run
repeatedly: full rehearsals against staging, then the real run at cutover.

## Phase 3 — parallel run (read-only mirror)

1. Run the migration script against production Firebase → production Postgres.
2. Give pilot users (you + one manager + one member) a **second URL**
   (`beta.rotasync.app`, the `api`-mode SPA). They use it alongside the main
   app for a week; writes to beta are allowed but treated as throwaway, OR
   beta is deployed with writes disabled (`VITE_READ_ONLY=1`) — recommended.
3. Re-run the migration nightly; the verify step reports drift. This proves
   the transform handles live data shapes, not just a snapshot.
4. Exit criteria: one clean week — no missing data, no isolation findings,
   no shape mismatches.

## Phase 4 — cutover (the only user-visible step)

Announced window, low-traffic hour:

1. **Freeze writes** on Firebase: deploy a one-line `firestore.rules` change
   (`allow write: if false` on operational collections). Users can still read;
   the SPA's existing permission-banner explains saves are paused. (~1 min)
2. Run the migration script one final time; verify report must be clean. (~minutes)
3. Flip production SPA env to `VITE_DATA_BACKEND=api` + `VITE_API_BASE_URL`,
   redeploy static site. (~2 min on Render/Cloudflare)
4. Users reload (or are prompted to); same login, same screens, same data.
5. Keep Firebase in read-only mode — it is now the **hot rollback copy**.

## Rollback (any time in the first 2 weeks)

- Trigger: any data-integrity or isolation issue that can't be fixed forward
  within an hour.
- Action: revert the SPA env to `firebase`, redeploy (~2 min), restore the
  original `firestore.rules` (writes re-enabled). Firebase data is at most
  "cutover + minutes" stale, and the freeze guaranteed nothing diverged
  during migration.
- Writes made to Postgres after cutover are exported by re-running the
  migration script's diff in reverse (report-only) so nothing is silently lost;
  at this product's write volume a manual re-entry list is acceptable.
- After 2 clean weeks: lift the freeze rule to `allow read, write: if false`,
  export a final Firestore backup to storage, downgrade/delete the Firebase
  project on your schedule.

## Parallel deployment (low-cost targets)

| Piece | Where | Cost |
|---|---|---|
| PostgreSQL | Neon free tier (0.5 GB, autosuspend) or Supabase free | $0 |
| Spring API | Render free web service (Docker, same account as today) — accepts cold starts like the current app; upgrade to $7 Starter to remove them | $0–7/mo |
| SPA | Keep current Render static site; beta site as a second static deploy | $0 |
| Firebase | Auth stays (free tier); Firestore decommissioned post-cutover | $0 |

Notes:
- JVM on a 512 MB free instance: run with `-XX:MaxRAMPercentage=75` and
  Hikari pool ≤ 5 (already the default in `application.yml`) — fits Neon's
  free connection limits too.
- Add `Dockerfile` (eclipse-temurin:21-jre, layered Spring Boot jar) when
  deploying; Render builds it directly from the repo subdirectory.

## Risk register

| Risk | Mitigation |
|---|---|
| Migration transform misses a data shape | Nightly rehearsal in Phase 3 against live data + field-level verify report |
| JVM cold starts on free tier annoy users | Same behavior as today's Render free tier; $7 upgrade removes it |
| A future endpoint forgets tenant scoping | Impossible to forget at the query layer (filter is transaction-armed) + RLS backstop + isolation test in CI |
| Firebase token verification breaks | Standard OIDC via Google JWKS, no custom code; dev-mode decoder for local work |
| Postgres free-tier limits (storage/connections) | Current dataset is KBs; Hikari capped at 5; Neon autosuspend is fine for this traffic |
