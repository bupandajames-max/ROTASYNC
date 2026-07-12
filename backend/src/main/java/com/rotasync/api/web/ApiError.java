package com.rotasync.api.web;

import java.time.Instant;

/**
 * Uniform error envelope for every non-2xx response.
 * `code` is a stable machine-readable identifier the SPA can switch on;
 * `message` is safe to show to users (never internals or SQL).
 */
public record ApiError(
        Instant timestamp,
        int status,
        String code,
        String message,
        String path
) {
    public static ApiError of(int status, String code, String message, String path) {
        return new ApiError(Instant.now(), status, code, message, path);
    }
}
