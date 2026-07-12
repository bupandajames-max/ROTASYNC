# RotaSync API (Spring Boot / PostgreSQL)

Parallel replacement backend for the Firebase production app. Firebase **stays
live** while this is built out; see `../docs/MIGRATION_AND_CUTOVER.md`.

## Stack

- Java 21, Spring Boot 3.3 (web, data-jpa, security, oauth2-resource-server)
- PostgreSQL 15+ with Flyway migrations
- Shared-schema multi-tenancy (`tenant_id` on every tenant-owned table)

## Tenant isolation — three layers, all mandatory

| Layer | Mechanism | Covers |
|---|---|---|
| 1 | Hibernate `@Filter` on `TenantOwnedEntity`, armed per-transaction by `TenantTransactionAspect` | Every JPQL/derived query |
| 2 | `TenantEntityListener` (`@PrePersist/@PreUpdate/@PreRemove`) | Writes: stamps + verifies `tenant_id` |
| 3 | PostgreSQL Row-Level Security (`V2` migration) driven by `set_config('app.tenant_id', …, true)` | Everything, incl. native SQL and future bugs. Fail-closed: no setting ⇒ no rows |

Rules that keep the layers airtight:

- **Never** use `findById()` / `getReferenceById()` on tenant entities —
  Hibernate filters do not apply to `em.find()`. Use a derived query
  (`findOneById`) as in `StaffRepository`.
- Services are the transaction boundary (`@Transactional` on the class);
  the aspect arms both layers there. Don't query from controllers.
- Cross-tenant lookups exist in exactly one place: membership resolution at
  login (`MembershipRepository.findActiveByUserId`).
- Tenant violations respond **404**, never 403 — existence is information.

## Identity model during migration

Firebase Auth remains the IdP. The SPA sends the same Firebase ID token it
already has; this API verifies it as a standard OIDC JWT
(`issuer: securetoken.google.com/<project>`). Users notice nothing. Auth can
be swapped later (or never) without touching data.

## Run locally

```bash
# 1. PostgreSQL
docker run -d --name rotasync-pg -e POSTGRES_DB=rotasync \
  -e POSTGRES_USER=rotasync_app -e POSTGRES_PASSWORD=rotasync \
  -p 5432:5432 postgres:16-alpine

# 2. API (Flyway migrates on boot)
mvn spring-boot:run
# dev-mode auth (no Firebase needed):
APP_SECURITY_MODE=dev mvn spring-boot:run
```

Requirements: JDK 21, Maven 3.9+, Docker (for the DB and for tests).

## Tests

```bash
mvn test                       # all
mvn test -Dtest=TenantIsolationTest   # the isolation proof (needs Docker)
```

`TenantIsolationTest` spins up a throwaway PostgreSQL and proves:
JPA-layer isolation (list + by-id probe + cross-tenant delete), fail-closed
writes with no tenant bound, and — via a **non-superuser** JDBC connection,
matching production — that RLS returns zero rows without a tenant binding,
scopes reads with one, resets on rollback, and rejects cross-tenant inserts.

## Production role setup (one-time, per environment)

The app must **not** connect as a superuser (superusers bypass RLS):

```sql
CREATE ROLE rotasync_app LOGIN PASSWORD '...';
GRANT USAGE ON SCHEMA public TO rotasync_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO rotasync_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO rotasync_app;
```

Run Flyway with the owner role (e.g. via `FLYWAY_*` env vars or a separate
migration step) and the app with `rotasync_app`.

## Environment variables

| Var | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `jdbc:postgresql://localhost:5432/rotasync` | JDBC URL |
| `DATABASE_USER` / `DATABASE_PASSWORD` | `rotasync_app` / `rotasync` | app credentials |
| `FIREBASE_PROJECT_ID` | `rotasync-prod` | JWT issuer/audience |
| `APP_SECURITY_MODE` | `firebase` | `dev` accepts HS256 test tokens |
| `APP_CORS_ORIGINS` | localhost:3000,5173 | SPA origins |
| `PORT` | 8080 | Render/Fly inject this |
