package com.rotasync.api;

import com.rotasync.api.domain.Membership;
import com.rotasync.api.tenancy.TenantContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Role-based access control at the HTTP layer: @PreAuthorize must reject the
 * wrong role with 403 (before any service/tenant logic runs) and missing auth
 * with 401, while the right role passes through.
 *
 * Runs on Testcontainers (Docker) by default, or an external PostgreSQL via
 * TEST_DATABASE_URL — see TestDatabase.
 */
@SpringBootTest
@AutoConfigureMockMvc
class RbacAccessTest {

    @DynamicPropertySource
    static void datasource(DynamicPropertyRegistry registry) {
        TestDatabase.apply(registry);
    }

    @Autowired MockMvc mockMvc;
    @Autowired JdbcTemplate jdbc;

    @AfterEach
    void clearContext() {
        TenantContext.clear();
    }

    @Test
    void anonymousRequestsGet401() throws Exception {
        mockMvc.perform(get("/api/v1/staff").param("facilityId", UUID.randomUUID().toString()))
                .andExpect(status().isUnauthorized());
    }

    // NOTE: bodies below are VALID on purpose — @Valid runs during argument
    // resolution, i.e. BEFORE @PreAuthorize, so an invalid body would 400
    // and the test would never observe the role rejection.

    @Test
    void memberCannotCreateStaff() throws Exception {
        mockMvc.perform(post("/api/v1/staff")
                        .with(jwt().authorities(new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_MEMBER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"facilityId":"%s","name":"X","fullName":"X Y",
                                 "employeeNo":"E1","isManager":false}
                                """.formatted(UUID.randomUUID())))
                .andExpect(status().isForbidden());
    }

    @Test
    void memberCannotCreateTasksOrCycles() throws Exception {
        var member = jwt().authorities(new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_MEMBER"));
        mockMvc.perform(post("/api/v1/tasks").with(member)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"facilityId":"%s","taskName":"Sweep","taskDate":"2026-09-01"}
                                """.formatted(UUID.randomUUID())))
                .andExpect(status().isForbidden());
        mockMvc.perform(post("/api/v1/cycles").with(member)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"facilityId":"%s","startDate":"2026-09-01","endDate":"2026-09-28","generate":true}
                                """.formatted(UUID.randomUUID())))
                .andExpect(status().isForbidden());
    }

    @Test
    void managerCannotFactoryResetOrUseSystemConsole() throws Exception {
        var manager = jwt().authorities(new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_MANAGER"));
        mockMvc.perform(post("/api/v1/admin/factory-reset").with(manager)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"confirm\":\"x\"}"))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/v1/sys/organizations").with(manager))
                .andExpect(status().isForbidden());
    }

    @Test
    void orgAdminIsNotAutomaticallyASystemOwner() throws Exception {
        mockMvc.perform(get("/api/v1/sys/organizations")
                        .with(jwt().authorities(new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_ORG_ADMIN"))))
                .andExpect(status().isForbidden());
    }

    @Test
    void managerWithTenantContextCanCreateAndListStaff() throws Exception {
        UUID tenant = UUID.randomUUID();
        UUID facility = UUID.randomUUID();
        jdbc.update("INSERT INTO organizations (id, name) VALUES (?, 'RBAC Org')", tenant);
        jdbc.update("INSERT INTO facilities (id, tenant_id, name) VALUES (?, ?, 'Main')", facility, tenant);

        var manager = jwt().authorities(new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_MANAGER"));
        // The jwt() post-processor bypasses TenantAwareJwtConverter, so bind
        // the tenant directly (MockMvc runs on this thread; the cleanup
        // filter clears it after each request).
        TenantContext.set(new TenantContext.Principal(UUID.randomUUID(), "mgr@rbac.com",
                tenant, facility, null, Membership.ROLE_MANAGER, false));
        mockMvc.perform(post("/api/v1/staff").with(manager)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"facilityId":"%s","name":"Jane","fullName":"Jane Doe",
                                 "employeeNo":"EMP-9","contractedHours":168,"isManager":false}
                                """.formatted(facility)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value("Jane"));

        TenantContext.set(new TenantContext.Principal(UUID.randomUUID(), "mgr@rbac.com",
                tenant, facility, null, Membership.ROLE_MANAGER, false));
        mockMvc.perform(get("/api/v1/staff").with(manager).param("facilityId", facility.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].employeeNo").value("EMP-9"));
    }

    @Test
    void validationRejectsMalformedBodiesWith400() throws Exception {
        UUID tenant = UUID.randomUUID();
        jdbc.update("INSERT INTO organizations (id, name) VALUES (?, 'Val Org')", tenant);
        var manager = jwt().authorities(new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_MANAGER"));
        TenantContext.set(new TenantContext.Principal(UUID.randomUUID(), "mgr@val.com",
                tenant, null, null, Membership.ROLE_MANAGER, false));
        mockMvc.perform(post("/api/v1/staff").with(manager)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"\"}")) // missing required fields
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
    }
}
