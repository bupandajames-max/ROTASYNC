package com.rotasync.api;

import com.rotasync.api.domain.Approval;
import com.rotasync.api.domain.Membership;
import com.rotasync.api.domain.Staff;
import com.rotasync.api.domain.Timesheet;
import com.rotasync.api.service.AdminService;
import com.rotasync.api.service.ApprovalService;
import com.rotasync.api.service.RosterService;
import com.rotasync.api.service.StaffService;
import com.rotasync.api.service.TimesheetService;
import com.rotasync.api.tenancy.TenantContext;
import com.rotasync.api.web.dto.AdminDtos.FactoryResetRequest;
import com.rotasync.api.web.dto.AdminDtos.FactoryResetResponse;
import com.rotasync.api.web.dto.ApprovalDtos.CreateApprovalRequest;
import com.rotasync.api.web.dto.RosterDtos.CreateCycleRequest;
import com.rotasync.api.web.dto.RosterDtos.CreateSnapshotRequest;
import com.rotasync.api.web.dto.RosterDtos.CycleResponse;
import com.rotasync.api.web.dto.StaffDtos.UpsertStaffRequest;
import jakarta.persistence.EntityNotFoundException;
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

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * End-to-end business flows against real PostgreSQL: roster generation with
 * persisted assignments + auto-draft timesheets, department scoping for
 * members, snapshot lifecycle, shift-swap approval, timesheet lifecycle,
 * factory reset preservation rules, and tenant isolation on the new entities.
 *
 * Requires Docker. Run: mvn test -Dtest=BackendFlowIntegrationTest
 */
@SpringBootTest
@Testcontainers
class BackendFlowIntegrationTest {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @DynamicPropertySource
    static void datasource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
        registry.add("app.security.mode", () -> "dev");
    }

    @Autowired JdbcTemplate jdbc;
    @Autowired StaffService staffService;
    @Autowired RosterService rosterService;
    @Autowired TimesheetService timesheetService;
    @Autowired ApprovalService approvalService;
    @Autowired AdminService adminService;

    private record Seed(UUID tenantId, UUID facilityId, UUID departmentId, String orgName) {}

    /** Each test gets its own org so tests stay order-independent. */
    private Seed seedTenant(String orgName) {
        UUID tenant = UUID.randomUUID();
        UUID facility = UUID.randomUUID();
        UUID department = UUID.randomUUID();
        jdbc.update("INSERT INTO organizations (id, name) VALUES (?, ?)", tenant, orgName);
        jdbc.update("INSERT INTO facilities (id, tenant_id, name) VALUES (?, ?, 'Main')",
                facility, tenant);
        jdbc.update("INSERT INTO departments (id, tenant_id, facility_id, name) VALUES (?, ?, ?, 'Pharmacy')",
                department, tenant, facility);
        return new Seed(tenant, facility, department, orgName);
    }

    @AfterEach
    void clearContext() {
        TenantContext.clear();
    }

    private void actAsManager(Seed seed) {
        TenantContext.set(new TenantContext.Principal(UUID.randomUUID(), "manager@test.com",
                seed.tenantId(), seed.facilityId(), null, Membership.ROLE_MANAGER, false));
    }

    private void actAsOrgAdmin(Seed seed) {
        TenantContext.set(new TenantContext.Principal(UUID.randomUUID(), "admin@test.com",
                seed.tenantId(), seed.facilityId(), null, Membership.ROLE_ORG_ADMIN, false));
    }

    private void actAsMember(Seed seed, String email, UUID departmentId) {
        TenantContext.set(new TenantContext.Principal(UUID.randomUUID(), email,
                seed.tenantId(), seed.facilityId(), departmentId, Membership.ROLE_MEMBER, false));
    }

    private Staff addStaff(Seed seed, String name, String empNo, UUID departmentId, String email) {
        return staffService.create(new UpsertStaffRequest(seed.facilityId(), departmentId,
                name, name + " Full", email, null, "Nurse", empNo, 168, "", List.of(), false));
    }

    // ── Roster generation ────────────────────────────────────────────────

    @Test
    void generatedCycle_coversEveryStaffAndEveryDay_andAutoCreatesDraftTimesheets() {
        Seed seed = seedTenant("Org Gen");
        actAsManager(seed);
        addStaff(seed, "Alice", "E1", seed.departmentId(), "alice@test.com");
        addStaff(seed, "Ben", "E2", null, "ben@test.com");
        addStaff(seed, "Cara", "E3", null, "cara@test.com");

        LocalDate start = LocalDate.of(2026, 9, 1);
        LocalDate end = LocalDate.of(2026, 9, 28);
        CycleResponse cycle = rosterService.create(new CreateCycleRequest(
                seed.facilityId(), start, end, true, null));

        assertThat(cycle.shifts()).hasSize(3);                       // every staff member
        cycle.shifts().values().forEach(row -> assertThat(row).hasSize(28)); // every day
        assertThat(cycle.assignments()).hasSize(3 * 28);

        List<Timesheet> drafts = timesheetService.list(cycle.id());
        assertThat(drafts).hasSize(3);
        assertThat(drafts).allMatch(t -> Timesheet.STATUS_DRAFT.equals(t.getStatus()));
    }

    @Test
    void memberSeesOnlyTheirOwnDepartmentsAssignments() {
        Seed seed = seedTenant("Org Dept");
        actAsManager(seed);
        Staff pharmacist = addStaff(seed, "Pharm", "E1", seed.departmentId(), "pharm@test.com");
        addStaff(seed, "Other", "E2", null, "other@test.com");
        CycleResponse cycle = rosterService.create(new CreateCycleRequest(
                seed.facilityId(), LocalDate.of(2026, 9, 1), LocalDate.of(2026, 9, 7), true, null));
        assertThat(cycle.shifts()).hasSize(2); // manager view: everyone

        actAsMember(seed, "pharm@test.com", seed.departmentId());
        CycleResponse memberView = rosterService.get(cycle.id());
        assertThat(memberView.shifts().keySet()).containsExactly(pharmacist.getId());
    }

    // ── Snapshots ────────────────────────────────────────────────────────

    @Test
    void snapshotLifecycle_createListGetDelete() {
        Seed seed = seedTenant("Org Snap");
        actAsManager(seed);
        addStaff(seed, "Alice", "E1", null, "a@test.com");
        CycleResponse cycle = rosterService.create(new CreateCycleRequest(
                seed.facilityId(), LocalDate.of(2026, 9, 1), LocalDate.of(2026, 9, 7), true, null));

        var snap = rosterService.createSnapshot(cycle.id(), new CreateSnapshotRequest("before edits"));
        assertThat(rosterService.listSnapshots(cycle.id())).hasSize(1);

        var loaded = rosterService.getSnapshot(snap.getId());
        assertThat(loaded.getSnapshot()).containsKeys("shifts", "startDate", "endDate");

        rosterService.deleteSnapshot(snap.getId());
        assertThat(rosterService.listSnapshots(cycle.id())).isEmpty();
    }

    // ── Approvals: shift swap applies atomically ─────────────────────────

    @Test
    void approvedShiftSwap_actuallySwapsTheTwoAssignments() {
        Seed seed = seedTenant("Org Swap");
        actAsManager(seed);
        Staff a = addStaff(seed, "Ann", "E1", null, "ann@test.com");
        Staff b = addStaff(seed, "Bob", "E2", null, "bob@test.com");
        LocalDate day = LocalDate.of(2026, 9, 3);
        CycleResponse cycle = rosterService.create(new CreateCycleRequest(
                seed.facilityId(), LocalDate.of(2026, 9, 1), LocalDate.of(2026, 9, 7), true, null));
        String beforeA = shiftOn(cycle, a.getId(), 2);
        String beforeB = shiftOn(cycle, b.getId(), 2);

        actAsMember(seed, "ann@test.com", null);
        Approval request = approvalService.create(new CreateApprovalRequest(
                Approval.TYPE_SHIFT_SWAP, new java.util.HashMap<>(Map.of(
                        "cycleId", cycle.id().toString(), "dayDate", day.toString(),
                        "staffAId", a.getId().toString(), "staffBId", b.getId().toString()))));
        assertThat(request.getStaffId()).isEqualTo(a.getId()); // stamped, not client-supplied

        actAsManager(seed);
        approvalService.approve(request.getId(), "ok");

        CycleResponse after = rosterService.get(cycle.id());
        assertThat(shiftOn(after, a.getId(), 2)).isEqualTo(beforeB);
        assertThat(shiftOn(after, b.getId(), 2)).isEqualTo(beforeA);
    }

    private String shiftOn(CycleResponse cycle, UUID staffId, int dayIdx) {
        return cycle.shifts().get(staffId).get(dayIdx);
    }

    // ── Timesheet lifecycle + self-scoping ───────────────────────────────

    @Test
    void timesheetLifecycle_memberEditsAndSubmitsOwn_managerDecides() {
        Seed seed = seedTenant("Org TS");
        actAsManager(seed);
        Staff alice = addStaff(seed, "Alice", "E1", null, "alice@test.com");
        addStaff(seed, "Ben", "E2", null, "ben@test.com");
        CycleResponse cycle = rosterService.create(new CreateCycleRequest(
                seed.facilityId(), LocalDate.of(2026, 9, 1), LocalDate.of(2026, 9, 7), true, null));

        // Member sees exactly one (their own) of the two drafts
        actAsMember(seed, "alice@test.com", null);
        List<Timesheet> mine = timesheetService.list(cycle.id());
        assertThat(mine).hasSize(1);
        Timesheet ts = mine.get(0);
        assertThat(ts.getStaffId()).isEqualTo(alice.getId());

        timesheetService.updateDays(ts.getId(), Map.of("2026-09-01", Map.of("worked", 8)));
        timesheetService.submit(ts.getId());
        assertThatThrownBy(() -> timesheetService.submit(ts.getId()))
                .isInstanceOf(IllegalStateException.class); // no double submit

        actAsManager(seed);
        assertThat(timesheetService.approve(ts.getId()).getStatus())
                .isEqualTo(Timesheet.STATUS_APPROVED);
    }

    // ── Factory reset ────────────────────────────────────────────────────

    @Test
    void factoryReset_clearsOperationalData_preservesStaffAndSettings() {
        Seed seed = seedTenant("Org Reset");
        actAsOrgAdmin(seed);
        addStaff(seed, "Alice", "E1", null, "a@test.com");
        CycleResponse cycle = rosterService.create(new CreateCycleRequest(
                seed.facilityId(), LocalDate.of(2026, 9, 1), LocalDate.of(2026, 9, 7), true, null));
        rosterService.createSnapshot(cycle.id(), new CreateSnapshotRequest("pre-reset"));

        // wrong confirmation text is rejected before anything is touched
        assertThatThrownBy(() -> adminService.factoryReset(
                new FactoryResetRequest("Wrong Name", seed.facilityId())))
                .isInstanceOf(IllegalArgumentException.class);

        FactoryResetResponse result = adminService.factoryReset(
                new FactoryResetRequest(seed.orgName(), seed.facilityId()));
        assertThat(result.cyclesDeleted()).isEqualTo(1);
        assertThat(result.timesheetsDeleted()).isEqualTo(1);
        assertThat(result.snapshotsDeleted()).isEqualTo(1);

        assertThat(rosterService.list(seed.facilityId())).isEmpty();
        assertThat(staffService.listForCaller(seed.facilityId()))
                .as("staff definitions must survive a factory reset")
                .hasSize(1);
    }

    // ── Tenant isolation on the new entities ─────────────────────────────

    @Test
    void tenantIsolation_cyclesTimesheetsApprovalsInvisibleAcrossTenants() {
        Seed a = seedTenant("Org Iso A");
        Seed b = seedTenant("Org Iso B");

        actAsManager(a);
        addStaff(a, "Alice", "E1", null, "alice@iso.com");
        CycleResponse cycleA = rosterService.create(new CreateCycleRequest(
                a.facilityId(), LocalDate.of(2026, 9, 1), LocalDate.of(2026, 9, 7), true, null));

        actAsManager(b);
        assertThat(rosterService.list(a.facilityId())).isEmpty();       // list probe
        assertThatThrownBy(() -> rosterService.get(cycleA.id()))        // id probe
                .isInstanceOf(EntityNotFoundException.class);
        assertThat(timesheetService.list(cycleA.id())).isEmpty();
        assertThatThrownBy(() -> rosterService.createSnapshot(cycleA.id(),
                new CreateSnapshotRequest("steal")))
                .isInstanceOf(EntityNotFoundException.class);
    }
}
