import { ShiftDef, StaffMember, RosterCycle, PublicHoliday, RosterRuleSet } from '../types';
import { SHIFT_PRESET_STANDARD, buildDefaultRuleSet } from '../data/initialData';

type ShiftMap = { [code: string]: ShiftDef };

/**
 * Computes a shift's duration in hours from "HH:MM" start/end times,
 * handling overnight wraparound (end <= start means it crosses midnight).
 * Matches how Deputy, 7shifts, and UKG all model shift time: duration is
 * derived from the time range, never a separately-typed number a human
 * can get wrong.
 */
export function computeShiftDuration(start: string, end: string): number {
  const toMinutes = (t: string) => {
    const parts = t.split(':');
    if (parts.length !== 2) return null;
    const h = Number(parts[0]);
    const m = Number(parts[1]);
    // Number('') is 0, not NaN, so an empty/missing half (e.g. "" or ":30")
    // would otherwise slip past a Number.isNaN-only check and produce NaN
    // further down instead of being rejected here.
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return h * 60 + m;
  };
  const startMin = toMinutes(start);
  const endMin = toMinutes(end);
  if (startMin === null || endMin === null) return 0;
  let diff = endMin - startMin;
  if (diff <= 0) diff += 24 * 60; // overnight wraparound
  return Math.round((diff / 60) * 100) / 100; // round to 2dp for fractional shifts
}

// Parses a "YYYY-MM-DD" string as a local midnight Date, instead of new
// Date(str)'s UTC-midnight parsing — which, in any timezone ahead of UTC,
// carries a non-zero local time-of-day that throws off later <= comparisons
// against dates built directly from Y/M/D (see getDatesForCycle below).
function parseLocalDateOnly(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

// Generate days between start (e.g. 2026-06-15) and end (e.g. 2026-07-14) inclusive
export function getDatesForCycle(startStr: string, endStr?: string): string[] {
  const start = parseLocalDateOnly(startStr);
  let end: Date;

  if (endStr) {
    end = parseLocalDateOnly(endStr);
  } else {
    // Smart default detection based on start day:
    const startDay = start.getDate();
    if (startDay === 1) {
      // Standard Calendar Month (from 1st to late/end of same month)
      end = new Date(start.getFullYear(), start.getMonth() + 1, 0); // last day of current month
    } else if (startDay === 15) {
      // Standard 15th-to-14th cycle
      end = new Date(start.getFullYear(), start.getMonth() + 1, 14); // 14th of next month
    } else {
      // General fallback: standard 30-day billing/scheduling window
      end = new Date(start.getTime() + 29 * 864e5);
    }
  }

  const dates: string[] = [];
  const current = new Date(start);

  while (current <= end) {
    const yyyy = current.getFullYear();
    const mm = String(current.getMonth() + 1).padStart(2, '0');
    const dd = String(current.getDate()).padStart(2, '0');
    dates.push(`${yyyy}-${mm}-${dd}`);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

export function isWeekend(dateStr: string): boolean {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  return day === 0 || day === 6; // Sunday or Saturday
}

export function isPublicHoliday(dateStr: string, holidays: PublicHoliday[]): boolean {
  return holidays.some(h => h.date === dateStr);
}

// Calculate hours stats for a staff member in a cycle
export interface WorkHrsStats {
  totalHrs: number;
  baseHrs: number;
  overtime: number;
  sundayHrs: number;
  weeklyEShifts: number;
  monthlySCShifts: number;
  phHrs: number;
  leaveDays: number;
  mdCount: number;
  callShiftCount: number;
}

export function calculateStaffStats(
  staff: StaffMember,
  shifts: string[],
  dates: string[],
  holidays: PublicHoliday[],
  extraHours: { [date: string]: number } = {},
  shiftDefs: ShiftMap = SHIFT_PRESET_STANDARD,
  leaveCodes: string[] = ['AL', 'SL', 'CO']
): WorkHrsStats {
  let baseHrs = 0;
  let sundayHrs = 0;
  let phHrs = 0;
  let weeklyEShifts = 0;
  let monthlySCShifts = 0;
  let leaveDays = 0;
  let mdCount = 0;
  let callShiftCount = 0;

  shifts.forEach((code, idx) => {
    const shiftDate = dates[idx];
    const isSun = new Date(shiftDate + 'T00:00:00').getDay() === 0;
    const isPH = isPublicHoliday(shiftDate, holidays);
    const def = shiftDefs[code];

    if (def) {
      if (def.hours > 0) {
        baseHrs += def.hours;
        if (isPH) phHrs += def.hours;
        else if (isSun) sundayHrs += def.hours;
      }
      if (code === 'E') weeklyEShifts++;
      if (code === 'SC') monthlySCShifts++;
      if (code === 'D') callShiftCount++;
      if (leaveCodes.includes(code)) leaveDays++;
      if (code === 'MD') mdCount++;
    }
  });

  // Calculate Extra Hours
  let totalExtraHrs = 0;
  Object.entries(extraHours).forEach(([dKey, hVal]) => {
    if (dates.includes(dKey)) {
      totalExtraHrs += hVal;
      const isSun = new Date(dKey + 'T00:00:00').getDay() === 0;
      const isPH = isPublicHoliday(dKey, holidays);
      if (isPH) phHrs += hVal;
      else if (isSun) sundayHrs += hVal;
    }
  });

  const totalHrs = baseHrs + totalExtraHrs;
  const normalWorkingHrs = totalHrs - sundayHrs - phHrs;
  const overtime = Math.max(0, normalWorkingHrs - staff.contractedHours);

  return {
    totalHrs,
    baseHrs,
    overtime,
    sundayHrs,
    weeklyEShifts,
    monthlySCShifts,
    phHrs,
    leaveDays,
    mdCount,
    callShiftCount
  };
}

// Helper: does a staff member match an eligibility selector?
function matchesEligibility(staff: StaffMember, eligibility: { field: string; value?: string }): boolean {
  if (eligibility.field === 'all') return true;
  if (eligibility.field === 'gender') return staff.gender === eligibility.value;
  if (eligibility.field === 'role') return staff.role === eligibility.value;
  return false;
}

// Smart "Persona" Rotation Optimizer — fully rule-driven.
// Every scheduling decision (manager track, auto-assignments, personal day off,
// rotation archetypes, rest constraints) is read from the supplied RosterRuleSet,
// so any organization can map its own structure without code changes.
export function runSmartPersonaOptimizer(
  staffList: StaffMember[],
  dates: string[],
  holidays: PublicHoliday[],
  absences: { [staffId: string]: { [date: string]: string } } = {},
  ruleSet: RosterRuleSet = buildDefaultRuleSet()
): { [staffId: string]: string[] } {
  const result: { [staffId: string]: string[] } = {};
  const numDays = dates.length;
  const phSet = new Set(holidays.map(h => h.date));
  const manager = staffList.find(s => s.isManager);
  const dowOf = (idx: number) => new Date(dates[idx] + 'T00:00:00').getDay();
  const isWeekendDay = (idx: number) => dowOf(idx) === 0 || dowOf(idx) === 6;
  const isPHDay = (idx: number) => phSet.has(dates[idx]);

  // Initialize shift tracks for everyone
  staffList.forEach(s => {
    result[s.id] = new Array(numDays).fill('');
  });

  // Apply pre-existing absences/leave blocks
  staffList.forEach(s => {
    const staffAbsence = absences[s.id] || {};
    for (let d = 0; d < numDays; d++) {
      if (staffAbsence[dates[d]]) {
        result[s.id][d] = staffAbsence[dates[d]];
      }
    }
  });

  // Step 1: Manager standard track
  if (manager && ruleSet.managerTrack) {
    for (let d = 0; d < numDays; d++) {
      if (result[manager.id][d]) continue; // already has leave
      const off = isWeekendDay(d) || isPHDay(d);
      result[manager.id][d] = off ? ruleSet.managerTrack.weekendShift : ruleSet.managerTrack.weekdayShift;
    }
  }

  // Step 2: Configurable auto-assignments (e.g. last-day stock count)
  (ruleSet.autoAssignments || []).forEach(rule => {
    const eligible = staffList.filter(s => rule.appliesToManagers ? true : !s.isManager);
    const targetDays: number[] = [];
    if (rule.trigger === 'last-day') {
      if (numDays > 0) targetDays.push(numDays - 1);
    } else if (rule.trigger === 'weekly-dow') {
      for (let d = 0; d < numDays; d++) {
        if ((rule.dow || []).includes(dowOf(d))) targetDays.push(d);
      }
    }
    targetDays.forEach(d => {
      let assigned = 0;
      const cap = rule.count ?? eligible.length;
      eligible.forEach(s => {
        if (assigned < cap && !result[s.id][d]) {
          result[s.id][d] = rule.shiftCode;
          assigned++;
        }
      });
    });
  });

  // Step 3: Optional personal day off (generic eligibility — no baked-in assumptions)
  const pdo = ruleSet.personalDayOff;
  if (pdo && pdo.enabled) {
    const eligibleStaff = staffList.filter(s => !s.isManager && matchesEligibility(s, pdo.eligibility));
    eligibleStaff.forEach(s => {
      if (result[s.id].includes(pdo.shiftCode)) return;
      const start = Math.max(0, pdo.window.startDay);
      const stop = Math.max(start, numDays - pdo.window.endDay); // endDay = margin left at cycle end
      for (let d = start; d < stop; d++) {
        if (result[s.id][d]) continue;
        if (pdo.window.allowedDows.includes(dowOf(d)) && !isPHDay(d)) {
          result[s.id][d] = pdo.shiftCode;
          break;
        }
      }
    });
  }

  // Step 4: Rotation tracks (round-robin per person per week)
  const regularStaff = staffList.filter(s => !s.isManager);
  const tracks = ruleSet.rotationTracks || [];

  if (tracks.length > 0) {
    for (let d = 0; d < numDays; d++) {
      const isWknd = isWeekendDay(d);
      const isPH = isPHDay(d);
      const dow = dowOf(d);
      const weekNum = Math.floor(d / 7);

      regularStaff.forEach((s, idx) => {
        if (result[s.id][d]) return; // locked by leave / auto-assignment / personal day off

        const track = tracks[(idx + weekNum) % tracks.length];
        let shiftToAssign: string;

        if (isWknd || isPH) {
          shiftToAssign = track.weekendShift;
        } else if (track.midWeekRestDows && track.midWeekRestDows.includes(dow)) {
          shiftToAssign = track.weekendShift; // use the track's "off-style" shift for mid-week rest
        } else if (track.weekdayOnly && !(dow >= 1 && dow <= 4)) {
          shiftToAssign = track.weekendShift; // weekday-only tracks (e.g. Mon–Thu nights) rest otherwise
        } else {
          shiftToAssign = track.weekdayShift;
        }

        result[s.id][d] = shiftToAssign;
      });
    }
  }

  // Step 5: Rest-constraint failsafes (clopen + max consecutive working days)
  const rc = ruleSet.restConstraints;
  const restShift = (rc.nonWorkingCodes && rc.nonWorkingCodes[0]) || 'OFF';
  regularStaff.forEach(s => {
    let consecutiveDays = 0;
    for (let d = 0; d < numDays; d++) {
      const shiftToday = result[s.id][d];
      const shiftYest = d > 0 ? result[s.id][d - 1] : restShift;
      const isAbsence = absences[s.id]?.[dates[d]] !== undefined;

      // Clopen: a late shift cannot be immediately followed by an early shift
      if (rc.lateShifts.includes(shiftYest) && rc.earlyShifts.includes(shiftToday) && !isAbsence) {
        result[s.id][d] = restShift;
      }

      // Max consecutive working days
      const current = result[s.id][d];
      const isWorking = !rc.nonWorkingCodes.includes(current);
      if (isWorking) {
        consecutiveDays++;
        if (rc.maxConsecutiveWorkDays > 0 && consecutiveDays >= rc.maxConsecutiveWorkDays && !isAbsence) {
          result[s.id][d] = restShift;
          consecutiveDays = 0;
        }
      } else {
        consecutiveDays = 0;
      }
    }
  });

  return result;
}

// Validate an existing roster against the workspace rest constraints. Returns
// real, specific findings (no simulation) for the dashboard health check.
export interface RosterHealthIssue {
  staffName: string;
  date: string;
  kind: 'clopen' | 'over-consecutive' | 'unfilled';
  detail: string;
}

export interface RosterHealth {
  ok: boolean;
  totalSlots: number;
  filledSlots: number;
  issues: RosterHealthIssue[];
}

export function validateRoster(
  shiftsByStaff: { [staffId: string]: string[] },
  staffList: StaffMember[],
  dates: string[],
  ruleSet: RosterRuleSet = buildDefaultRuleSet()
): RosterHealth {
  const rc = ruleSet.restConstraints;
  const issues: RosterHealthIssue[] = [];
  let totalSlots = 0;
  let filledSlots = 0;

  staffList.forEach(s => {
    const codes = shiftsByStaff[s.id] || [];
    let consecutive = 0;
    for (let d = 0; d < dates.length; d++) {
      totalSlots++;
      const today = codes[d] || '';
      if (today) filledSlots++;
      else {
        issues.push({ staffName: s.name, date: dates[d], kind: 'unfilled', detail: 'No shift assigned' });
        consecutive = 0;
        continue;
      }

      const yest = d > 0 ? (codes[d - 1] || '') : '';
      if (rc.lateShifts.includes(yest) && rc.earlyShifts.includes(today)) {
        issues.push({ staffName: s.name, date: dates[d], kind: 'clopen', detail: `${yest} → ${today} with no rest` });
      }

      const isWorking = !rc.nonWorkingCodes.includes(today);
      if (isWorking) {
        consecutive++;
        if (rc.maxConsecutiveWorkDays > 0 && consecutive > rc.maxConsecutiveWorkDays) {
          issues.push({ staffName: s.name, date: dates[d], kind: 'over-consecutive', detail: `${consecutive} days worked in a row` });
        }
      } else {
        consecutive = 0;
      }
    }
  });

  return { ok: issues.length === 0, totalSlots, filledSlots, issues };
}

// Seed a fully-populated first roster cycle using the workspace ruleset.
export function generateSeedShifts(
  staffList: StaffMember[],
  dates: string[],
  holidays: PublicHoliday[],
  ruleSet: RosterRuleSet = buildDefaultRuleSet()
): { [staffId: string]: string[] } {
  return runSmartPersonaOptimizer(staffList, dates, holidays, {}, ruleSet);
}

/**
 * Aligns shift arrays of a cycle to a new set of dates, preserving assignments by calendar date.
 */
export function alignShiftsToNewDates(
  oldShifts: { [staffId: string]: string[] },
  oldDates: string[],
  newDates: string[]
): { [staffId: string]: string[] } {
  const aligned: { [staffId: string]: string[] } = {};
  
  Object.keys(oldShifts).forEach(staffId => {
    const oldStaffShifts = oldShifts[staffId] || [];
    // Map existing dates to their shift codes
    const dateToShiftMap = new Map<string, string>();
    oldDates.forEach((date, idx) => {
      if (idx < oldStaffShifts.length) {
        dateToShiftMap.set(date, oldStaffShifts[idx]);
      }
    });
    
    // Create new array for new dates
    aligned[staffId] = newDates.map(date => dateToShiftMap.get(date) || 'OFF');
  });
  
  return aligned;
}
