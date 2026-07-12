-- Align remaining tables with the TenantOwnedEntity base mapping
-- (created_at / updated_at / deleted_at on every tenant-owned entity).

ALTER TABLE invites            ADD COLUMN deleted_at timestamptz;
ALTER TABLE roster_assignments ADD COLUMN deleted_at timestamptz;
ALTER TABLE tenant_settings    ADD COLUMN deleted_at timestamptz;
ALTER TABLE roster_snapshots   ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE roster_snapshots   ADD COLUMN deleted_at timestamptz;

CREATE TRIGGER trg_roster_snapshots_touch
  BEFORE UPDATE ON roster_snapshots
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
