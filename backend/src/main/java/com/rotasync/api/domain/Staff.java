package com.rotasync.api.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Sample tenant-scoped entity — the reference implementation every other
 * tenant entity follows. Inherits id/tenant_id/timestamps/soft-delete and
 * all three isolation layers from TenantOwnedEntity.
 */
@Entity
@Table(name = "staff")
public class Staff extends TenantOwnedEntity {

    @Column(name = "facility_id", nullable = false)
    private UUID facilityId;

    @Column(name = "department_id")
    private UUID departmentId;

    @Column(name = "user_id")
    private UUID userId;

    @Column(nullable = false)
    private String name;

    @Column(name = "full_name", nullable = false)
    private String fullName;

    private String email;

    private String phone;

    @Column(name = "role_title", nullable = false)
    private String roleTitle = "";

    @Column(name = "employee_no", nullable = false)
    private String employeeNo;

    @Column(name = "contracted_hours", nullable = false)
    private int contractedHours = 168;

    @Column(nullable = false)
    private String gender = "";

    // Hibernate 6 native array mapping — hypersistence's ListArrayType reports
    // Types#OTHER, which fails ddl-auto=validate against a real text[] column
    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(columnDefinition = "text[]", nullable = false)
    private List<String> skills = new ArrayList<>();

    @Column(name = "is_manager", nullable = false)
    private boolean manager;

    public UUID getFacilityId() { return facilityId; }
    public void setFacilityId(UUID facilityId) { this.facilityId = facilityId; }

    public UUID getDepartmentId() { return departmentId; }
    public void setDepartmentId(UUID departmentId) { this.departmentId = departmentId; }

    public UUID getUserId() { return userId; }
    public void setUserId(UUID userId) { this.userId = userId; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getFullName() { return fullName; }
    public void setFullName(String fullName) { this.fullName = fullName; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }

    public String getRoleTitle() { return roleTitle; }
    public void setRoleTitle(String roleTitle) { this.roleTitle = roleTitle; }

    public String getEmployeeNo() { return employeeNo; }
    public void setEmployeeNo(String employeeNo) { this.employeeNo = employeeNo; }

    public int getContractedHours() { return contractedHours; }
    public void setContractedHours(int contractedHours) { this.contractedHours = contractedHours; }

    public String getGender() { return gender; }
    public void setGender(String gender) { this.gender = gender; }

    public List<String> getSkills() { return skills; }
    public void setSkills(List<String> skills) { this.skills = skills; }

    public boolean isManager() { return manager; }
    public void setManager(boolean manager) { this.manager = manager; }
}
