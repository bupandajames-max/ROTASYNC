import { StaffMember, Facility, AccessLevel } from '../types';

// --- SUPER USER ALLOWLIST -----------------------------------------------------
// Org owners. Anyone signing in with an email in this list is resolved as a
// super user, regardless of (or in the absence of) a staff record.
// Edit this list to add/remove super users.
export const SUPERUSER_EMAILS: string[] = [
  'bupandajames@gmail.com',
];

export interface ResolvedAccess {
  accessLevel: AccessLevel;
  facilityId?: string;
  departmentId?: string;
  organizationId?: string;
  staffId?: string;
  email: string;
}

const norm = (e?: string | null): string => (e || '').trim().toLowerCase();

export const isSuperuserEmail = (email?: string | null): boolean =>
  norm(email).length > 0 && SUPERUSER_EMAILS.map(norm).includes(norm(email));

/**
 * Resolve the access tier + scope for a signed-in user from their email.
 * Order: super-user allowlist → matching staff record → signed-in-but-unrecognized.
 * The staff record's `accessLevel` is the durable source of truth; if absent we
 * fall back to the legacy `isManager` flag so existing data keeps working.
 * `facilities` supplies organizationId, since StaffMember doesn't carry one
 * directly (facility ownership is the single source of truth for that link).
 */
export function resolveAccess(email: string | null | undefined, staffList: StaffMember[], facilities: Facility[] = []): ResolvedAccess {
  const e = norm(email);

  if (isSuperuserEmail(e)) {
    return { accessLevel: 'superuser', email: e };
  }

  const match = e ? staffList.find(s => norm(s.email) === e) : undefined;
  if (match) {
    return {
      accessLevel: match.accessLevel || (match.isManager ? 'facility_manager' : 'staff'),
      facilityId: match.facilityId,
      departmentId: match.departmentId,
      organizationId: facilities.find(f => f.id === match.facilityId)?.organizationId,
      staffId: match.id,
      email: e,
    };
  }

  // Signed in but not yet linked to a staff record — lowest privilege.
  return { accessLevel: 'staff', email: e };
}

// Convenience predicates for UI gating (Phase B) and admin checks.
export const canManageFacilities = (lvl: AccessLevel): boolean => lvl === 'superuser';
export const canManageFacilitySettings = (lvl: AccessLevel): boolean => lvl === 'superuser' || lvl === 'facility_manager';
export const canManageTasksAndApprovals = (lvl: AccessLevel): boolean => lvl !== 'staff';
