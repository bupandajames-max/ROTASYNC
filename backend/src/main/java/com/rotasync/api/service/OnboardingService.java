package com.rotasync.api.service;

import com.rotasync.api.domain.AppUser;
import com.rotasync.api.domain.Department;
import com.rotasync.api.domain.Facility;
import com.rotasync.api.domain.Membership;
import com.rotasync.api.domain.Organization;
import com.rotasync.api.domain.Staff;
import com.rotasync.api.domain.TenantSettings;
import com.rotasync.api.repository.DepartmentRepository;
import com.rotasync.api.repository.FacilityRepository;
import com.rotasync.api.repository.MembershipRepository;
import com.rotasync.api.repository.OrganizationRepository;
import com.rotasync.api.repository.StaffRepository;
import com.rotasync.api.repository.TenantSettingsRepository;
import com.rotasync.api.tenancy.TenantBinder;
import com.rotasync.api.tenancy.TenantContext;
import com.rotasync.api.web.dto.OnboardingDtos.CreateOrganizationRequest;
import com.rotasync.api.web.dto.OnboardingDtos.CreateOrganizationResponse;
import com.rotasync.api.web.dto.OnboardingDtos.NewTeamMember;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Creates an organization + first facility + departments + founding team in
 * ONE transaction. This is one of the three sanctioned RLS-bypass call sites:
 * the organization row must exist before any tenant can be bound.
 */
@Service
@Transactional
public class OnboardingService {

    private final MeService meService;
    private final MembershipRepository memberships;
    private final OrganizationRepository organizations;
    private final FacilityRepository facilities;
    private final DepartmentRepository departments;
    private final StaffRepository staffRepository;
    private final TenantSettingsRepository settings;
    private final TenantBinder binder;

    public OnboardingService(MeService meService, MembershipRepository memberships,
                             OrganizationRepository organizations, FacilityRepository facilities,
                             DepartmentRepository departments, StaffRepository staffRepository,
                             TenantSettingsRepository settings, TenantBinder binder) {
        this.meService = meService;
        this.memberships = memberships;
        this.organizations = organizations;
        this.facilities = facilities;
        this.departments = departments;
        this.staffRepository = staffRepository;
        this.settings = settings;
        this.binder = binder;
    }

    public CreateOrganizationResponse createOrganization(Jwt jwt, CreateOrganizationRequest req) {
        AppUser founder = meService.ensureUser(jwt);

        binder.bypassRlsForCurrentTransaction();
        if (!memberships.findActiveByUserId(founder.getId()).isEmpty()) {
            throw new IllegalStateException("You already belong to an organization");
        }

        Organization org = new Organization();
        org.setName(req.organizationName().trim());
        org = organizations.save(org);
        organizations.flush(); // id needed for tenant binding + FKs

        // From here on, everything is a normal tenant-scoped write.
        TenantContext.set(new TenantContext.Principal(
                founder.getId(), founder.getEmail(), org.getId(),
                null, null, Membership.ROLE_ORG_ADMIN, founder.isSystemOwner()));
        binder.bindTenantForCurrentTransaction(org.getId());

        Facility facility = new Facility();
        facility.setName(req.facility().name().trim());
        facility.setLocation(req.facility().location() == null ? "" : req.facility().location());
        facility.setFacilityType(req.facility().facilityType() == null ? "Branch" : req.facility().facilityType());
        facility = facilities.save(facility);

        List<UUID> departmentIds = new ArrayList<>();
        Map<String, UUID> departmentsByName = new HashMap<>();
        if (req.departments() != null) {
            for (var d : req.departments()) {
                Department dept = new Department();
                dept.setFacilityId(facility.getId());
                dept.setName(d.name().trim());
                dept.setDescription(d.description());
                dept = departments.save(dept);
                departmentIds.add(dept.getId());
                departmentsByName.put(dept.getName().toLowerCase(), dept.getId());
            }
        }

        Membership membership = new Membership();
        membership.setUserId(founder.getId());
        membership.setFacilityId(facility.getId());
        membership.setRole(Membership.ROLE_ORG_ADMIN);
        memberships.save(membership);

        int staffCreated = 0;
        if (req.team() != null) {
            int seq = 1;
            for (NewTeamMember m : req.team()) {
                Staff s = new Staff();
                s.setFacilityId(facility.getId());
                s.setName(m.name().trim());
                s.setFullName(m.fullName().trim());
                s.setEmail(m.email() == null ? null : m.email().toLowerCase().trim());
                s.setEmployeeNo(m.employeeNo() == null || m.employeeNo().isBlank()
                        ? "EMP-" + (1000 + seq) : m.employeeNo().trim());
                s.setManager(m.isManager());
                if (m.departmentName() != null) {
                    s.setDepartmentId(departmentsByName.get(m.departmentName().toLowerCase().trim()));
                }
                if (founder.getEmail().equalsIgnoreCase(m.email())) {
                    s.setUserId(founder.getId());
                }
                staffRepository.save(s);
                staffCreated++;
                seq++;
            }
        }

        TenantSettings ts = new TenantSettings();
        ts.setFacilityId(facility.getId());
        if (req.taxonomy() != null) {
            ts.setTaxonomy(req.taxonomy());
        }
        settings.save(ts);

        return new CreateOrganizationResponse(org.getId(), facility.getId(), departmentIds, staffCreated);
    }
}
