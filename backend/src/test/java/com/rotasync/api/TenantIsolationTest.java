package com.rotasync.api;

import com.rotasync.api.domain.Membership;
import com.rotasync.api.domain.Staff;
import com.rotasync.api.service.StaffService;
import com.rotasync.api.tenancy.TenantContext;
import com.rotasync.api.web.dto.StaffDtos.UpsertStaffRequest;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Proves tenant isolation end-to-end against a real PostgreSQL:
 *
 *  Layer 1 (Hibernate filter): service/repository queries under tenant A
 *  never see tenant B's rows, including findById on a known B id.
 *
 *  Layer 3 (PostgreSQL RLS): a NON-superuser connection — like the app's
 *  production role — gets zero rows without app.tenant_id, only its own
 *  tenant's rows with it, and cannot insert rows stamped for another tenant.
 *  (The JPA layers are tested through the app; RLS is tested via raw JDBC
 *  precisely because raw SQL is what the Java layers can't protect.)
 *
 * Requires Docker (Testcontainers). Run: mvn test -Dtest=TenantIsolationTest
 */
@SpringBootTest
@Testcontainers
class TenantIsolationTest {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @DynamicPropertySource
    static void datasource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
        // JWT decoding isn't exercised here; dev mode keeps the context bootable
        registry.add("app.security.mode", () -> "dev");
    }

    @Autowired StaffService staffService;
    @Autowired JdbcTemplate jdbc;

    static final UUID TENANT_A = UUID.randomUUID();
    static final UUID TENANT_B = UUID.randomUUID();
    static final UUID FACILITY_A = UUID.randomUUID();
    static final UUID FACILITY_B = UUID.randomUUID();
    static boolean seeded;

    // seeding happens lazily (not in a static @BeforeAll) because the
    // @Autowired JdbcTemplate isn't available in static context
    void seedOnce() {
        if (seeded) return;
        // The test datasource user is the container superuser, so RLS does not
        // block this seed data (superusers always bypass RLS). The app's
        // production role is NOT a superuser — that path is tested below.
        jdbc.update("INSERT INTO organizations (id, name) VALUES (?, 'Org A'), (?, 'Org B')",
                TENANT_A, TENANT_B);
        jdbc.update("""
                INSERT INTO facilities (id, tenant_id, name) VALUES (?, ?, 'Facility A'), (?, ?, 'Facility B')
                """, FACILITY_A, TENANT_A, FACILITY_B, TENANT_B);
        seeded = true;
    }

    @AfterEach
    void clearContext() {
        TenantContext.clear();
    }

    private void actAs(UUID tenantId, String role) {
        TenantContext.set(new TenantContext.Principal(
                UUID.randomUUID(), "test@example.com", tenantId, null, null, role, false));
    }

    private UpsertStaffRequest staffReq(UUID facilityId, String name, String empNo) {
        return new UpsertStaffRequest(facilityId, null, name, name + " Full",
                null, null, "Nurse", empNo, 168, "", List.of(), false);
    }

    // ------------------------------------------------------------------
    // Layer 1: Hibernate filter isolation through the service stack
    // ------------------------------------------------------------------

    @Test
    void jpaLayer_tenantsOnlySeeTheirOwnRows() {
        seedOnce();

        actAs(TENANT_A, Membership.ROLE_MANAGER);
        Staff aliceA = staffService.create(staffReq(FACILITY_A, "Alice", "EMP-A1"));

        actAs(TENANT_B, Membership.ROLE_MANAGER);
        Staff bobB = staffService.create(staffReq(FACILITY_B, "Bob", "EMP-B1"));

        // A sees only A's staff
        actAs(TENANT_A, Membership.ROLE_MANAGER);
        List<Staff> aView = staffService.listForCaller(FACILITY_A);
        assertThat(aView).extracting(Staff::getName).containsExactly("Alice");
        assertThat(staffService.listForCaller(FACILITY_B)).isEmpty(); // B's facility: nothing

        // A cannot fetch B's row even with its exact id — 404, not leak
        assertThatThrownBy(() -> staffService.get(bobB.getId()))
                .isInstanceOf(jakarta.persistence.EntityNotFoundException.class);

        // B symmetric
        actAs(TENANT_B, Membership.ROLE_MANAGER);
        assertThat(staffService.listForCaller(FACILITY_B))
                .extracting(Staff::getName).containsExactly("Bob");
        assertThatThrownBy(() -> staffService.get(aliceA.getId()))
                .isInstanceOf(jakarta.persistence.EntityNotFoundException.class);

        // A cannot update/delete B's row: the scoped lookup already 404s
        actAs(TENANT_A, Membership.ROLE_MANAGER);
        assertThatThrownBy(() -> staffService.delete(bobB.getId()))
                .isInstanceOf(jakarta.persistence.EntityNotFoundException.class);
    }

    @Test
    void jpaLayer_insertIsStampedWithCallerTenant_neverCallerSupplied() {
        seedOnce();
        actAs(TENANT_A, Membership.ROLE_MANAGER);
        Staff created = staffService.create(staffReq(FACILITY_A, "Carol", "EMP-A2"));
        assertThat(created.getTenantId()).isEqualTo(TENANT_A);

        // No tenant bound -> tenant-scoped writes are impossible (fail-closed)
        TenantContext.clear();
        assertThatThrownBy(() -> staffService.create(staffReq(FACILITY_A, "Mallory", "EMP-X")))
                .hasMessageContaining("No tenant bound");
    }

    // ------------------------------------------------------------------
    // Layer 3: PostgreSQL RLS with a non-superuser role (the prod situation)
    // ------------------------------------------------------------------

    @Test
    void rlsLayer_nonSuperuserConnectionIsHardIsolatedByPostgres() throws SQLException {
        seedOnce();
        actAs(TENANT_A, Membership.ROLE_MANAGER);
        staffService.create(staffReq(FACILITY_A, "Dana", "EMP-A3"));
        actAs(TENANT_B, Membership.ROLE_MANAGER);
        staffService.create(staffReq(FACILITY_B, "Erin", "EMP-B2"));

        jdbc.execute("""
                DO $$ BEGIN
                  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_rt') THEN
                    CREATE ROLE app_rt LOGIN PASSWORD 'app_rt';
                  END IF;
                END $$;
                GRANT USAGE ON SCHEMA public TO app_rt;
                GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_rt;
                """);

        try (Connection conn = DriverManager.getConnection(
                postgres.getJdbcUrl(), "app_rt", "app_rt")) {
            conn.setAutoCommit(false);

            // 1) No app.tenant_id set -> RLS yields ZERO rows (fail-closed)
            assertThat(countStaff(conn)).isZero();

            // 2) Bound to tenant A -> exactly A's rows
            setTenant(conn, TENANT_A);
            assertThat(countStaff(conn)).isEqualTo(countStaffAsSuperuser(TENANT_A));
            assertThat(staffTenants(conn)).containsOnly(TENANT_A);
            conn.rollback(); // set_config was transaction-local; prove it resets

            // 3) After rollback the binding is gone again
            assertThat(countStaff(conn)).isZero();

            // 4) Bound to A, attempting to INSERT a row stamped for B ->
            //    Postgres itself rejects it (WITH CHECK), regardless of app bugs
            setTenant(conn, TENANT_A);
            assertThatThrownBy(() -> {
                try (PreparedStatement ps = conn.prepareStatement("""
                        INSERT INTO staff (tenant_id, facility_id, name, full_name, employee_no)
                        VALUES (?, ?, 'Evil', 'Evil Full', 'EMP-EVIL')
                        """)) {
                    ps.setObject(1, TENANT_B);
                    ps.setObject(2, FACILITY_B);
                    ps.executeUpdate();
                }
            }).isInstanceOf(SQLException.class)
              .hasMessageContaining("row-level security");
            conn.rollback();
        }
    }

    private void setTenant(Connection conn, UUID tenant) throws SQLException {
        try (PreparedStatement ps = conn.prepareStatement(
                "SELECT set_config('app.tenant_id', ?, true)")) {
            ps.setString(1, tenant.toString());
            ps.execute();
        }
    }

    private int countStaff(Connection conn) throws SQLException {
        try (Statement st = conn.createStatement();
             ResultSet rs = st.executeQuery("SELECT count(*) FROM staff")) {
            rs.next();
            return rs.getInt(1);
        }
    }

    private List<UUID> staffTenants(Connection conn) throws SQLException {
        try (Statement st = conn.createStatement();
             ResultSet rs = st.executeQuery("SELECT DISTINCT tenant_id FROM staff")) {
            var out = new java.util.ArrayList<UUID>();
            while (rs.next()) out.add(rs.getObject(1, UUID.class));
            return out;
        }
    }

    private int countStaffAsSuperuser(UUID tenant) {
        Integer n = jdbc.queryForObject(
                "SELECT count(*) FROM staff WHERE tenant_id = ?", Integer.class, tenant);
        return n == null ? 0 : n;
    }
}
