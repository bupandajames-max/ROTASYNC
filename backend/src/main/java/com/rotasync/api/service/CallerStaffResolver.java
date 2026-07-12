package com.rotasync.api.service;

import com.rotasync.api.domain.Staff;
import com.rotasync.api.repository.StaffRepository;
import com.rotasync.api.tenancy.TenantContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

/**
 * Maps the authenticated caller to their own staff record (linked by userId,
 * falling back to email — staff rows can predate the person's first login).
 * "Own record" is the basis for every self-scoped rule (my timesheet, my
 * approvals, my extra hours), mirroring the Firestore email-match rules.
 */
@Service
@Transactional(readOnly = true)
public class CallerStaffResolver {

    private final StaffRepository staffRepository;

    public CallerStaffResolver(StaffRepository staffRepository) {
        this.staffRepository = staffRepository;
    }

    public Optional<Staff> resolve() {
        TenantContext.Principal caller = TenantContext.get();
        if (caller == null || caller.tenantId() == null) {
            return Optional.empty();
        }
        Optional<Staff> byUser = staffRepository.findByUserIdAndDeletedAtIsNull(caller.userId());
        if (byUser.isPresent()) {
            return byUser;
        }
        if (caller.email() == null) {
            return Optional.empty();
        }
        return staffRepository.findFirstByEmailIgnoreCaseAndDeletedAtIsNull(caller.email());
    }
}
