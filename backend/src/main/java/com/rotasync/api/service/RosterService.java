package com.rotasync.api.service;

import com.rotasync.api.domain.RosterAssignment;
import com.rotasync.api.domain.RosterCycle;
import com.rotasync.api.domain.RosterSnapshot;
import com.rotasync.api.domain.Staff;
import com.rotasync.api.domain.Timesheet;
import com.rotasync.api.repository.RosterAssignmentRepository;
import com.rotasync.api.repository.RosterCycleRepository;
import com.rotasync.api.repository.RosterSnapshotRepository;
import com.rotasync.api.repository.StaffRepository;
import com.rotasync.api.repository.TimesheetRepository;
import com.rotasync.api.tenancy.TenantContext;
import com.rotasync.api.web.dto.RosterDtos.AssignmentItem;
import com.rotasync.api.web.dto.RosterDtos.CreateCycleRequest;
import com.rotasync.api.web.dto.RosterDtos.CreateSnapshotRequest;
import com.rotasync.api.web.dto.RosterDtos.CycleResponse;
import com.rotasync.api.web.dto.RosterDtos.PatchCycleRequest;
import jakarta.persistence.EntityNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@Transactional
public class RosterService {

    private final RosterCycleRepository cycles;
    private final RosterAssignmentRepository assignments;
    private final RosterSnapshotRepository snapshots;
    private final StaffRepository staffRepository;
    private final TimesheetRepository timesheets;
    private final RosterGenerationService generator;
    private final SettingsService settingsService;
    private final AuditService audit;

    public RosterService(RosterCycleRepository cycles,
                         RosterAssignmentRepository assignments,
                         RosterSnapshotRepository snapshots,
                         StaffRepository staffRepository,
                         TimesheetRepository timesheets,
                         RosterGenerationService generator,
                         SettingsService settingsService,
                         AuditService audit) {
        this.cycles = cycles;
        this.assignments = assignments;
        this.snapshots = snapshots;
        this.staffRepository = staffRepository;
        this.timesheets = timesheets;
        this.generator = generator;
        this.settingsService = settingsService;
        this.audit = audit;
    }

    // ── Cycles ───────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<RosterCycle> list(UUID facilityId) {
        return cycles.findByFacilityIdAndDeletedAtIsNullOrderByStartDateDesc(facilityId);
    }

    @Transactional(readOnly = true)
    public CycleResponse get(UUID cycleId) {
        RosterCycle cycle = requireCycle(cycleId);
        return toResponse(cycle, visibleAssignments(cycle));
    }

    public CycleResponse create(CreateCycleRequest req) {
        if (req.endDate().isBefore(req.startDate())) {
            throw new IllegalArgumentException("endDate must be on or after startDate");
        }
        RosterCycle draft = new RosterCycle();
        draft.setFacilityId(req.facilityId());
        draft.setStartDate(req.startDate());
        draft.setEndDate(req.endDate());
        final RosterCycle cycle = cycles.save(draft);

        List<RosterAssignment> rows;
        if (req.generate()) {
            rows = generateAssignments(cycle);
        } else {
            List<AssignmentItem> items = req.assignments() == null ? List.of() : req.assignments();
            rows = items.stream().map(i -> toEntity(cycle, i)).toList();
        }
        assignments.saveAll(rows);
        createDraftTimesheets(cycle);

        audit.record("CYCLE_CREATED", "roster_cycle", cycle.getId().toString(),
                Map.of("facilityId", req.facilityId().toString(),
                       "generated", req.generate(), "assignments", rows.size()));
        return toResponse(cycle, rows);
    }

    public CycleResponse updateAssignments(UUID cycleId, List<AssignmentItem> items) {
        RosterCycle cycle = requireCycle(cycleId);
        if (cycle.isLocked()) {
            throw new IllegalStateException("Cycle is locked");
        }
        Map<String, RosterAssignment> existing = assignments.findByCycleId(cycleId).stream()
                .collect(Collectors.toMap(a -> key(a.getStaffId(), a.getDayDate()), Function.identity()));
        List<RosterAssignment> toSave = new ArrayList<>();
        for (AssignmentItem item : items) {
            requireWithinCycle(cycle, item.dayDate());
            RosterAssignment row = existing.get(key(item.staffId(), item.dayDate()));
            if (row == null) {
                row = toEntity(cycle, item);
            } else {
                row.setShiftCode(item.shiftCode());
                row.setShiftTimes(item.shiftTimes());
            }
            toSave.add(row);
        }
        assignments.saveAll(toSave);
        return toResponse(cycle, assignments.findByCycleId(cycleId));
    }

    public CycleResponse patch(UUID cycleId, PatchCycleRequest req) {
        RosterCycle cycle = requireCycle(cycleId);
        if (req.isLocked() != null) {
            cycle.setLocked(req.isLocked());
        }
        if (req.startDate() != null) {
            cycle.setStartDate(req.startDate());
        }
        if (req.endDate() != null) {
            cycle.setEndDate(req.endDate());
        }
        if (cycle.getEndDate().isBefore(cycle.getStartDate())) {
            throw new IllegalArgumentException("endDate must be on or after startDate");
        }
        cycles.save(cycle);
        return toResponse(cycle, assignments.findByCycleId(cycleId));
    }

    public void delete(UUID cycleId) {
        RosterCycle cycle = requireCycle(cycleId);
        cycle.setDeletedAt(Instant.now());
        cycles.save(cycle);
        audit.record("CYCLE_DELETED", "roster_cycle", cycleId.toString(), null);
    }

    // ── Snapshots ────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<RosterSnapshot> listSnapshots(UUID cycleId) {
        requireCycle(cycleId);
        return snapshots.findByCycleIdAndDeletedAtIsNullOrderByCreatedAtDesc(cycleId);
    }

    public RosterSnapshot createSnapshot(UUID cycleId, CreateSnapshotRequest req) {
        RosterCycle cycle = requireCycle(cycleId);
        List<RosterAssignment> rows = assignments.findByCycleId(cycleId);

        Map<String, Object> frozen = new HashMap<>();
        frozen.put("cycleId", cycle.getId().toString());
        frozen.put("startDate", cycle.getStartDate().toString());
        frozen.put("endDate", cycle.getEndDate().toString());
        frozen.put("isLocked", cycle.isLocked());
        Map<String, List<String>> shifts = new LinkedHashMap<>();
        shiftsByStaff(cycle, rows).forEach((staffId, codes) -> shifts.put(staffId.toString(), codes));
        frozen.put("shifts", shifts);

        RosterSnapshot snap = new RosterSnapshot();
        snap.setFacilityId(cycle.getFacilityId());
        snap.setCycleId(cycleId);
        snap.setLabel(req.label());
        snap.setSnapshot(frozen);
        snap.setCreatedBy(TenantContext.require().userId());
        snap = snapshots.save(snap);
        audit.record("SNAPSHOT_CREATED", "roster_snapshot", snap.getId().toString(),
                Map.of("cycleId", cycleId.toString()));
        return snap;
    }

    @Transactional(readOnly = true)
    public RosterSnapshot getSnapshot(UUID snapshotId) {
        return snapshots.findOneById(snapshotId)
                .filter(s -> !s.isDeleted())
                .orElseThrow(() -> new EntityNotFoundException("Snapshot not found"));
    }

    public void deleteSnapshot(UUID snapshotId) {
        RosterSnapshot snap = getSnapshot(snapshotId);
        snap.setDeletedAt(Instant.now());
        snapshots.save(snap);
        audit.record("SNAPSHOT_DELETED", "roster_snapshot", snapshotId.toString(), null);
    }

    // ── Internals ────────────────────────────────────────────────────────

    private RosterCycle requireCycle(UUID cycleId) {
        return cycles.findOneById(cycleId)
                .filter(c -> !c.isDeleted())
                .orElseThrow(() -> new EntityNotFoundException("Cycle not found"));
    }

    private List<RosterAssignment> generateAssignments(RosterCycle cycle) {
        List<Staff> schedulable = staffRepository
                .findByFacilityIdAndDeletedAtIsNull(cycle.getFacilityId()).stream()
                .filter(s -> !s.isManager())
                .toList();
        var settings = settingsService.getOrDefaults(cycle.getFacilityId());
        var rules = RosterGenerationService.GenerationRules
                .fromSettings(settings.getRosterRules(), settings.getShiftDefs());

        Map<UUID, List<String>> plan = generator.generate(
                schedulable.stream().map(Staff::getId).toList(),
                cycle.getStartDate(), cycle.getEndDate(), rules);

        List<RosterAssignment> rows = new ArrayList<>();
        plan.forEach((staffId, codes) -> {
            for (int d = 0; d < codes.size(); d++) {
                RosterAssignment a = new RosterAssignment();
                a.setCycleId(cycle.getId());
                a.setStaffId(staffId);
                a.setDayDate(cycle.getStartDate().plusDays(d));
                a.setShiftCode(codes.get(d));
                rows.add(a);
            }
        });
        return rows;
    }

    /** Server-side draft timesheets — replaces the SPA's client reconciliation effect. */
    private void createDraftTimesheets(RosterCycle cycle) {
        for (Staff s : staffRepository.findByFacilityIdAndDeletedAtIsNull(cycle.getFacilityId())) {
            if (timesheets.findByStaffIdAndCycleIdAndDeletedAtIsNull(s.getId(), cycle.getId()).isEmpty()) {
                Timesheet t = new Timesheet();
                t.setFacilityId(cycle.getFacilityId());
                t.setStaffId(s.getId());
                t.setCycleId(cycle.getId());
                timesheets.save(t);
            }
        }
    }

    /**
     * Members see only their own department's rows — the server-side
     * equivalent of the per-department cycle shards in the Firestore app.
     */
    private List<RosterAssignment> visibleAssignments(RosterCycle cycle) {
        List<RosterAssignment> all = assignments.findByCycleId(cycle.getId());
        TenantContext.Principal caller = TenantContext.require();
        if (caller.managerOrAbove() || caller.departmentId() == null) {
            return all;
        }
        List<UUID> deptStaff = staffRepository
                .findByDepartmentIdAndDeletedAtIsNull(caller.departmentId())
                .stream().map(Staff::getId).toList();
        return all.stream().filter(a -> deptStaff.contains(a.getStaffId())).toList();
    }

    private CycleResponse toResponse(RosterCycle cycle, List<RosterAssignment> rows) {
        return CycleResponse.from(cycle,
                rows.stream().map(AssignmentItem::from).toList(),
                shiftsByStaff(cycle, rows));
    }

    /** Normalized rows → the SPA's `shifts[staffId] = code-per-day` shape. */
    private Map<UUID, List<String>> shiftsByStaff(RosterCycle cycle, List<RosterAssignment> rows) {
        int days = (int) (cycle.getEndDate().toEpochDay() - cycle.getStartDate().toEpochDay()) + 1;
        Map<UUID, List<String>> shifts = new LinkedHashMap<>();
        for (RosterAssignment a : rows) {
            List<String> row = shifts.computeIfAbsent(a.getStaffId(), k -> {
                List<String> blank = new ArrayList<>(days);
                for (int i = 0; i < days; i++) blank.add(RosterAssignment.OFF);
                return blank;
            });
            int idx = (int) (a.getDayDate().toEpochDay() - cycle.getStartDate().toEpochDay());
            if (idx >= 0 && idx < days) {
                row.set(idx, a.getShiftCode());
            }
        }
        return shifts;
    }

    private RosterAssignment toEntity(RosterCycle cycle, AssignmentItem item) {
        requireWithinCycle(cycle, item.dayDate());
        RosterAssignment a = new RosterAssignment();
        a.setCycleId(cycle.getId());
        a.setStaffId(item.staffId());
        a.setDayDate(item.dayDate());
        a.setShiftCode(item.shiftCode());
        a.setShiftTimes(item.shiftTimes());
        return a;
    }

    private void requireWithinCycle(RosterCycle cycle, LocalDate day) {
        if (day.isBefore(cycle.getStartDate()) || day.isAfter(cycle.getEndDate())) {
            throw new IllegalArgumentException("Assignment date " + day + " is outside the cycle");
        }
    }

    private static String key(UUID staffId, LocalDate day) {
        return staffId + "|" + day;
    }
}
