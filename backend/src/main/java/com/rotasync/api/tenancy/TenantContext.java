package com.rotasync.api.tenancy;

import java.util.UUID;

/**
 * Per-request tenant identity, resolved once during authentication and
 * consulted by every persistence operation.
 *
 * Holds the authenticated principal too, so services never re-parse the JWT.
 * Cleared unconditionally by {@link TenantContextCleanupFilter} — a leaked
 * value on a pooled thread would be a cross-tenant bug.
 */
public final class TenantContext {

    /** Immutable snapshot of who is calling and in which tenant. */
    public record Principal(
            UUID userId,
            String email,
            UUID tenantId,
            UUID facilityId,     // may be null (org-wide roles)
            UUID departmentId,   // may be null (managers/admins)
            String role,         // ORG_ADMIN | MANAGER | MEMBER
            boolean systemOwner
    ) {
        public boolean managerOrAbove() {
            return "MANAGER".equals(role) || "ORG_ADMIN".equals(role);
        }
    }

    /** Caller principal, or throws if the request is unauthenticated/tenant-less. */
    public static Principal require() {
        Principal p = CURRENT.get();
        if (p == null || p.tenantId() == null) {
            throw new TenantViolationException("No tenant bound to this request");
        }
        return p;
    }

    private static final ThreadLocal<Principal> CURRENT = new ThreadLocal<>();

    private TenantContext() {}

    public static void set(Principal principal) {
        CURRENT.set(principal);
    }

    public static Principal get() {
        return CURRENT.get();
    }

    /** Tenant id or null. Persistence layers must treat null as "deny". */
    public static UUID tenantIdOrNull() {
        Principal p = CURRENT.get();
        return p == null ? null : p.tenantId();
    }

    public static UUID requireTenantId() {
        UUID id = tenantIdOrNull();
        if (id == null) {
            throw new TenantViolationException("No tenant bound to this request");
        }
        return id;
    }

    public static void clear() {
        CURRENT.remove();
    }
}
