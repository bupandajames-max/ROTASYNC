-- ============================================================================
-- RotaSync core schema (multi-tenant, shared schema, tenant_id discriminator)
--
-- Tenant model: tenant == organization. Every tenant-owned table carries
-- tenant_id (FK to organizations). Facility is a sub-scope inside a tenant.
--
-- Soft delete: deleted_at on operational tables. Rows are never physically
-- deleted by normal app flows (factory reset and GDPR erasure excepted).
-- Partial unique indexes exclude soft-deleted rows.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- Tenant root
-- ---------------------------------------------------------------------------
CREATE TABLE organizations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

-- ---------------------------------------------------------------------------
-- Global identities (NOT tenant-owned: a user can belong to several tenants)
-- ---------------------------------------------------------------------------
CREATE TABLE app_users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid    text UNIQUE,                -- present while Firebase Auth is the IdP
  email           text NOT NULL,
  display_name    text,
  is_system_owner boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ux_app_users_email ON app_users (lower(email));

-- ---------------------------------------------------------------------------
-- Tenant-owned tables. All carry tenant_id.
-- ---------------------------------------------------------------------------
CREATE TABLE facilities (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES organizations(id),
  name            text NOT NULL,
  location        text NOT NULL DEFAULT '',
  facility_type   text NOT NULL DEFAULT 'Branch',
  lead_manager    text,
  timezone_label  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);
CREATE INDEX ix_facilities_tenant ON facilities (tenant_id);

CREATE TABLE departments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES organizations(id),
  facility_id  uuid NOT NULL REFERENCES facilities(id),
  name         text NOT NULL,
  description  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);
CREATE INDEX ix_departments_tenant ON departments (tenant_id);
CREATE INDEX ix_departments_facility ON departments (facility_id);
CREATE UNIQUE INDEX ux_departments_name
  ON departments (tenant_id, facility_id, lower(name)) WHERE deleted_at IS NULL;

-- Role of a user inside a tenant. Roles: ORG_ADMIN, MANAGER, MEMBER.
-- (SYSTEM_OWNER is a flag on app_users, not a membership.)
CREATE TABLE memberships (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES organizations(id),
  user_id        uuid NOT NULL REFERENCES app_users(id),
  facility_id    uuid REFERENCES facilities(id),      -- NULL = whole-org role (org admin)
  department_id  uuid REFERENCES departments(id),     -- NULL for managers/admins
  role           text NOT NULL CHECK (role IN ('ORG_ADMIN','MANAGER','MEMBER')),
  status         text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz
);
CREATE INDEX ix_memberships_tenant ON memberships (tenant_id);
CREATE INDEX ix_memberships_user ON memberships (user_id);
CREATE UNIQUE INDEX ux_memberships_user_tenant
  ON memberships (tenant_id, user_id) WHERE deleted_at IS NULL;

CREATE TABLE invites (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES organizations(id),
  facility_id    uuid NOT NULL REFERENCES facilities(id),
  department_id  uuid REFERENCES departments(id),
  email          text NOT NULL,
  role           text NOT NULL CHECK (role IN ('ORG_ADMIN','MANAGER','MEMBER')),
  status         text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACCEPTED','REVOKED','EXPIRED')),
  invited_by     uuid REFERENCES app_users(id),
  expires_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_invites_tenant ON invites (tenant_id);
CREATE INDEX ix_invites_email ON invites (lower(email)) WHERE status = 'PENDING';

-- Roster records for schedulable people (may exist before the person has a login)
CREATE TABLE staff (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES organizations(id),
  facility_id       uuid NOT NULL REFERENCES facilities(id),
  department_id     uuid REFERENCES departments(id),
  user_id           uuid REFERENCES app_users(id),   -- linked once they sign in
  name              text NOT NULL,                   -- short/display name
  full_name         text NOT NULL,
  email             text,
  phone             text,
  role_title        text NOT NULL DEFAULT '',        -- job title, not access role
  employee_no       text NOT NULL,
  contracted_hours  int  NOT NULL DEFAULT 168,
  gender            text NOT NULL DEFAULT '',
  skills            text[] NOT NULL DEFAULT '{}',
  is_manager        boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);
CREATE INDEX ix_staff_tenant ON staff (tenant_id);
CREATE INDEX ix_staff_facility ON staff (tenant_id, facility_id);
CREATE INDEX ix_staff_department ON staff (tenant_id, department_id);
CREATE UNIQUE INDEX ux_staff_employee_no
  ON staff (tenant_id, facility_id, employee_no) WHERE deleted_at IS NULL;

CREATE TABLE roster_cycles (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES organizations(id),
  facility_id  uuid NOT NULL REFERENCES facilities(id),
  start_date   date NOT NULL,
  end_date     date NOT NULL,
  is_locked    boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz,
  CHECK (end_date >= start_date)
);
CREATE INDEX ix_cycles_tenant ON roster_cycles (tenant_id);
CREATE INDEX ix_cycles_facility ON roster_cycles (tenant_id, facility_id, start_date DESC);

-- Normalized shift assignments (replaces the Firestore per-department shard docs).
-- Department scoping falls out of the staff FK; one row per person per day.
CREATE TABLE roster_assignments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES organizations(id),
  cycle_id     uuid NOT NULL REFERENCES roster_cycles(id) ON DELETE CASCADE,
  staff_id     uuid NOT NULL REFERENCES staff(id),
  day_date     date NOT NULL,
  shift_code   text NOT NULL,               -- 'A','N','OFF', custom codes, ad hoc
  shift_times  jsonb,                       -- ad hoc override: {"start":"08:00","end":"17:30"}
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_assignments_tenant ON roster_assignments (tenant_id);
CREATE INDEX ix_assignments_cycle ON roster_assignments (tenant_id, cycle_id);
CREATE UNIQUE INDEX ux_assignments_cell ON roster_assignments (cycle_id, staff_id, day_date);

-- Immutable point-in-time archives of a whole cycle (audit/history)
CREATE TABLE roster_snapshots (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES organizations(id),
  facility_id  uuid NOT NULL REFERENCES facilities(id),
  cycle_id     uuid NOT NULL REFERENCES roster_cycles(id),
  label        text,
  snapshot     jsonb NOT NULL,              -- full frozen cycle payload
  created_by   uuid REFERENCES app_users(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_snapshots_tenant ON roster_snapshots (tenant_id);
CREATE INDEX ix_snapshots_cycle ON roster_snapshots (tenant_id, cycle_id);

CREATE TABLE timesheets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES organizations(id),
  facility_id  uuid NOT NULL REFERENCES facilities(id),
  staff_id     uuid NOT NULL REFERENCES staff(id),
  cycle_id     uuid NOT NULL REFERENCES roster_cycles(id),
  status       text NOT NULL DEFAULT 'DRAFT'
               CHECK (status IN ('DRAFT','SUBMITTED','APPROVED','REJECTED')),
  days         jsonb NOT NULL DEFAULT '{}',  -- per-date entries, same shape the SPA uses today
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);
CREATE INDEX ix_timesheets_tenant ON timesheets (tenant_id);
CREATE INDEX ix_timesheets_staff ON timesheets (tenant_id, staff_id);
CREATE UNIQUE INDEX ux_timesheets_staff_cycle
  ON timesheets (staff_id, cycle_id) WHERE deleted_at IS NULL;

CREATE TABLE approvals (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES organizations(id),
  facility_id    uuid NOT NULL REFERENCES facilities(id),
  staff_id       uuid REFERENCES staff(id),   -- requester
  type           text NOT NULL,               -- SHIFT_SWAP, LEAVE, TIMESHEET, ...
  status         text NOT NULL DEFAULT 'PENDING'
                 CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED')),
  payload        jsonb NOT NULL DEFAULT '{}', -- request-type-specific details
  decided_by     uuid REFERENCES app_users(id),
  decided_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz
);
CREATE INDEX ix_approvals_tenant ON approvals (tenant_id);
CREATE INDEX ix_approvals_staff ON approvals (tenant_id, staff_id);
CREATE INDEX ix_approvals_pending ON approvals (tenant_id, facility_id) WHERE status = 'PENDING';

CREATE TABLE extra_hours (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES organizations(id),
  facility_id  uuid NOT NULL REFERENCES facilities(id),
  staff_id     uuid NOT NULL REFERENCES staff(id),
  work_date    date NOT NULL,
  hours        numeric(5,2) NOT NULL CHECK (hours > 0),
  reason       text,
  status       text NOT NULL DEFAULT 'PENDING'
               CHECK (status IN ('PENDING','APPROVED','REJECTED')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);
CREATE INDEX ix_extra_hours_tenant ON extra_hours (tenant_id);
CREATE INDEX ix_extra_hours_staff ON extra_hours (tenant_id, staff_id);

CREATE TABLE daily_tasks (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES organizations(id),
  facility_id    uuid NOT NULL REFERENCES facilities(id),
  department_id  uuid REFERENCES departments(id),
  staff_id       uuid REFERENCES staff(id),
  task_name      text NOT NULL,
  task_date      date NOT NULL,
  status         text NOT NULL DEFAULT 'PENDING'
                 CHECK (status IN ('PENDING','IN_PROGRESS','BLOCKED','PENDING_REVIEW','DONE')),
  priority       text NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW','NORMAL','HIGH')),
  notes          text,
  tracker_value  int,
  tracker_target int,
  counter_sign   text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz
);
CREATE INDEX ix_tasks_tenant ON daily_tasks (tenant_id);
CREATE INDEX ix_tasks_facility_date ON daily_tasks (tenant_id, facility_id, task_date);
CREATE INDEX ix_tasks_department ON daily_tasks (tenant_id, department_id);

-- Per-facility settings: taxonomy/terminology, shift definitions, roster rules,
-- public holidays. jsonb keeps parity with today's client-side shapes so the
-- SPA needs no data-model rewrite.
CREATE TABLE tenant_settings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES organizations(id),
  facility_id  uuid REFERENCES facilities(id),  -- NULL = org-wide defaults
  taxonomy     jsonb NOT NULL DEFAULT '{}',
  shift_defs   jsonb NOT NULL DEFAULT '{}',
  roster_rules jsonb NOT NULL DEFAULT '{}',
  holidays     jsonb NOT NULL DEFAULT '[]',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_settings_tenant ON tenant_settings (tenant_id);
CREATE UNIQUE INDEX ux_settings_scope
  ON tenant_settings (tenant_id, COALESCE(facility_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE TABLE audit_log (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id      uuid NOT NULL REFERENCES organizations(id),
  actor_user_id  uuid REFERENCES app_users(id),
  action         text NOT NULL,          -- STAFF_CREATED, TIMESHEET_APPROVED, FACTORY_RESET, ...
  entity_type    text,
  entity_id      text,
  detail         jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_audit_tenant_time ON audit_log (tenant_id, created_at DESC);

-- updated_at maintenance
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'organizations','app_users','facilities','departments','memberships','invites',
    'staff','roster_cycles','roster_assignments','timesheets','approvals',
    'extra_hours','daily_tasks','tenant_settings'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_%s_touch BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION touch_updated_at()',
      t, t);
  END LOOP;
END $$;
