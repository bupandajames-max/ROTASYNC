package com.rotasync.api.service;

import com.rotasync.api.domain.Organization;
import com.rotasync.api.domain.RosterAssignment;
import com.rotasync.api.domain.RosterCycle;
import com.rotasync.api.domain.RosterSnapshot;
import com.rotasync.api.repository.ApprovalRepository;
import com.rotasync.api.repository.DailyTaskRepository;
import com.rotasync.api.repository.ExtraHoursRepository;
import com.rotasync.api.repository.FacilityRepository;
import com.rotasync.api.repository.OrganizationRepository;
import com.rotasync.api.repository.RosterAssignmentRepository;
import com.rotasync.api.repository.RosterCycleRepository;
import com.rotasync.api.repository.RosterSnapshotRepository;
import com.rotasync.api.repository.TimesheetRepository;
import com.rotasync.api.tenancy.TenantContext;
import com.rotasync.api.web.dto.AdminDtos.FactoryResetRequest;
import com.rotasync.api.web.dto.AdminDtos.FactoryResetResponse;
import jakarta.persistence.EntityNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Factory reset: hard-deletes OPERATIONAL data (cycles, assignments,
 * snapshots, timesheets, approvals, extra hours, tasks) for one facility or
 * the whole tenant. PRESERVES: organization, facilities, departments, staff
 * definitions, memberships, invites, and settings.
 *
 * Hard delete (not soft) is deliberate here: reset means "start clean", and
 * keeping ghosts would resurrect them in history views. The audit record is
 * the trace that it happened. Everything runs in one transaction with the
 * tenant filter + RLS armed, so it can only ever touch the caller's tenant.
 */
@Service
@Transactional
public class AdminService {

    private final OrganizationRepository organizations;
    private final FacilityRepository facilities;
    private final RosterCycleRepository cycles;
    private final RosterAssignmentRepository assignments;
    private final RosterSnapshotRepository snapshots;
    private final TimesheetRepository timesheets;
    private final ApprovalRepository approvals;
    private final ExtraHoursRepository extraHours;
    private final DailyTaskRepository tasks;
    private final AuditService audit;

    public AdminService(OrganizationRepository organizations, FacilityRepository facilities,
                        RosterCycleRepository cycles, RosterAssignmentRepository assignments,
                        RosterSnapshotRepository snapshots, TimesheetRepository timesheets,
                        ApprovalRepository approvals, ExtraHoursRepository extraHours,
                        DailyTaskRepository tasks, AuditService audit) {
        this.organizations = organizations;
        this.facilities = facilities;
        this.cycles = cycles;
        this.assignments = assignments;
        this.snapshots = snapshots;
        this.timesheets = timesheets;
        this.approvals = approvals;
        this.extraHours = extraHours;
        this.tasks = tasks;
        this.audit = audit;
    }

    public FactoryResetResponse factoryReset(FactoryResetRequest req) {
        Organization org = organizations.findOneById(TenantContext.requireTenantId())
                .orElseThrow(() -> new EntityNotFoundException("Organization not found"));
        if (!org.getName().equalsIgnoreCase(req.confirm().trim())) {
            throw new IllegalArgumentException(
                    "Confirmation text must exactly match the organization name");
        }

        List<UUID> facilityIds;
        if (req.facilityId() != null) {
            facilities.findOneById(req.facilityId())
                    .filter(f -> !f.isDeleted())
                    .orElseThrow(() -> new EntityNotFoundException("Facility not found"));
            facilityIds = List.of(req.facilityId());
        } else {
            facilityIds = facilities.findByDeletedAtIsNullOrderByCreatedAtAsc()
                    .stream().map(f -> f.getId()).toList();
        }

        int nAssignments = 0;
        int nSnapshots = 0;
        int nCycles = 0;
        int nTimesheets = 0;
        int nApprovals = 0;
        int nExtraHours = 0;
        int nTasks = 0;

        for (UUID facilityId : facilityIds) {
            // FK order: children of cycles first, then the cycles themselves
            List<RosterCycle> facilityCycles =
                    cycles.findByFacilityIdAndDeletedAtIsNullOrderByStartDateDesc(facilityId);
            for (RosterCycle cycle : facilityCycles) {
                List<RosterAssignment> rows = assignments.findByCycleId(cycle.getId());
                nAssignments += rows.size();
                assignments.deleteAllInBatch(rows);
                List<RosterSnapshot> snaps = snapshots.findByCycleId(cycle.getId());
                nSnapshots += snaps.size();
                snapshots.deleteAllInBatch(snaps);
            }
            var facilityTimesheets = timesheets.findByFacilityIdAndDeletedAtIsNull(facilityId);
            nTimesheets += facilityTimesheets.size();
            timesheets.deleteAllInBatch(facilityTimesheets);
            nCycles += facilityCycles.size();
            cycles.deleteAllInBatch(facilityCycles);

            var facilityApprovals = approvals.findByDeletedAtIsNullOrderByCreatedAtDesc().stream()
                    .filter(a -> facilityId.equals(a.getFacilityId())).toList();
            nApprovals += facilityApprovals.size();
            approvals.deleteAllInBatch(facilityApprovals);

            var facilityExtraHours = extraHours.findByDeletedAtIsNullOrderByWorkDateDesc().stream()
                    .filter(e -> facilityId.equals(e.getFacilityId())).toList();
            nExtraHours += facilityExtraHours.size();
            extraHours.deleteAllInBatch(facilityExtraHours);

            var facilityTasks =
                    tasks.findByFacilityIdAndDeletedAtIsNullOrderByTaskDateDescCreatedAtAsc(facilityId);
            nTasks += facilityTasks.size();
            tasks.deleteAllInBatch(facilityTasks);
        }

        audit.record("FACTORY_RESET", "facility",
                req.facilityId() == null ? "ALL" : req.facilityId().toString(),
                Map.of("cycles", nCycles, "timesheets", nTimesheets, "tasks", nTasks));

        return new FactoryResetResponse(nCycles, nAssignments, nSnapshots, nTimesheets,
                nApprovals, nExtraHours, nTasks,
                "organization, facilities, departments, staff, memberships, invites, settings");
    }
}
