package com.rotasync.api;

import org.springframework.test.context.DynamicPropertyRegistry;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * Database provider for the integration suites.
 *
 * Default: a throwaway Testcontainers PostgreSQL (needs Docker).
 * Fallback: set TEST_DATABASE_URL (+ TEST_DATABASE_USER / TEST_DATABASE_PASSWORD,
 * defaulting to postgres/"") to run against an existing PostgreSQL — useful on
 * machines/CI runners without Docker. The user must be a superuser or table
 * owner so seeding works; test data uses random tenant ids per run, so a
 * shared database is safe to reuse.
 */
final class TestDatabase {

    private static final String EXTERNAL_URL = System.getenv("TEST_DATABASE_URL");
    private static PostgreSQLContainer<?> container;

    private TestDatabase() {}

    static synchronized void apply(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", TestDatabase::jdbcUrl);
        registry.add("spring.datasource.username", TestDatabase::username);
        registry.add("spring.datasource.password", TestDatabase::password);
        registry.add("app.security.mode", () -> "dev");
    }

    static synchronized String jdbcUrl() {
        if (EXTERNAL_URL != null) {
            return EXTERNAL_URL;
        }
        if (container == null) {
            container = new PostgreSQLContainer<>("postgres:16-alpine");
            container.start();
        }
        return container.getJdbcUrl();
    }

    static String username() {
        if (EXTERNAL_URL != null) {
            String u = System.getenv("TEST_DATABASE_USER");
            return u == null ? "postgres" : u;
        }
        jdbcUrl(); // ensure container started
        return container.getUsername();
    }

    static String password() {
        if (EXTERNAL_URL != null) {
            String p = System.getenv("TEST_DATABASE_PASSWORD");
            return p == null ? "" : p;
        }
        jdbcUrl();
        return container.getPassword();
    }
}
