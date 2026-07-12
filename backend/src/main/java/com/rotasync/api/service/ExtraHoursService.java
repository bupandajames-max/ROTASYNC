package com.rotasync.api.service;

import com.rotasync.api.domain.ExtraHours;
import com.rotasync.api.domain.Staff;
import com.rotasync.api.repository.ExtraHoursRepository;
import com.rotasync.api.repository.StaffRepository;
import com.rotasync.api.tenancy.TenantContext;
import com.rotasync.api.web.dto.ExtraHoursDtos.CreateExtraHoursRequest;
import jakarta.persistence.EntityNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
@Transactional
public class ExtraHoursService {

    private final ExtraHoursRepository extraHours;
    private final StaffRepository staffRepository;
    private final CallerStaffResolver callerStaff;
    private final AuditService audit;

    public ExtraHoursService(ExtraHoursRepository extraHours, StaffRepository staffRepository,
                             CallerStaffResolver callerStaff, AuditService audit) {
        this.extraHours = extraHours;
        this.staffRepository = staffRepository;
        this.callerStaff = callerStaff;
        this.audit = audit;
    }

    /** Manager+: any staff member's entries (or all); Member: own only. */
    @Transactional(readOnly = true)
    public List<ExtraHours> list(UUID staffId) {
        TenantContext.Principal caller = TenantContext.require();
        if (caller.managerOrAbove()) {
            return staffId == null
                    ? extraHours.findByDeletedAtIsNullOrderByWorkDateDesc()
                    : extraHours.findByStaffIdAndDeletedAtIsNullOrderByWorkDateDesc(staffId);
        }
        return callerStaff.resolve()
                .map(s -> extraHours.findByStaffIdAndDeletedAtIsNullOrderByWorkDateDesc(s.getId()))
                .orElse(List.of());
    }

    /** Members may only log hours against their OWN staff record; Manager+ against anyone's. */
    public ExtraHours create(CreateExtraHoursRequest req) {
        TenantContext.Principal caller = TenantContext.require();
        Staff target;
        if (caller.managerOrAbove()) {
            target = staffRepository.findOneById(req.staffId())
                    .filter(s -> !s.isDeleted())
                    .orElseThrow(() -> new EntityNotFoundException("Staff not found"));
        } else {
            target = callerStaff.resolve()
                    .filter(s -> s.getId().equals(req.staffId()))
                    .orElseThrow(() -> new EntityNotFoundException("Staff not found"));
        }
        ExtraHours e = new ExtraHours();
        e.setFacilityId(target.getFacilityId());
        e.setStaffId(target.getId());
        e.setWorkDate(req.workDate());
        e.setHours(req.hours());
        e.setReason(req.reason());
        ExtraHours saved = extraHours.save(e);
        audit.record("EXTRA_HOURS_LOGGED", "extra_hours", saved.getId().toString(),
                Map.of("staffId", target.getId().toString(), "hours", req.hours().toPlainString()));
        return saved;
    }

    public ExtraHours approve(UUID id) {
        return decide(id, ExtraHours.STATUS_APPROVED);
    }

    public ExtraHours reject(UUID id) {
        return decide(id, ExtraHours.STATUS_REJECTED);
    }

    /** Member: own PENDING entry only; Manager+: any entry. */
    public void delete(UUID id) {
        ExtraHours e = require(id);
        TenantContext.Principal caller = TenantContext.require();
        if (!caller.managerOrAbove()) {
            UUID ownStaffId = callerStaff.resolve().map(Staff::getId).orElse(null);
            if (ownStaffId == null || !ownStaffId.equals(e.getStaffId())) {
                throw new EntityNotFoundException("Entry not found");
            }
            if (!ExtraHours.STATUS_PENDING.equals(e.getStatus())) {
                throw new IllegalStateException("Only a pending entry can be removed");
            }
        }
        e.setDeletedAt(Instant.now());
        extraHours.save(e);
    }

    private ExtraHours decide(UUID id, String status) {
        ExtraHours e = require(id);
        if (!ExtraHours.STATUS_PENDING.equals(e.getStatus())) {
            throw new IllegalStateException("This entry has already been decided");
        }
        e.setStatus(status);
        ExtraHours saved = extraHours.save(e);
        audit.record("EXTRA_HOURS_" + status, "extra_hours", id.toString(), null);
        return saved;
    }

    private ExtraHours require(UUID id) {
        return extraHours.findOneById(id)
                .filter(x -> !x.isDeleted())
                .orElseThrow(() -> new EntityNotFoundException("Entry not found"));
    }
}
