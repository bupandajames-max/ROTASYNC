// Centralized localStorage key builders. Before this module, every call site
// hand-built `facility_${id}_suffix` template strings — a typo in any one of
// them silently desyncs a feature from its cache. One place to get it right.

/**
 * The single facility this app originally ran as before multi-tenancy
 * existed. Its legacy (pre-`facility_${id}_*`) localStorage keys are mirrored
 * on every write so any code/bookmarks still reading those old keys keep
 * working. No other facility ever gets this treatment — new tenants only
 * ever use the `facility_${id}_*` convention.
 */
export const LEGACY_FACILITY_ID = 'kansanshi';

export const isLegacyFacility = (facilityId: string | null | undefined): boolean =>
  facilityId === LEGACY_FACILITY_ID;

/** Keys that are global to the browser, not scoped to any one facility. */
export const GLOBAL_KEYS = {
  facilitiesList: 'care_facilities_list',
  departments: 'care_departments',
  lastFacility: 'care_last_facility',
} as const;

export type FacilitySuffix =
  | 'active_staff_id'
  | 'holidays'
  | 'custom_shifts'
  | 'config'
  | 'staff_list'
  | 'cycle_dates'
  | 'active_cycle'
  | 'task_master'
  | 'approvals'
  | 'extra_hours_log'
  | 'daily_tasks'
  | 'timesheets_list'
  | 'taxonomy';

/** `facility_{facilityId}_{suffix}` — the standard per-facility cache key. */
export const facilityKey = (facilityId: string, suffix: FacilitySuffix): string =>
  `facility_${facilityId}_${suffix}`;

// One-off per-facility flags that predate (and don't follow) the
// `facility_{id}_{suffix}` convention above.
export const seededFlagKey = (facilityId: string): string => `seeded_initially_${facilityId}`;
export const setupHiddenKey = (facilityId: string): string => `setup_hidden_${facilityId}`;
export const welcomedKey = (facilityId: string): string => `welcomed_${facilityId}`;

/** Suffixes that have a corresponding legacy mirror key for {@link LEGACY_FACILITY_ID}. */
type LegacyMirroredSuffix = 'staff_list' | 'active_cycle' | 'task_master' | 'daily_tasks' | 'approvals' | 'extra_hours_log';

const LEGACY_KEY_MAP: Record<LegacyMirroredSuffix, string> = {
  staff_list: 'kmh_staff_list',
  active_cycle: 'kmh_active_cycle',
  task_master: 'kmh_task_master',
  daily_tasks: 'kmh_daily_tasks',
  approvals: 'kmh_approvals',
  extra_hours_log: 'kmh_extra_hours_log',
};

/**
 * Mirrors a write to the legacy pre-multi-tenant key, but only for
 * {@link LEGACY_FACILITY_ID}. A no-op for every other facility.
 */
export function mirrorLegacyFacilityKey(facilityId: string, suffix: LegacyMirroredSuffix, data: unknown): void {
  if (!isLegacyFacility(facilityId)) return;
  localStorage.setItem(LEGACY_KEY_MAP[suffix], JSON.stringify(data));
}
