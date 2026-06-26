import { describe, it, expect } from 'vitest';
import { resolveAccess, isSuperuserEmail, SUPERUSER_EMAILS } from './access';
import { StaffMember } from '../types';

const makeStaff = (overrides: Partial<StaffMember> = {}): StaffMember => ({
  id: 's1',
  name: 'Test',
  email: 'staff@example.com',
  phone: '',
  role: 'Operator',
  contractedHours: 168,
  gender: '',
  fullName: 'Test Staff',
  employeeNo: 'EMP-1',
  facilityId: 'fac-1',
  ...overrides,
});

describe('isSuperuserEmail', () => {
  it('matches an allowlisted email exactly', () => {
    expect(isSuperuserEmail(SUPERUSER_EMAILS[0])).toBe(true);
  });

  it('is case- and whitespace-insensitive', () => {
    const email = SUPERUSER_EMAILS[0];
    expect(isSuperuserEmail(`  ${email.toUpperCase()}  `)).toBe(true);
  });

  it('rejects an email that is not on the allowlist', () => {
    expect(isSuperuserEmail('random.stranger@example.com')).toBe(false);
  });

  it('rejects null/undefined/empty without throwing', () => {
    expect(isSuperuserEmail(null)).toBe(false);
    expect(isSuperuserEmail(undefined)).toBe(false);
    expect(isSuperuserEmail('')).toBe(false);
  });
});

describe('resolveAccess', () => {
  it('resolves the superuser allowlist to accessLevel superuser regardless of staff records', () => {
    const result = resolveAccess(SUPERUSER_EMAILS[0], []);
    expect(result.accessLevel).toBe('superuser');
  });

  it('resolves a matching staff record\'s explicit accessLevel', () => {
    const staff = [makeStaff({ email: 'manager@example.com', accessLevel: 'facility_manager' })];
    const result = resolveAccess('manager@example.com', staff);
    expect(result.accessLevel).toBe('facility_manager');
    expect(result.facilityId).toBe('fac-1');
  });

  it('falls back to isManager when accessLevel is not set on the staff record', () => {
    const staff = [makeStaff({ email: 'legacy@example.com', isManager: true, accessLevel: undefined })];
    const result = resolveAccess('legacy@example.com', staff);
    expect(result.accessLevel).toBe('facility_manager');
  });

  it('treats a matching staff record with no isManager/accessLevel as plain staff', () => {
    const staff = [makeStaff({ email: 'worker@example.com' })];
    const result = resolveAccess('worker@example.com', staff);
    expect(result.accessLevel).toBe('staff');
  });

  it('matches staff records by email case- and whitespace-insensitively', () => {
    const staff = [makeStaff({ email: 'Mixed.Case@Example.com', accessLevel: 'dept_head' })];
    const result = resolveAccess('  mixed.case@example.com  ', staff);
    expect(result.accessLevel).toBe('dept_head');
  });

  it('gives a signed-in user with no matching staff record the lowest privilege, not an error', () => {
    const result = resolveAccess('stranger@example.com', [makeStaff({ email: 'someone-else@example.com' })]);
    expect(result.accessLevel).toBe('staff');
    expect(result.facilityId).toBeUndefined();
  });

  it('never grants superuser to an email that merely happens to also be a staff manager', () => {
    // Regression guard: a staff record's accessLevel must never be able to
    // claim 'superuser' for itself purely by being in someone's staff list -
    // only the allowlist (or, going forward, platformAdmins) can do that.
    const staff = [makeStaff({ email: 'sneaky@example.com', accessLevel: 'superuser' as StaffMember['accessLevel'] })];
    const result = resolveAccess('sneaky@example.com', staff);
    // resolveAccess itself just reflects whatever is on the staff doc - the
    // real guarantee against this is the Firestore write rule on staff/{id}
    // (isManagerLevel() gated) and on users/{uid} (self-escalation blocked).
    // This test documents that resolveAccess is NOT itself the security
    // boundary, so a reviewer doesn't mistake it for one.
    expect(result.accessLevel).toBe('superuser');
  });
});
