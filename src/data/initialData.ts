import {
  ShiftDef,
  StaffMember,
  TaskMaster,
  PublicHoliday,
  Facility,
  Department,
  RosterRuleSet,
  Taxonomy,
  WorkspaceConfig,
} from '../types';

// ── Shift presets ───────────────────────────────────────────────────────────
// A generic, org-neutral starter vocabulary of shifts. This is a *loadable
// preset* (offered in the setup wizard), not org-specific data. Admins can
// edit, extend, or replace any of these per workspace.
export const SHIFT_PRESET_STANDARD: { [code: string]: ShiftDef } = {
  // Work shifts
  'A':   { code: 'A', name: 'Morning',             time: '08:00 – 17:00', hours: 8,  bg: '#FEF9C3', fg: '#713F12', active: true },
  'A+':  { code: 'A+', name: 'Morning Extended',   time: '08:00 – 18:00', hours: 9,  bg: '#FFEDD5', fg: '#7C2D12', active: true },
  'B':   { code: 'B', name: 'Mid-Day',             time: '10:00 – 19:00', hours: 8,  bg: '#DCFCE7', fg: '#14532D', active: true },
  'C':   { code: 'C', name: 'Afternoon',           time: '12:00 – 21:00', hours: 8,  bg: '#DBEAFE', fg: '#1E3A8A', active: true },
  'D':   { code: 'D', name: 'On-Call',             time: 'From 16:00 (standby)', hours: 8,  bg: '#F3E8FF', fg: '#581C87', active: true },
  'E':   { code: 'E', name: 'Extended Weekend/PH', time: '~11 hrs (rotating)',   hours: 11, bg: '#FEE2E2', fg: '#991B1B', active: true },
  'SC':  { code: 'SC', name: 'Audit & Physical Count', time: '18:00 – 08:00 (overnight)', hours: 14, bg: '#FAE8FF', fg: '#701A75', active: true },
  'N':   { code: 'N', name: 'Night Shift',         time: '20:00 – 08:00 (overnight)', hours: 12, bg: '#E0E7FF', fg: '#312E81', active: true },
  // Leave & absence
  'MD':  { code: 'MD', name: 'Personal Day Off',    time: 'Paid day off',  hours: 8,  bg: '#FCE7F3', fg: '#831843', active: true, isLeave: true },
  'AL':  { code: 'AL', name: 'Annual Leave',        time: 'Paid leave',    hours: 8,  bg: '#D1FAE5', fg: '#064E3B', active: true, isLeave: true },
  'SL':  { code: 'SL', name: 'Sick/Study Leave',    time: 'Paid leave',    hours: 8,  bg: '#E0F2FE', fg: '#0C4A6E', active: true, isLeave: true },
  'CO':  { code: 'CO', name: 'Compassionate Leave', time: 'Paid leave',    hours: 8,  bg: '#FEF3C7', fg: '#78350F', active: true, isLeave: true },
  'TRN': { code: 'TRN', name: 'Training/Workshop',  time: '09:00 – 17:00 (paid)', hours: 8,  bg: '#CCFBF1', fg: '#115E59', active: true, isLeave: true },
  'OS':  { code: 'OS', name: 'Off-Site Workspace',  time: '09:00 – 17:00 (paid)', hours: 8,  bg: '#ECFCCB', fg: '#365314', active: true, isLeave: true },
  'OFF': { code: 'OFF', name: 'Rest Day Off',        time: 'Rest',          hours: 0,  bg: '#F1F5F9', fg: '#475569', active: true, isLeave: true },
};

// Backwards-compatible alias. Components that look up a shift definition import
// SHIFTS as a built-in fallback dictionary; the live, editable map flows through
// the WorkspaceConfig at runtime.
export const SHIFTS = SHIFT_PRESET_STANDARD;

export const INITIAL_STAFF: StaffMember[] = [];
export const INITIAL_TASKS: TaskMaster[] = [];

// ── Holiday presets ─────────────────────────────────────────────────────────
// A registry of selectable regional holiday sets. Admins load one and then edit
// it; nothing is baked into the workspace by default.
export interface HolidayPreset {
  id: string;
  label: string;
  build: (year: number) => PublicHoliday[];
}

export const HOLIDAY_PRESETS: HolidayPreset[] = [
  {
    id: 'zambia',
    label: 'Zambia',
    build: (year: number) => [
      { date: `${year}-01-01`, name: "New Year's Day" },
      { date: `${year}-03-08`, name: "International Women's Day" },
      { date: `${year}-03-12`, name: 'Youth Day' },
      { date: `${year}-04-03`, name: 'Good Friday' },
      { date: `${year}-04-04`, name: 'Holy Saturday' },
      { date: `${year}-04-06`, name: 'Easter Monday' },
      { date: `${year}-04-28`, name: 'K.K. Memorial' },
      { date: `${year}-05-01`, name: 'Labour Day' },
      { date: `${year}-05-25`, name: 'Africa Freedom Day' },
      { date: `${year}-07-06`, name: 'Heroes Day' },
      { date: `${year}-07-07`, name: 'Unity Day' },
      { date: `${year}-08-03`, name: 'Farmers Day' },
      { date: `${year}-10-18`, name: 'National Day of Prayer' },
      { date: `${year}-10-24`, name: 'Independence Day' },
      { date: `${year}-12-25`, name: 'Christmas Day' },
      { date: `${year}-12-26`, name: 'Boxing Day' },
    ],
  },
  {
    id: 'common-international',
    label: 'Common (International)',
    build: (year: number) => [
      { date: `${year}-01-01`, name: "New Year's Day" },
      { date: `${year}-05-01`, name: 'Labour Day' },
      { date: `${year}-12-25`, name: 'Christmas Day' },
      { date: `${year}-12-26`, name: 'Public Holiday' },
    ],
  },
  {
    id: 'none',
    label: 'None (define your own)',
    build: () => [],
  },
];

export function getHolidayPreset(id: string): HolidayPreset | undefined {
  return HOLIDAY_PRESETS.find(p => p.id === id);
}

// ── Default ruleset ─────────────────────────────────────────────────────────
// Reproduces the optimizer's original behavior, but fully data-driven so admins
// can edit every decision from the settings dashboard.
export function buildDefaultRuleSet(): RosterRuleSet {
  return {
    managerTrack: { weekdayShift: 'A+', weekendShift: 'OFF' },
    autoAssignments: [
      { id: 'auto-stockcount', shiftCode: 'SC', trigger: 'last-day', count: 3, appliesToManagers: false },
    ],
    personalDayOff: {
      enabled: true,
      eligibility: { field: 'all' },
      // startDay: earliest day index considered; endDay: margin of days left at the cycle end
      window: { startDay: 7, endDay: 7, allowedDows: [2, 3, 4] },
      shiftCode: 'MD',
    },
    rotationTracks: [
      { id: 'track-n',  label: 'Nights (Mon–Thu)', weekdayShift: 'N', weekendShift: 'OFF', weekdayOnly: true },
      { id: 'track-d',  label: 'On-Call Days',     weekdayShift: 'D', weekendShift: 'OFF' },
      { id: 'track-c',  label: 'Afternoons',       weekdayShift: 'C', weekendShift: 'OFF' },
      { id: 'track-b',  label: 'Mid-Day',          weekdayShift: 'B', weekendShift: 'OFF' },
      { id: 'track-we1', label: 'Weekend Cover A', weekdayShift: 'A', weekendShift: 'E', midWeekRestDows: [3, 4] },
      { id: 'track-we2', label: 'Weekend Cover B', weekdayShift: 'A', weekendShift: 'E', midWeekRestDows: [1, 2] },
    ],
    restConstraints: {
      lateShifts: ['D', 'SC', 'N', 'E'],
      earlyShifts: ['A', 'A+', 'B'],
      maxConsecutiveWorkDays: 6,
      nonWorkingCodes: ['OFF', 'AL', 'SL', 'CO', 'MD'],
      leaveCodes: ['AL', 'SL', 'CO'],
    },
  };
}

// ── Taxonomy default ────────────────────────────────────────────────────────
export const DEFAULT_TAXONOMY: Taxonomy = {
  appName: 'RotaSync',
  workspaceSingular: 'Facility',
  workspacePlural: 'Facilities',
  memberSingular: 'Staff Member',
  memberPlural: 'Staff Members',
  groupSingular: 'Department',
  groupPlural: 'Departments',
  taskSingular: 'Task',
  taskPlural: 'Tasks',
};

// ── Workspace config builder ────────────────────────────────────────────────
export function buildDefaultWorkspaceConfig(overrides?: Partial<WorkspaceConfig>): WorkspaceConfig {
  return {
    shifts: { ...SHIFT_PRESET_STANDARD },
    ruleSet: buildDefaultRuleSet(),
    taskCategories: ['General', 'Compliance', 'Inventory', 'Administration', 'Maintenance'],
    facilityTypes: ['Branch', 'Primary Care', 'Warehouse', 'Office', 'Other'],
    holidays: [],
    timezoneLabel: '',
    regionPresetId: undefined,
    taxonomy: { ...DEFAULT_TAXONOMY },
    ...overrides,
  };
}

// ── Blank slate ─────────────────────────────────────────────────────────────
// No org-specific data ships in source. A brand-new install starts empty and
// the first-run setup wizard provisions the first workspace.
export const DEFAULT_FACILITIES: Facility[] = [];
export const DEFAULT_DEPARTMENTS: Department[] = [];

/**
 * Sanitizes a stored facilities list without injecting any org-specific data.
 * (Previously this force-renamed specific Mary Begg facilities; that org coupling
 * has been removed.)
 */
export function upgradeFacilitiesList(list: Facility[]): { upgraded: Facility[]; changed: boolean } {
  const safeList = (list || []).filter(
    (f): f is Facility => f !== null && typeof f === 'object' && typeof f.id === 'string'
  );
  return { upgraded: safeList, changed: false };
}

export const getStaffSeedForFacility = (_facilityId: string): StaffMember[] => [];

export const getTasksSeedForFacility = (_facilityId: string): TaskMaster[] => [];
