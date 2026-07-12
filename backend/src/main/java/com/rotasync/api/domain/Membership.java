package com.rotasync.api.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.util.UUID;

/**
 * Binds a global user to one tenant with one role. This row is what turns an
 * authenticated JWT into a tenant context: no membership, no tenant access.
 */
@Entity
@Table(name = "memberships")
public class Membership extends TenantOwnedEntity {

    public static final String ROLE_ORG_ADMIN = "ORG_ADMIN";
    public static final String ROLE_MANAGER = "MANAGER";
    public static final String ROLE_MEMBER = "MEMBER";

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "facility_id")
    private UUID facilityId;

    @Column(name = "department_id")
    private UUID departmentId;

    @Column(nullable = false)
    private String role;

    @Column(nullable = false)
    private String status = "ACTIVE";

    public UUID getUserId() { return userId; }
    public void setUserId(UUID userId) { this.userId = userId; }

    public UUID getFacilityId() { return facilityId; }
    public void setFacilityId(UUID facilityId) { this.facilityId = facilityId; }

    public UUID getDepartmentId() { return departmentId; }
    public void setDepartmentId(UUID departmentId) { this.departmentId = departmentId; }

    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
}
