import { TimesheetDay, Timesheet, StaffMember, RosterCycle, PublicHoliday, ShiftDef } from '../types';
import { isPublicHoliday } from './rosterUtils';

// All five functions below accept an optional `shifts` map: the workspace's
// own configured shifts (Settings → Shift Planner), layered over the
// built-in defaults via the shared mergeShiftDefs helper. Without it they'd
// only recognize the small built-in shift/leave codes — a custom code (e.g.
// a workspace-specific leave type) would silently be misjudged as a plain
// absence instead of paid leave, or get the wrong overtime threshold.
import { mergeShiftDefs as resolveShiftDefs } from './shiftDefs';

// Helper to convert HH:MM string to absolute clock minutes
export function parseTimeToMinutes(timeStr: string): number {
  if (!timeStr || !timeStr.includes(':')) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

// Convert minutes to a formatted "HH:MM" string
export function formatMinutesToTime(totalMins: number): string {
  const h = Math.floor(totalMins / 60) % 24;
  const m = totalMins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Calculate actual duration worked based on check-in, check-out, and break
export function calculateElapsedHours(clockIn: string, clockOut: string, lunchBreakMins: number): number {
  if (!clockIn || !clockOut) return 0;
  
  let inMins = parseTimeToMinutes(clockIn);
  let outMins = parseTimeToMinutes(clockOut);
  
  let diff = outMins - inMins;
  if (diff < 0) {
    // Overnight shift (crosses midnight)
    diff = (1440 - inMins) + outMins;
  }
  
  const netMins = Math.max(0, diff - lunchBreakMins);
  return Number((netMins / 60).toFixed(2));
}

// Builds a single day's default (un-edited) timesheet entry purely from the
// roster's scheduled shift code — the one place that turns "what the roster
// says" into "what the timesheet shows" for a day nobody has touched yet.
// Shared by generateDefaultTimesheet (new timesheets) and
// reconcileTimesheetWithRoster (keeping existing ones in sync with later
// roster edits), so the two can never drift into different logic.
function buildScheduledDay(dateStr: string, scheduledCode: string, holidays: PublicHoliday[], shifts?: { [code: string]: ShiftDef }): TimesheetDay {
  const shiftDefs = resolveShiftDefs(shifts);
  const shiftDef = shiftDefs[scheduledCode];

  let actualShift = scheduledCode;
  let clockIn = '';
  let clockOut = '';
  let lunchBreakMinutes = 0;
  let workType: TimesheetDay['workType'] = 'Absent';

  let regularWorkedHours = 0;
  let sundayWorkedHours = 0;
  let overtimeHours = 0;
  let holidayWorkedHours = 0;
  let leaveHours = 0;

  // Determine defaults based on scheduled shift. The isLeave check matters:
  // every leave type here is also configured with hours: 8 (so contracted-
  // hours math elsewhere counts a leave day as a normal day), which would
  // otherwise make this branch wrongly treat a leave day as a worked shift
  // with fake clock-in/out times.
  if (shiftDef && shiftDef.hours > 0 && !shiftDef.isLeave) {
    workType = 'Worked Shift';
    lunchBreakMinutes = scheduledCode === 'N' ? 0 : 60; // night shift usually is 12h net directly, others get 1hr lunch

    // Seed realistic clock times
    if (scheduledCode === 'A' || scheduledCode === 'A+') {
      clockIn = '07:00';
      clockOut = scheduledCode === 'A' ? '16:00' : '17:00';
    } else if (scheduledCode === 'B') {
      clockIn = '10:00';
      clockOut = '18:00';
    } else if (scheduledCode === 'C') {
      clockIn = '11:00';
      clockOut = '19:00';
    } else if (scheduledCode === 'D') {
      clockIn = '15:00';
      clockOut = '23:00';
    } else if (scheduledCode === 'E') {
      clockIn = '08:00';
      clockOut = '19:00';
    } else if (scheduledCode === 'SC') {
      clockIn = '18:00';
      clockOut = '08:00'; // next day
    } else if (scheduledCode === 'N') {
      clockIn = '19:00';
      clockOut = '07:00'; // next day
    } else {
      // Fallback standard work day
      clockIn = '08:00';
      clockOut = '17:00';
    }

    const elapsed = calculateElapsedHours(clockIn, clockOut, lunchBreakMinutes);
    const isSun = new Date(dateStr + 'T00:00:00').getDay() === 0; // local parse — bare YYYY-MM-DD is UTC midnight, off by a day west of UTC
    const isPH = isPublicHoliday(dateStr, holidays);

    if (isPH) {
      holidayWorkedHours = elapsed;
    } else if (isSun) {
      sundayWorkedHours = elapsed;
    } else {
      regularWorkedHours = elapsed;
    }
  } else if (shiftDef?.isLeave && scheduledCode !== 'OFF') {
    // The 'OFF' exclusion matters: the built-in OFF (rest day) def carries
    // isLeave: true so the roster UI groups it with the non-working chips,
    // but a rest day is NOT paid leave — without this check every OFF day
    // in every timesheet was classified 'Leave Taken' and, because OFF has
    // hours: 0, fell into the 8h fallback below, crediting 8h of paid leave
    // per rest day (~a full contracted month of phantom leave on an empty
    // roster). Five other call sites already special-case OFF alongside
    // isLeave (RosterGrid, ManagerDashboard, StaffPortal) — this payroll
    // classifier was the one place that didn't.
    workType = 'Leave Taken';
    // Credit the leave type's own configured hours if it has one (e.g. a
    // half-day leave type), otherwise the standard 8h full-day credit.
    leaveHours = shiftDef.hours > 0 ? shiftDef.hours : 8;
  } else {
    // Day off
    workType = 'Absent'; // defaults to rest, i.e. not worked
  }

  return {
    date: dateStr,
    scheduledShift: scheduledCode,
    actualShift,
    clockIn,
    clockOut,
    lunchBreakMinutes,
    workType,
    regularWorkedHours,
    sundayWorkedHours,
    overtimeHours,
    holidayWorkedHours,
    leaveHours
  };
}

// Initialize a blank/default timesheet for a staff member based on their scheduled shifts in the cycle
export function generateDefaultTimesheet(
  staff: StaffMember,
  cycle: RosterCycle,
  dates: string[],
  holidays: PublicHoliday[],
  shifts?: { [code: string]: ShiftDef }
): Timesheet {
  const days: { [dateStr: string]: TimesheetDay } = {};

  dates.forEach((dateStr, idx) => {
    const scheduledCode = cycle.shifts[staff.id]?.[idx] || 'OFF';
    days[dateStr] = buildScheduledDay(dateStr, scheduledCode, holidays, shifts);
  });

  return {
    id: `ts-${staff.id}-${cycle.id}`,
    staffId: staff.id,
    staffName: staff.name,
    cycleId: cycle.id,
    days,
    status: 'Draft'
  };
}

// Keeps an existing timesheet's scheduled shifts in sync with later roster
// edits. The roster grid is the single source of truth for "what is this
// person scheduled to work" — a timesheet generated before a manager
// finishes drafting the roster would otherwise be frozen showing the old
// (often all-OFF) schedule forever, since nothing else ever re-reads the
// roster after the timesheet's first creation.
//
// Days the staff member has actually logged (`isModified`) are left alone —
// a real clock-in/out is a fact about what happened, not something a later
// roster edit should silently overwrite. Submitted/Approved timesheets are
// also a frozen record and should never be touched here; callers should
// only reconcile timesheets with status === 'Draft'.
export function reconcileTimesheetWithRoster(
  ts: Timesheet,
  cycle: RosterCycle,
  staffId: string,
  dates: string[],
  holidays: PublicHoliday[],
  shifts?: { [code: string]: ShiftDef }
): { timesheet: Timesheet; changed: boolean } {
  let changed = false;
  const days = { ...ts.days };

  dates.forEach((dateStr, idx) => {
    const scheduledCode = cycle.shifts[staffId]?.[idx] || 'OFF';
    const existing = days[dateStr];

    if (existing?.isModified) return; // a real logged entry — never overwrite

    // Second condition: self-heal rows corrupted by the old OFF-as-leave
    // classifier bug (rest days stored as 'Leave Taken' + 8h credited).
    // Those rows still have scheduledShift === 'OFF' matching the roster,
    // so the shift-changed check alone would never rebuild them and the
    // phantom leave credits would persist forever in every Draft timesheet
    // generated before the fix. isModified rows are already excluded above.
    if (!existing || existing.scheduledShift !== scheduledCode
        || (scheduledCode === 'OFF' && existing.workType === 'Leave Taken')) {
      days[dateStr] = buildScheduledDay(dateStr, scheduledCode, holidays, shifts);
      changed = true;
    }
  });

  return { timesheet: changed ? { ...ts, days } : ts, changed };
}

// Recalculates all hours for a single timesheet day based on modern clock values and status
export function reevaluateTimesheetDay(day: TimesheetDay, dateStr: string, holidays: PublicHoliday[], shifts?: { [code: string]: ShiftDef }): TimesheetDay {
  const updated = { ...day };
  const shiftDefs = resolveShiftDefs(shifts);

  if (updated.workType === 'Leave Taken') {
    const leaveDef = shiftDefs[updated.scheduledShift];
    updated.clockIn = '';
    updated.clockOut = '';
    updated.lunchBreakMinutes = 0;
    updated.regularWorkedHours = 0;
    updated.sundayWorkedHours = 0;
    updated.overtimeHours = 0;
    updated.holidayWorkedHours = 0;
    updated.leaveHours = leaveDef && leaveDef.hours > 0 ? leaveDef.hours : 8;
    return updated;
  }
  
  if (updated.workType === 'Absent') {
    updated.clockIn = '';
    updated.clockOut = '';
    updated.lunchBreakMinutes = 0;
    updated.regularWorkedHours = 0;
    updated.sundayWorkedHours = 0;
    updated.overtimeHours = 0;
    updated.holidayWorkedHours = 0;
    updated.leaveHours = 0;
    return updated;
  }
  
  // Handled Worked Shift, Overtime Active Duty, or On-Call active hours
  const totalNetHours = calculateElapsedHours(updated.clockIn, updated.clockOut, updated.lunchBreakMinutes);
  const isSun = new Date(dateStr + 'T00:00:00').getDay() === 0; // local parse — bare YYYY-MM-DD is UTC midnight, off by a day west of UTC
  const isPH = isPublicHoliday(dateStr, holidays);
  
  // Standard Shift Reference — the overtime threshold for this day is
  // whatever this workspace configured this shift's standard hours to be.
  const originalShiftDef = shiftDefs[updated.scheduledShift];
  const standardExpectedHours = originalShiftDef ? originalShiftDef.hours : 8;
  
  // Initialize to zero
  updated.regularWorkedHours = 0;
  updated.sundayWorkedHours = 0;
  updated.holidayWorkedHours = 0;
  updated.overtimeHours = 0;
  updated.leaveHours = 0;
  
  // Jurisdiction-specific rule, isolated here on purpose: this workspace's
  // payroll policy treats all public-holiday and Sunday work as premium-rate
  // hours, tracked separately from regular/overtime. The app only buckets
  // hours into these categories — it doesn't compute a dollar amount or
  // apply an actual 1.5x/2x multiplier, since there's no pay-rate field on
  // staff. If a workspace's policy differs (different premium days, or no
  // premium concept at all), that's a bigger product decision: which days
  // count as premium, not just a label change.
  if (isPH) {
    updated.holidayWorkedHours = totalNetHours;
  } else if (isSun) {
    updated.sundayWorkedHours = totalNetHours;
  } else {
    // Weekday/Saturday actuals
    if (updated.workType === 'Overtime Duty') {
      updated.overtimeHours = totalNetHours;
    } else {
      // Standard regular work up to standard limit, remaining is overtime
      if (totalNetHours > standardExpectedHours && standardExpectedHours > 0) {
        updated.regularWorkedHours = standardExpectedHours;
        updated.overtimeHours = Number((totalNetHours - standardExpectedHours).toFixed(2));
      } else {
        updated.regularWorkedHours = totalNetHours;
      }
    }
  }
  
  return updated;
}

// Aggregates totals over a timesheet for payroll reports
export function sumTimesheetTotals(timesheet: Timesheet) {
  let regular = 0;
  let sunday = 0;
  let overtime = 0;
  let holiday = 0;
  let leave = 0;
  let activeWorkedDaysCount = 0;
  
  Object.values(timesheet.days).forEach(day => {
    regular += day.regularWorkedHours;
    sunday += day.sundayWorkedHours;
    overtime += day.overtimeHours;
    holiday += day.holidayWorkedHours;
    leave += day.leaveHours;
    
    if (day.workType !== 'Absent' && day.workType !== 'Leave Taken') {
      if (day.regularWorkedHours > 0 || day.sundayWorkedHours > 0 || day.holidayWorkedHours > 0 || day.overtimeHours > 0) {
        activeWorkedDaysCount++;
      }
    }
  });
  
  return {
    regular: Number(regular.toFixed(1)),
    sunday: Number(sunday.toFixed(1)),
    overtime: Number(overtime.toFixed(1)),
    holiday: Number(holiday.toFixed(1)),
    leave: Number(leave.toFixed(1)),
    total: Number((regular + sunday + overtime + holiday).toFixed(1)),
    activeWorkedDaysCount
  };
}
