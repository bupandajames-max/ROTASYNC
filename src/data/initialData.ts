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

// Index matches Date#getDay() (0 = Sunday). Shared between the task
// frequency picker (TaskRegister) and the "is this task due today" matcher
// (App.tsx) so a saved "Weekly (Monday)" string means the same thing in both.
export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ── Shift presets ───────────────────────────────────────────────────────────
// A genuinely generic, org-neutral starter vocabulary — 4 work shifts + 4
// universal leave types. Previously shipped 14 codes modeling one specific
// clinic's exact operation (on-call shifts, overnight stock counts,
// off-site workspace, etc.) to every new business regardless of type.
// Admins extend this with whatever their org actually needs via Settings ->
// Shift Planner, or inline on the roster grid with a custom time.
export const SHIFT_PRESET_STANDARD: { [code: string]: ShiftDef } = {
  // Work shifts
  'A':   { code: 'A', name: 'Morning',   time: '08:00 – 17:00', hours: 8,  bg: '#FEF9C3', fg: '#713F12', active: true },
  'C':   { code: 'C', name: 'Afternoon', time: '12:00 – 21:00', hours: 8,  bg: '#DBEAFE', fg: '#1E3A8A', active: true },
  'N':   { code: 'N', name: 'Night Shift', time: '20:00 – 08:00 (overnight)', hours: 12, bg: '#E0E7FF', fg: '#312E81', active: true },
  // On-call / standby: rostered so the team knows who's reachable at
  // night, but 0 base hours — standby itself isn't worked time. When the
  // person is actually called in, those real hours are logged separately
  // (either as that day's "Worked Call-out" work type on the timesheet,
  // or via Log Extra Hours on a day they already worked) and paid as
  // premium/overtime. See timesheetUtils' On-Call Callout handling.
  'OC':  { code: 'OC', name: 'On-Call', time: 'On standby', hours: 0, bg: '#FFEDD5', fg: '#9A3412', active: true },
  // Leave & absence
  'MD':  { code: 'MD', name: 'Personal Day Off',    time: 'Paid day off',  hours: 8,  bg: '#FCE7F3', fg: '#831843', active: true, isLeave: true },
  'AL':  { code: 'AL', name: 'Annual Leave',        time: 'Paid leave',    hours: 8,  bg: '#D1FAE5', fg: '#064E3B', active: true, isLeave: true },
  'SL':  { code: 'SL', name: 'Sick/Study Leave',    time: 'Paid leave',    hours: 8,  bg: '#E0F2FE', fg: '#0C4A6E', active: true, isLeave: true },
  'CO':  { code: 'CO', name: 'Compassionate Leave', time: 'Paid leave',    hours: 8,  bg: '#FEF3C7', fg: '#78350F', active: true, isLeave: true },
  'OFF': { code: 'OFF', name: 'Rest Day Off',       time: 'Rest',          hours: 0,  bg: '#F1F5F9', fg: '#475569', active: true, isLeave: true },
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
// Genuinely empty by default — no rotation tracks, no auto-assignments, no
// manager track, matching this file's own "no org-specific data ships"
// philosophy (see DEFAULT_FACILITIES below). The previous default modeled one
// specific 24/7 clinic's exact staffing pattern (night/on-call/weekend-cover
// rotation tracks, a stock-count auto-assignment) baked into every new
// workspace regardless of business type. Admins now build their own rules
// from scratch in Settings -> Roster Rules.
export function buildDefaultRuleSet(): RosterRuleSet {
  return {
    autoAssignments: [],
    rotationTracks: [],
    restConstraints: {
      lateShifts: [],
      earlyShifts: [],
      maxConsecutiveWorkDays: 6,
      nonWorkingCodes: ['OFF', 'AL', 'SL', 'CO', 'MD'],
      leaveCodes: ['AL', 'SL', 'CO'],
    },
  };
}

// ── Taxonomy default ────────────────────────────────────────────────────────
export const DEFAULT_TAXONOMY: Taxonomy = {
  appName: 'RotaSync',
  organizationName: '',
  workspaceSingular: 'Facility',
  workspacePlural: 'Facilities',
  memberSingular: 'Staff Member',
  memberPlural: 'Staff Members',
  groupSingular: 'Department',
  groupPlural: 'Departments',
  taskSingular: 'Task',
  taskPlural: 'Tasks',
  supervisorTitle: 'Team Leader / Supervisor',
  managerTitle: 'Manager',
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
