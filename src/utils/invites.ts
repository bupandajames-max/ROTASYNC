// Deterministic invite doc ID from (facilityId, email) — lets both the
// client and firestore.rules look an invite up with a direct doc read
// instead of a query, and ties the ID to its own content so it can't be
// spoofed to point at a different facility/email than it claims.
export const inviteDocId = (facilityId: string, email: string) => `${facilityId}--${email}`;

// Roles an invite may grant. Deliberately excludes 'superuser' — that tier
// stays platform-admin/bootstrap-email only (see firestore.rules isSuper()).
export const INVITE_ROLES: { value: 'staff' | 'dept_head' | 'facility_manager'; label: string }[] = [
  { value: 'staff', label: 'Staff' },
  { value: 'dept_head', label: 'Department Head' },
  { value: 'facility_manager', label: 'Facility Manager' },
];
