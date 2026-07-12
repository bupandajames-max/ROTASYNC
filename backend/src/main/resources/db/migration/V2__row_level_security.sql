-- ============================================================================
-- PostgreSQL Row-Level Security: defense-in-depth beneath the Hibernate filter.
--
-- WHY BOTH LAYERS:
--   * The Hibernate @Filter gives every JPA query automatic tenant scoping,
--     but it does NOT apply to native queries, and a future developer could
--     forget to annotate a new entity.
--   * RLS is enforced by the database itself: if the application layer has a
--     bug, PostgreSQL still refuses to return or modify rows whose tenant_id
--     doesn't match the transaction's app.tenant_id setting. A missing
--     setting means NO rows (fail-closed), never all rows.
--
-- HOW IT'S DRIVEN:
--   The backend runs `SELECT set_config('app.tenant_id', :tenantId, true)`
--   at the start of every tenant-scoped transaction (see TenantTransactionAspect).
--   `true` = transaction-local, so pooled connections can't leak the value.
--
-- FORCE ROW LEVEL SECURITY makes policies apply even to the table owner —
-- important on free-tier databases where the app often connects as owner.
-- ============================================================================

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'facilities','departments','memberships','invites','staff',
    'roster_cycles','roster_assignments','roster_snapshots','timesheets',
    'approvals','extra_hours','daily_tasks','tenant_settings','audit_log'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    -- current_setting(..., true) returns NULL when unset -> predicate is
    -- NULL -> no rows visible. Fail-closed by construction.
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (tenant_id = current_setting(''app.tenant_id'', true)::uuid)
         WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true)::uuid)',
      t);
  END LOOP;
END $$;

-- organizations: a tenant may read/update only its own row.
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
CREATE POLICY org_self ON organizations
  USING (id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (id = current_setting('app.tenant_id', true)::uuid);

-- app_users is global (login-time lookups happen before a tenant is known),
-- so it carries no tenant policy. It contains only identity data.

-- Trusted maintenance paths (migration jobs, system-owner console, the
-- onboarding INSERT into organizations) run with app.bypass_rls = 'on',
-- set only by code paths guarded by the SYSTEM_OWNER check.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'organizations','facilities','departments','memberships','invites','staff',
    'roster_cycles','roster_assignments','roster_snapshots','timesheets',
    'approvals','extra_hours','daily_tasks','tenant_settings','audit_log'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY system_bypass ON %I
         USING (current_setting(''app.bypass_rls'', true) = ''on'')
         WITH CHECK (current_setting(''app.bypass_rls'', true) = ''on'')',
      t);
  END LOOP;
END $$;
