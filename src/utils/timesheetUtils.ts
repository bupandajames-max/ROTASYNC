import { TimesheetDay, Timesheet, StaffMember, RosterCycle, PublicHoliday } from '../types';
import { SHIFTS } from '../data/initialData';
import { isPublicHoliday } from './rosterUtils';

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

// Initialize a blank/default timesheet for a staff member based on their scheduled shifts in the cycle
export function generateDefaultTimesheet(
  staff: StaffMember,
  cycle: RosterCycle,
  dates: string[],
  holidays: PublicHoliday[]
): Timesheet {
  const days: { [dateStr: string]: TimesheetDay } = {};
  
  dates.forEach((dateStr, idx) => {
    const scheduledCode = cycle.shifts[staff.id]?.[idx] || 'OFF';
    const shiftDef = SHIFTS[scheduledCode];
    
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
    
    // Determine defaults based on scheduled shift
    if (shiftDef && shiftDef.hours > 0) {
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
      const isSun = new Date(dateStr).getDay() === 0;
      const isPH = isPublicHoliday(dateStr, holidays);
      
      if (isPH) {
        holidayWorkedHours = elapsed;
      } else if (isSun) {
        sundayWorkedHours = elapsed;
      } else {
        regularWorkedHours = elapsed;
      }
    } else if (['AL', 'SL', 'CO', 'MD', 'TRN', 'OS'].includes(scheduledCode)) {
      workType = 'Leave Taken';
      leaveHours = 8; // standard credited hours for statistics
    } else {
      // Day off
      workType = 'Absent'; // defaults to rest, i.e. not worked
    }
    
    days[dateStr] = {
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

// Recalculates all hours for a single timesheet day based on modern clock values and status
export function reevaluateTimesheetDay(day: TimesheetDay, dateStr: string, holidays: PublicHoliday[]): TimesheetDay {
  const updated = { ...day };
  
  if (updated.workType === 'Leave Taken') {
    updated.clockIn = '';
    updated.clockOut = '';
    updated.lunchBreakMinutes = 0;
    updated.regularWorkedHours = 0;
    updated.sundayWorkedHours = 0;
    updated.overtimeHours = 0;
    updated.holidayWorkedHours = 0;
    updated.leaveHours = 8;
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
  const isSun = new Date(dateStr).getDay() === 0;
  const isPH = isPublicHoliday(dateStr, holidays);
  
  // Standard Shift Reference
  const originalShiftDef = SHIFTS[updated.scheduledShift];
  const standardExpectedHours = originalShiftDef ? originalShiftDef.hours : 8;
  
  // Initialize to zero
  updated.regularWorkedHours = 0;
  updated.sundayWorkedHours = 0;
  updated.holidayWorkedHours = 0;
  updated.overtimeHours = 0;
  updated.leaveHours = 0;
  
  if (isPH) {
    // Under Zambia guidelines, all public holiday work is premium holidayWorkedHours
    updated.holidayWorkedHours = totalNetHours;
  } else if (isSun) {
    // Sundays are premium sundayWorkedHours
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
