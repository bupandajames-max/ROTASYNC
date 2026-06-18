export interface ShiftDef {
  code: string;
  name: string;
  time: string;
  hours: number;
  bg: string;
  fg: string;
  active: boolean;
}

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  contractedHours: number;
  gender: 'F' | 'M' | '';
  fullName: string;
  employeeNo: string;
  isManager?: boolean;
  facilityId?: string;
  departmentId?: string;
  rosterTrack?: string; // 'Rotating 24/7', 'Days Only', 'Nights Only', 'Flexible Custom'
  rosterNotes?: string;
}

export interface RosterCycle {
  id: string; // e.g. "2026-06-15"
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  shifts: { [staffId: string]: string[] }; // array of shift codes matching the date range
  isLocked?: boolean;
}

export interface AbsenceLog {
  id: string;
  staffName: string;
  startDate: string;
  endDate: string;
  type: string; // leave/absence shift code, defined per-workspace (e.g. 'AL', 'SL', 'CO')
}

export interface TaskFieldDef {
  id: string;
  label: string;
  type: 'text' | 'number' | 'checkbox' | 'select' | 'signature';
  required?: boolean;
  placeholder?: string;
  selectOptions?: string[]; // If type is 'select'
  minValue?: number; // e.g. for telemetry bounds
  maxValue?: number;
  breachThresholdAction?: string; // Action text/instruction if outside min/max
}

export interface TaskMaster {
  id: string;
  name: string;
  category: string; // Dynamic string instead of rigid clinical/pharmacy union
  pattern: 'Shift-based' | 'Role-group' | 'Linked' | 'Collab' | 'Person-specific' | 'Manager-assign' | 'Dispensing-rotate';
  assignedValue: string; // e.g., "Shift A"
  managerAssignedName?: string;
  priority: 'Critical' | 'High' | 'Standard' | 'Routine';
  frequency: string;
  compliance: boolean;
  active: boolean;
  notes: string;
  trackerTarget?: number;
  trackerValue?: number;
  customFields?: TaskFieldDef[]; // Dynamic field schemas
}

export interface TaskHistoryEntry {
  id: string;
  timestamp: string;
  action: string;
  staffName: string;
  details?: string;
}

export interface DailyTask {
  id: string;
  date: string; // YYYY-MM-DD
  staffName: string;
  taskName: string;
  category: string;
  shiftCode: string;
  priority: 'Critical' | 'High' | 'Standard' | 'Routine';
  status: 'Pending' | 'In Progress' | 'Done' | 'Missed' | 'Carried Fwd' | 'Pending Review';
  compliance: boolean;
  counterSign?: string;
  isTracker?: boolean;
  trackerTarget?: number;
  trackerValue?: number;
  
  // Real-world dynamic checklist parameters recorded during execution
  fridgeTemp?: number;
  roomTemp?: number;
  sealNumber?: string;
  correctiveAction?: string;
  clinicalComment?: string;
  
  // Dynamic fields
  customFields?: TaskFieldDef[];
  customFieldsData?: { [fieldId: string]: any };
  customFieldBreachActions?: { [fieldId: string]: string };

  // Audit trail for accountability
  history?: TaskHistoryEntry[];
}

export interface TimesheetDay {
  date: string; // YYYY-MM-DD
  scheduledShift: string; // e.g., 'A', 'N', 'OFF'
  actualShift: string; // what was actually worked or leave taken (e.g. SL, AL, A, SC)
  clockIn: string; // "HH:MM" format
  clockOut: string; // "HH:MM" format
  lunchBreakMinutes: number; // typically 60 for net hours
  workType: 'Worked Shift' | 'Overtime Duty' | 'On-Call Callout' | 'Leave Taken' | 'Absent';
  
  // Hours calculated by business rules
  regularWorkedHours: number;
  sundayWorkedHours: number;
  overtimeHours: number;
  holidayWorkedHours: number;
  leaveHours: number;
  
  deviationReason?: string;
  isModified?: boolean;
}

export interface Timesheet {
  id: string; // e.g. "ts-staff1-2026-06-15"
  staffId: string;
  staffName: string;
  cycleId: string;
  days: { [dateStr: string]: TimesheetDay };
  status: 'Draft' | 'Submitted' | 'Approved' | 'Rejected';
  submittedAt?: string;
  approvedAt?: string;
  approvedBy?: string;
  managerComment?: string;
}

export interface ComplianceEntry {
  id: string;
  date: string; // YYYY-MM-DD HH:mm
  type: string;
  notes: string;
  staffName: string;
  supervisorName: string;
  status: 'Complete';
}

export interface ApprovalRequest {
  id: string;
  timestamp: string; // YYYY-MM-DD HH:mm
  type: 'SWAP' | 'EXTRA' | 'COMPLIANCE' | 'MONTHLY';
  requesterName: string;
  shiftData?: string; // e.g. "2026-06-18|A" for swaps/extra hours
  targetName?: string; // colleague with whom swapping, or supervisor signing, or hours amount
  details: string;
  status: 'Pending' | 'Approved' | 'Denied';
}

export interface ExtraHoursEntry {
  id: string;
  timestamp: string;
  staffName: string;
  shiftDate: string; // YYYY-MM-DD
  shiftCode: string;
  hours: number;
  note: string;
  approvedBy: string;
}

export interface PublicHoliday {
  date: string; // YYYY-MM-DD
  name: string;
}

export interface Facility {
  id: string;
  name: string;
  location: string;
  leadManager: string;
  fridgeTargetTemp: string;
  dailyKpiWordCheck: string;
  ipDevice: string;
  facilitiesType: string; // org-defined classification (e.g. 'Primary Care', 'Warehouse', 'Branch')
}

export interface Department {
  id: string;
  facilityId: string;
  name: string;
  description: string;
}

// ── Configuration-driven architecture ──────────────────────────────────────
// Everything that used to be hardcoded for one organization now lives in a
// per-workspace WorkspaceConfig so any org can map its own structure at runtime.

export interface Taxonomy {
  appName: string;
  workspaceSingular: string;
  workspacePlural: string;
  memberSingular: string;
  memberPlural: string;
  groupSingular: string;
  groupPlural: string;
  taskSingular: string;
  taskPlural: string;
}

/** A single auto-assignment rule, e.g. "assign shift SC to 3 people on the last day of the cycle". */
export interface RosterAutoAssignment {
  id: string;
  shiftCode: string;
  trigger: 'last-day' | 'weekly-dow';
  count?: number;       // how many staff to assign (default: all eligible)
  dow?: number[];       // for 'weekly-dow': days of week (0=Sun..6=Sat)
  appliesToManagers?: boolean; // default false (non-managers only)
}

/** A rotation archetype assigned to staff in a round-robin per week. */
export interface RosterRotationTrack {
  id: string;
  label: string;
  weekdayShift: string;      // shift code Mon–Fri
  weekendShift: string;      // shift code Sat/Sun & public holidays
  midWeekRestDows?: number[]; // optional extra rest days (0=Sun..6=Sat)
  weekdayOnly?: boolean;      // if true, weekdayShift only applies Mon–Thu (night-style tracks)
}

/** Eligibility selector for optional perks like a personal day off. */
export interface RosterEligibility {
  field: 'all' | 'gender' | 'role';
  value?: string; // required when field !== 'all'
}

export interface RosterPersonalDayOff {
  enabled: boolean;
  eligibility: RosterEligibility;
  window: { startDay: number; endDay: number; allowedDows: number[] }; // day index range within the cycle
  shiftCode: string;
}

export interface RosterRestConstraints {
  lateShifts: string[];          // shifts that cannot be followed by an early shift next day
  earlyShifts: string[];         // early shifts blocked after a late shift
  maxConsecutiveWorkDays: number;
  nonWorkingCodes: string[];     // codes that count as "not working" (e.g. OFF, leave codes)
  leaveCodes: string[];          // codes treated as paid leave for stats
}

export interface RosterRuleSet {
  managerTrack?: { weekdayShift: string; weekendShift: string };
  autoAssignments: RosterAutoAssignment[];
  personalDayOff?: RosterPersonalDayOff;
  rotationTracks: RosterRotationTrack[];
  restConstraints: RosterRestConstraints;
}

export interface WorkspaceConfig {
  shifts: { [code: string]: ShiftDef };
  ruleSet: RosterRuleSet;
  taskCategories: string[];
  facilityTypes: string[];
  holidays: PublicHoliday[];
  timezoneLabel: string;       // e.g. "Zambia (CAT)"
  regionPresetId?: string;     // which HOLIDAY_PRESETS entry was loaded, if any
  taxonomy: Taxonomy;
}
