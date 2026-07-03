import { describe, it, expect } from 'vitest';
import { computeShiftDuration, getDatesForCycle, isPublicHoliday, runSmartPersonaOptimizer } from './rosterUtils';
import { buildDefaultRuleSet } from '../data/initialData';
import type { StaffMember } from '../types';

describe('runSmartPersonaOptimizer with the default ruleset', () => {
  const mkStaff = (id: string, isManager = false): StaffMember => ({
    id, name: id, fullName: id, email: `${id}@example.com`, role: 'Member',
    phone: '', contractedHours: 168, gender: '', employeeNo: id, isManager,
  });

  it('generates a real roster (not all-Off) for a fresh workspace', () => {
    // Regression for the "initial roster is all Off" bug: the old default
    // ruleset had no manager track and no rotation tracks, so the optimizer
    // left everyone unassigned. The default must schedule real work shifts.
    const staff = [mkStaff('mgr', true), mkStaff('a'), mkStaff('b')];
    // Mon–Fri 2026-06-15..19 (all weekdays), no holidays/absences.
    const dates = ['2026-06-15', '2026-06-16', '2026-06-17', '2026-06-18', '2026-06-19'];
    const shifts = runSmartPersonaOptimizer(staff, dates, [], {}, buildDefaultRuleSet());

    for (const s of staff) {
      const assigned = shifts[s.id];
      expect(assigned).toHaveLength(5);
      // Every weekday should have a real work shift, none left as OFF/blank.
      const workedDays = assigned.filter(code => code && code !== 'OFF').length;
      expect(workedDays).toBe(5);
    }
  });
});

describe('computeShiftDuration', () => {
  it('computes a same-day shift correctly', () => {
    expect(computeShiftDuration('08:00', '17:00')).toBe(9);
  });

  it('handles overnight wraparound (end time earlier than start)', () => {
    expect(computeShiftDuration('20:00', '08:00')).toBe(12);
  });

  it('rounds fractional hours to 2 decimal places', () => {
    expect(computeShiftDuration('08:00', '08:45')).toBe(0.75);
  });

  it('treats an identical start/end as a full 24h overnight wrap, not zero', () => {
    // diff <= 0 is the overnight branch, so 00:00-00:00 wraps to 24h rather
    // than silently producing a zero-hour shift.
    expect(computeShiftDuration('09:00', '09:00')).toBe(24);
  });

  it('returns 0 for malformed input instead of throwing', () => {
    expect(computeShiftDuration('', '17:00')).toBe(0);
    expect(computeShiftDuration('not-a-time', '17:00')).toBe(0);
  });
});

describe('getDatesForCycle', () => {
  it('returns every date inclusive between an explicit start and end', () => {
    const dates = getDatesForCycle('2026-06-15', '2026-06-17');
    expect(dates).toEqual(['2026-06-15', '2026-06-16', '2026-06-17']);
  });

  it('defaults a 1st-of-month start to the full calendar month', () => {
    const dates = getDatesForCycle('2026-06-01');
    expect(dates[0]).toBe('2026-06-01');
    expect(dates[dates.length - 1]).toBe('2026-06-30');
  });

  it('defaults a 15th-of-month start to a 15th-to-14th cycle', () => {
    const dates = getDatesForCycle('2026-06-15');
    expect(dates[0]).toBe('2026-06-15');
    expect(dates[dates.length - 1]).toBe('2026-07-14');
  });
});

describe('isPublicHoliday', () => {
  it('matches a date present in the holiday list', () => {
    expect(isPublicHoliday('2026-01-01', [{ date: '2026-01-01', name: "New Year's Day" }])).toBe(true);
  });

  it('does not match a date absent from the holiday list', () => {
    expect(isPublicHoliday('2026-01-02', [{ date: '2026-01-01', name: "New Year's Day" }])).toBe(false);
  });

  it('handles an empty holiday list without throwing', () => {
    expect(isPublicHoliday('2026-01-01', [])).toBe(false);
  });
});
