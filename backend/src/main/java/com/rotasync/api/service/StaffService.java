package com.rotasync.api.service;

import com.rotasync.api.domain.Staff;
import com.rotasync.api.repository.StaffRepository;
import com.rotasync.api.tenancy.TenantContext;
import com.rotasync.api.web.dto.StaffDtos.UpsertStaffRequest;
import jakarta.persistence.EntityNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Tenant-scoped service. Every public method runs inside a transaction with
 * the tenant filter + RLS armed (TenantTransactionAspect), so findById here
 * can only ever return the caller's own tenant's rows.
 *
 * Department visibility (Members see only their own department) is applied
 * on top of tenant isolation, mirroring the Firestore rules being replaced.
 */
@Service
@Transactional
public class StaffService {

    private final StaffRepository staffRepository;

    public StaffService(StaffRepository staffRepository) {
        this.staffRepository = staffRepository;
    }

    @Transactional(readOnly = true)
    public List<Staff> listForCaller(UUID facilityId) {
        TenantContext.Principal caller = TenantContext.get();
        List<Staff> all = staffRepository.findByFacilityIdAndDeletedAtIsNull(facilityId);
        boolean managerOrAbove = caller != null &&
                (com.rotasync.api.domain.Membership.ROLE_MANAGER.equals(caller.role())
                 || com.rotasync.api.domain.Membership.ROLE_ORG_ADMIN.equals(caller.role()));
        if (managerOrAbove || caller == null || caller.departmentId() == null) {
            return all;
        }
        return all.stream()
                .filter(s -> caller.departmentId().equals(s.getDepartmentId()))
                .toList();
    }

    @Transactional(readOnly = true)
    public Staff get(UUID id) {
        // findOneById, not findById: derived queries go through JPQL where the
        // tenant filter applies; em.find() would bypass it (see StaffRepository)
        return staffRepository.findOneById(id)
                .filter(s -> !s.isDeleted())
                .orElseThrow(() -> new EntityNotFoundException("Staff not found"));
    }

    public Staff create(UpsertStaffRequest req) {
        Staff s = new Staff();
        apply(s, req);
        return staffRepository.save(s);
    }

    public Staff update(UUID id, UpsertStaffRequest req) {
        Staff s = get(id);
        apply(s, req);
        return staffRepository.save(s);
    }

    /** Soft delete — the row stays for history/timesheet integrity. */
    public void delete(UUID id) {
        Staff s = get(id);
        s.setDeletedAt(Instant.now());
        staffRepository.save(s);
    }

    private void apply(Staff s, UpsertStaffRequest req) {
        s.setFacilityId(req.facilityId());
        s.setDepartmentId(req.departmentId());
        s.setName(req.name());
        s.setFullName(req.fullName());
        s.setEmail(req.email());
        s.setPhone(req.phone());
        s.setRoleTitle(req.roleTitle() == null ? "" : req.roleTitle());
        s.setEmployeeNo(req.employeeNo());
        s.setContractedHours(req.contractedHours() == null ? 168 : req.contractedHours());
        s.setGender(req.gender() == null ? "" : req.gender());
        s.setSkills(req.skills() == null ? List.of() : req.skills());
        s.setManager(req.isManager());
    }
}
