package com.rotasync.api.service;

import com.rotasync.api.domain.Staff;
import com.rotasync.api.domain.Timesheet;
import com.rotasync.api.repository.TimesheetRepository;
import com.rotasync.api.tenancy.TenantContext;
import jakarta.persistence.EntityNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
@Transactional
public class TimesheetService {

    private final TimesheetRepository timesheets;
    private final CallerStaffResolver callerStaff;
    private final AuditService audit;

    public TimesheetService(TimesheetRepository timesheets, CallerStaffResolver callerStaff,
                            AuditService audit) {
        this.timesheets = timesheets;
        this.callerStaff = callerStaff;
        this.audit = audit;
    }

    /** Manager+: all timesheets in the cycle; Member: own only (self-scoping as in Firestore). */
    @Transactional(readOnly = true)
    public List<Timesheet> list(UUID cycleId) {
        TenantContext.Principal caller = TenantContext.require();
        if (caller.managerOrAbove()) {
            return timesheets.findByCycleIdAndDeletedAtIsNull(cycleId);
        }
        return callerStaff.resolve()
                .flatMap(s -> timesheets.findByStaffIdAndCycleIdAndDeletedAtIsNull(s.getId(), cycleId))
                .map(List::of)
                .orElse(List.of());
    }

    @Transactional(readOnly = true)
    public Timesheet get(UUID id) {
        Timesheet t = require(id);
        requireOwnerOrManager(t);
        return t;
    }

    public Timesheet updateDays(UUID id, Map<String, Object> days) {
        Timesheet t = require(id);
        requireOwner(t); // managers approve, they don't edit someone's hours
        if (!Timesheet.STATUS_DRAFT.equals(t.getStatus())
                && !Timesheet.STATUS_REJECTED.equals(t.getStatus())) {
            throw new IllegalStateException("Only draft or rejected timesheets can be edited");
        }
        t.setDays(days);
        if (Timesheet.STATUS_REJECTED.equals(t.getStatus())) {
            t.setStatus(Timesheet.STATUS_DRAFT); // back to draft on adjustment
        }
        return timesheets.save(t);
    }

    public Timesheet submit(UUID id) {
        Timesheet t = require(id);
        requireOwner(t);
        if (!Timesheet.STATUS_DRAFT.equals(t.getStatus())) {
            throw new IllegalStateException("Only a draft timesheet can be submitted");
        }
        t.setStatus(Timesheet.STATUS_SUBMITTED);
        return timesheets.save(t);
    }

    public Timesheet approve(UUID id) {
        Timesheet t = decide(id, Timesheet.STATUS_APPROVED, null);
        audit.record("TIMESHEET_APPROVED", "timesheet", id.toString(), null);
        return t;
    }

    public Timesheet reject(UUID id, String reason) {
        Timesheet t = decide(id, Timesheet.STATUS_REJECTED, reason);
        audit.record("TIMESHEET_REJECTED", "timesheet", id.toString(),
                reason == null ? null : Map.of("reason", reason));
        return t;
    }

    private Timesheet decide(UUID id, String newStatus, String reason) {
        Timesheet t = require(id);
        if (!Timesheet.STATUS_SUBMITTED.equals(t.getStatus())) {
            throw new IllegalStateException("Only a submitted timesheet can be decided");
        }
        t.setStatus(newStatus);
        if (reason != null) {
            t.getDays().put("_rejectionReason", reason);
        }
        return timesheets.save(t);
    }

    private Timesheet require(UUID id) {
        return timesheets.findOneById(id)
                .filter(t -> !t.isDeleted())
                .orElseThrow(() -> new EntityNotFoundException("Timesheet not found"));
    }

    private void requireOwner(Timesheet t) {
        UUID ownStaffId = callerStaff.resolve().map(Staff::getId).orElse(null);
        if (ownStaffId == null || !ownStaffId.equals(t.getStaffId())) {
            // 404 to avoid confirming another person's timesheet id
            throw new EntityNotFoundException("Timesheet not found");
        }
    }

    private void requireOwnerOrManager(Timesheet t) {
        if (TenantContext.require().managerOrAbove()) {
            return;
        }
        requireOwner(t);
    }

}
