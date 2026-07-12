package com.rotasync.api.tenancy;

/**
 * Thrown when an operation would read or write data outside the caller's
 * tenant, or when tenant-scoped work is attempted with no tenant bound.
 * Mapped to HTTP 403 by the global exception handler.
 */
public class TenantViolationException extends RuntimeException {
    public TenantViolationException(String message) {
        super(message);
    }
}
