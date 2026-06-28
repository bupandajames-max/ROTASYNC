import { describe, it, expect } from 'vitest';
import { calculateElapsedHours, formatMinutesToTime, parseTimeToMinutes, reevaluateTimesheetDay, sumTimesheetTotals, reconcileTimesheetWithRoster, generateDefaultTimesheet } from './timesheetUtils';
import { Timesheet, TimesheetDay, RosterCycle, StaffMember } from '../types';

const baseDay = (overrides: Partial<TimesheetDay> = {}): TimesheetDay => ({
  date: '2026-06-16', // a Tuesday, not a Sunday
  scheduledShift: 'A',
  actualShift: 'A',
  clockIn: '08:00',
  clockOut: '17:00',
  lunchBreakMinutes: 60,
  workType: 'Worked Shift',
  regularWorkedHours: 0,
  sundayWorkedHours: 0,
  overtimeHours: 0,
  holidayWorkedHours: 0,
  leaveHours: 0,
  ...overrides,
});

describe('parseTimeToMinutes / formatMinutesToTime', () => {
  it('round-trips a normal time', () => {
    expect(parseTimeToMinutes('08:30')).toBe(510);
    expect(formatMinutesToTime(510)).toBe('08:30');
  });

  it('parseTimeToMinutes returns 0 for empty/malformed input rather than NaN', () => {
    expect(parseTimeToMinutes('')).toBe(0);
    expect(Number.isNaN(parseTimeToMinutes(''))).toBe(false);
  });
});

describe('calculateElapsedHours', () => {
  it('computes a same-day shift minus its lunch break', () => {
    expect(calculateElapsedHours('08:00', '17:00', 60)).toBe(8);
  });

  it('handles an overnight shift crossing midnight', () => {
    expect(calculateElapsedHours('20:00', '08:00', 0)).toBe(12);
  });

  it('never goes negative even if the break exceeds the worked span', () => {
    expect(calculateElapsedHours('08:00', '08:30', 60)).toBe(0);
  });

  it('returns 0 when either clock time is missing', () => {
    expect(calculateElapsedHours('', '17:00', 60)).toBe(0);
    expect(calculateElapsedHours('08:00', '', 60)).toBe(0);
  });
});

describe('reevaluateTimesheetDay', () => {
  it('zeroes all hour buckets and credits 8 leave hours for Leave Taken', () => {
    const day = baseDay({ workType: 'Leave Taken', clockIn: '08:00', clockOut: '17:00' });
    const result = reevaluateTimesheetDay(day, day.date, []);
    expect(result.leaveHours).toBe(8);
    expect(result.regularWorkedHours).toBe(0);
    expect(result.clockIn).toBe('');
  });

  it('zeroes everything for Absent, including leave hours', () => {
    const day = baseDay({ workType: 'Absent' });
    const result = reevaluateTimesheetDay(day, day.date, []);
    expect(result.regularWorkedHours).toBe(0);
    expect(result.leaveHours).toBe(0);
  });

  it('credits a normal weekday worked shift as regular hours, not overtime, when within the scheduled shift length', () => {
    const day = baseDay(); // shift A = 8h scheduled, worked exactly 8h net
    const result = reevaluateTimesheetDay(day, day.date, []);
    expect(result.regularWorkedHours).toBe(8);
    expect(result.overtimeHours).toBe(0);
  });

  it('splits hours worked beyond the scheduled shift length into overtime', () => {
    const day = baseDay({ clockOut: '19:00' }); // 08:00-19:00 minus 1h lunch = 10h net vs 8h scheduled
    const result = reevaluateTimesheetDay(day, day.date, []);
    expect(result.regularWorkedHours).toBe(8);
    expect(result.overtimeHours).toBe(2);
  });

  it('routes a Sunday worked shift to sundayWorkedHours instead of regular', () => {
    const day = baseDay({ date: '2026-06-14' }); // a Sunday
    const result = reevaluateTimesheetDay(day, day.date, []);
    expect(result.sundayWorkedHours).toBe(8);
    expect(result.regularWorkedHours).toBe(0);
  });

  it('routes a public holiday worked shift to holidayWorkedHours, taking priority over Sunday', () => {
    const day = baseDay({ date: '2026-06-14' }); // Sunday AND a holiday
    const result = reevaluateTimesheetDay(day, day.date, [{ date: '2026-06-14', name: 'Test Holiday' }]);
    expect(result.holidayWorkedHours).toBe(8);
    expect(result.sundayWorkedHours).toBe(0);
  });

  it('credits the full elapsed time as overtime for an explicit Overtime Duty entry, ignoring the standard shift cap', () => {
    const day = baseDay({ workType: 'Overtime Duty', clockOut: '21:00' }); // 12h net
    const result = reevaluateTimesheetDay(day, day.date, []);
    expect(result.overtimeHours).toBe(12);
    expect(result.regularWorkedHours).toBe(0);
  });
});

describe('sumTimesheetTotals', () => {
  it('sums all four paid hour buckets into total, excluding leave', () => {
    const timesheet: Timesheet = {
      id: 't1', staffId: 's1', staffName: 'Test', cycleId: 'c1', status: 'Draft',
      days: {
        d1: baseDay({ regularWorkedHours: 8 }),
        d2: baseDay({ date: '2026-06-14', sundayWorkedHours: 8 }),
        d3: baseDay({ workType: 'Leave Taken', leaveHours: 8, regularWorkedHours: 0 }),
      },
    };
    const totals = sumTimesheetTotals(timesheet);
    expect(totals.total).toBe(16); // regular + sunday, NOT leave
    expect(totals.leave).toBe(8);
    expect(totals.activeWorkedDaysCount).toBe(2); // the two worked days, not the leave day
  });

  it('returns all zeros for a timesheet with no days', () => {
    const timesheet: Timesheet = { id: 't1', staffId: 's1', staffName: 'Test', cycleId: 'c1', status: 'Draft', days: {} };
    const totals = sumTimesheetTotals(timesheet);
    expect(totals.total).toBe(0);
    expect(totals.activeWorkedDaysCount).toBe(0);
  });
});

describe('reconcileTimesheetWithRoster', () => {
  const cycle: RosterCycle = {
    id: 'c1',
    startDate: '2026-06-15',
    endDate: '2026-06-16',
    shifts: { 's1': ['A', 'OFF'] },
  };
  const dates = ['2026-06-15', '2026-06-16'];

  it('picks up a roster shift that was edited after the timesheet was first generated', () => {
    // Simulates the bug report: timesheet generated while the roster still
    // said OFF, then the manager assigned a real shift afterward.
    const stale: Timesheet = {
      id: 'ts1', staffId: 's1', staffName: 'Test', cycleId: 'c1', status: 'Draft',
      days: {
        '2026-06-15': baseDay({ date: '2026-06-15', scheduledShift: 'OFF', actualShift: 'OFF', clockIn: '', clockOut: '', workType: 'Absent' }),
        '2026-06-16': baseDay({ date: '2026-06-16', scheduledShift: 'OFF', actualShift: 'OFF', clockIn: '', clockOut: '', workType: 'Absent' }),
      },
    };

    const { timesheet, changed } = reconcileTimesheetWithRoster(stale, cycle, 's1', dates, []);
    expect(changed).toBe(true);
    expect(timesheet.days['2026-06-15'].scheduledShift).toBe('A');
    expect(timesheet.days['2026-06-15'].workType).toBe('Worked Shift');
    expect(timesheet.days['2026-06-16'].scheduledShift).toBe('OFF'); // unchanged, still genuinely off
  });

  it('never overwrites a day the staff member has actually logged', () => {
    const withRealEntry: Timesheet = {
      id: 'ts1', staffId: 's1', staffName: 'Test', cycleId: 'c1', status: 'Draft',
      days: {
        '2026-06-15': baseDay({ date: '2026-06-15', scheduledShift: 'OFF', clockIn: '09:00', clockOut: '18:00', isModified: true }),
        // Stale 'A' for a day the roster now says is OFF — unmodified, so should reconcile.
        '2026-06-16': baseDay({ date: '2026-06-16', scheduledShift: 'A', actualShift: 'A', clockIn: '07:00', clockOut: '16:00', workType: 'Worked Shift' }),
      },
    };

    const { timesheet, changed } = reconcileTimesheetWithRoster(withRealEntry, cycle, 's1', dates, []);
    // Day 1 was modified by the staff member — left untouched even though
    // the roster now says 'A', not 'OFF'.
    expect(timesheet.days['2026-06-15'].scheduledShift).toBe('OFF');
    expect(timesheet.days['2026-06-15'].clockIn).toBe('09:00');
    // Day 2 still reconciles normally since it wasn't modified.
    expect(timesheet.days['2026-06-16'].scheduledShift).toBe('OFF');
    expect(changed).toBe(true);
  });

  it('reports unchanged when the roster already matches', () => {
    const inSync: Timesheet = {
      id: 'ts1', staffId: 's1', staffName: 'Test', cycleId: 'c1', status: 'Draft',
      days: {
        '2026-06-15': buildExpectedDay('2026-06-15', 'A'),
        '2026-06-16': buildExpectedDay('2026-06-16', 'OFF'),
      },
    };
    const { changed } = reconcileTimesheetWithRoster(inSync, cycle, 's1', dates, []);
    expect(changed).toBe(false);
  });
});

// Mirrors what buildScheduledDay would produce, for the "already in sync" test above.
function buildExpectedDay(date: string, scheduledShift: string): TimesheetDay {
  return baseDay({
    date,
    scheduledShift,
    actualShift: scheduledShift,
    clockIn: scheduledShift === 'A' ? '07:00' : '',
    clockOut: scheduledShift === 'A' ? '16:00' : '',
    lunchBreakMinutes: scheduledShift === 'A' ? 60 : 0,
    workType: scheduledShift === 'A' ? 'Worked Shift' : 'Absent',
    regularWorkedHours: scheduledShift === 'A' ? 8 : 0,
  });
}

describe('generateDefaultTimesheet', () => {
  const staff: StaffMember = { id: 's1', name: 'Test', fullName: 'Test Staff', role: 'Operator', email: '', phone: '', isManager: false, contractedHours: 168, gender: '', employeeNo: '' };

  it('treats a built-in leave code as Leave Taken, not a worked shift', () => {
    // Regression test: every built-in leave type (AL, SL, CO, MD) is also
    // configured with hours: 8 (so contracted-hours math counts it as a
    // normal day) — without an explicit isLeave check, that hours > 0 alone
    // would wrongly route it into the "Worked Shift" branch with fake
    // clock-in/out times instead of being credited as leave.
    const cycle: RosterCycle = { id: 'c1', startDate: '2026-06-16', endDate: '2026-06-16', shifts: { s1: ['AL'] } };
    const ts = generateDefaultTimesheet(staff, cycle, ['2026-06-16'], []);
    const day = ts.days['2026-06-16'];
    expect(day.workType).toBe('Leave Taken');
    expect(day.leaveHours).toBe(8);
    expect(day.clockIn).toBe('');
    expect(day.regularWorkedHours).toBe(0);
  });

  it('recognizes a workspace-custom leave code via the live shifts map', () => {
    const cycle: RosterCycle = { id: 'c1', startDate: '2026-06-16', endDate: '2026-06-16', shifts: { s1: ['BL'] } };
    const customShifts = { BL: { code: 'BL', name: 'Bereavement Leave', time: 'Paid leave', hours: 8, bg: '#fff', fg: '#000', active: true, isLeave: true } };
    const ts = generateDefaultTimesheet(staff, cycle, ['2026-06-16'], [], customShifts);
    const day = ts.days['2026-06-16'];
    expect(day.workType).toBe('Leave Taken');
    expect(day.leaveHours).toBe(8);
  });

  it('still treats a normal work shift as Worked Shift', () => {
    const cycle: RosterCycle = { id: 'c1', startDate: '2026-06-16', endDate: '2026-06-16', shifts: { s1: ['A'] } };
    const ts = generateDefaultTimesheet(staff, cycle, ['2026-06-16'], []);
    const day = ts.days['2026-06-16'];
    expect(day.workType).toBe('Worked Shift');
    expect(day.regularWorkedHours).toBeGreaterThan(0);
  });
});
