// Deterministic invite doc ID from (facilityId, email) — lets both the
// client and firestore.rules look an invite up with a direct doc read
// instead of a query, and ties the ID to its own content so it can't be
// spoofed to point at a different facility/email than it claims.
export const inviteDocId = (facilityId: string, email: string) => `${facilityId}--${email}`;

// Roles an invite may grant come from ASSIGNABLE_ROLE_OPTIONS in
// config/access (the single source of truth) — deliberately excludes
// 'superuser'/Org Admin, which stays platform-admin/bootstrap-email only
// (see firestore.rules isSuper()).
