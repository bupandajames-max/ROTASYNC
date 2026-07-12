package com.rotasync.api.service;

import com.rotasync.api.domain.Approval;
import com.rotasync.api.domain.RosterAssignment;
import com.rotasync.api.domain.Staff;
import com.rotasync.api.repository.ApprovalRepository;
import com.rotasync.api.repository.RosterAssignmentRepository;
import com.rotasync.api.tenancy.TenantContext;
import com.rotasync.api.web.dto.ApprovalDtos.CreateApprovalRequest;
import jakarta.persistence.EntityNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
@Transactional
public class ApprovalService {

    private final ApprovalRepository approvals;
    private final RosterAssignmentRepository assignments;
    private final CallerStaffResolver callerStaff;
    private final AuditService audit;

    public ApprovalService(ApprovalRepository approvals, RosterAssignmentRepository assignments,
                           CallerStaffResolver callerStaff, AuditService audit) {
        this.approvals = approvals;
        this.assignments = assignments;
        this.callerStaff = callerStaff;
        this.audit = audit;
    }

    /** Manager+: everything in the tenant; Member: own requests only. */
    @Transactional(readOnly = true)
    public List<Approval> list() {
        TenantContext.Principal caller = TenantContext.require();
        if (caller.managerOrAbove()) {
            return approvals.findByDeletedAtIsNullOrderByCreatedAtDesc();
        }
        return callerStaff.resolve()
                .map(s -> approvals.findByStaffIdAndDeletedAtIsNullOrderByCreatedAtDesc(s.getId()))
                .orElse(List.of());
    }

    /** staffId is ALWAYS the caller's own staff record — never client-supplied. */
    public Approval create(CreateApprovalRequest req) {
        Staff self = callerStaff.resolve()
                .orElseThrow(() -> new IllegalStateException(
                        "Your account has no staff record in this workspace yet"));
        Approval a = new Approval();
        a.setFacilityId(self.getFacilityId());
        a.setStaffId(self.getId());
        a.setType(req.type());
        a.setPayload(req.payload());
        Approval saved = approvals.save(a);
        audit.record("APPROVAL_REQUESTED", "approval", saved.getId().toString(),
                Map.of("type", saved.getType()));
        return saved;
    }

    public Approval approve(UUID id, String note) {
        Approval a = requirePending(id);
        if (Approval.TYPE_SHIFT_SWAP.equals(a.getType())) {
            applyShiftSwap(a);
        }
        return decide(a, Approval.STATUS_APPROVED, note);
    }

    public Approval reject(UUID id, String note) {
        return decide(requirePending(id), Approval.STATUS_REJECTED, note);
    }

    /** Requester withdraws their own PENDING request. */
    public void cancel(UUID id) {
        Approval a = require(id);
        UUID ownStaffId = callerStaff.resolve().map(Staff::getId).orElse(null);
        if (ownStaffId == null || !ownStaffId.equals(a.getStaffId())) {
            throw new EntityNotFoundException("Approval not found");
        }
        if (!Approval.STATUS_PENDING.equals(a.getStatus())) {
            throw new IllegalStateException("Only a pending request can be cancelled");
        }
        a.setStatus(Approval.STATUS_CANCELLED);
        approvals.save(a);
    }

    // ── Internals ────────────────────────────────────────────────────────

    private Approval decide(Approval a, String status, String note) {
        a.setStatus(status);
        a.setDecidedBy(TenantContext.require().userId());
        a.setDecidedAt(Instant.now());
        if (note != null && !note.isBlank()) {
            a.getPayload().put("decisionNote", note);
        }
        Approval saved = approvals.save(a);
        audit.record("APPROVAL_" + status, "approval", a.getId().toString(),
                Map.of("type", a.getType()));
        return saved;
    }

    /**
     * Applying a SHIFT_SWAP atomically with the decision — payload:
     * { "cycleId": "...", "dayDate": "YYYY-MM-DD", "staffAId": "...", "staffBId": "..." }
     */
    private void applyShiftSwap(Approval a) {
        Map<String, Object> p = a.getPayload();
        UUID cycleId = uuidField(p, "cycleId");
        UUID staffA = uuidField(p, "staffAId");
        UUID staffB = uuidField(p, "staffBId");
        LocalDate day = LocalDate.parse(String.valueOf(p.get("dayDate")));

        RosterAssignment rowA = assignments.findByCycleIdAndStaffIdAndDayDate(cycleId, staffA, day)
                .orElseThrow(() -> new IllegalStateException("Swap source shift no longer exists"));
        RosterAssignment rowB = assignments.findByCycleIdAndStaffIdAndDayDate(cycleId, staffB, day)
                .orElseThrow(() -> new IllegalStateException("Swap target shift no longer exists"));

        String codeA = rowA.getShiftCode();
        Map<String, Object> timesA = rowA.getShiftTimes();
        rowA.setShiftCode(rowB.getShiftCode());
        rowA.setShiftTimes(rowB.getShiftTimes());
        rowB.setShiftCode(codeA);
        rowB.setShiftTimes(timesA);
        assignments.save(rowA);
        assignments.save(rowB);
    }

    private static UUID uuidField(Map<String, Object> payload, String key) {
        Object v = payload.get(key);
        if (v == null) {
            throw new IllegalArgumentException("Swap payload is missing " + key);
        }
        return UUID.fromString(String.valueOf(v));
    }

    private Approval require(UUID id) {
        return approvals.findOneById(id)
                .filter(x -> !x.isDeleted())
                .orElseThrow(() -> new EntityNotFoundException("Approval not found"));
    }

    private Approval requirePending(UUID id) {
        Approval a = require(id);
        if (!Approval.STATUS_PENDING.equals(a.getStatus())) {
            throw new IllegalStateException("This request has already been decided");
        }
        return a;
    }
}
