package com.rotasync.api.web.dto;

import com.rotasync.api.domain.RosterAssignment;
import com.rotasync.api.domain.RosterCycle;
import com.rotasync.api.domain.RosterSnapshot;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public final class RosterDtos {

    private RosterDtos() {}

    public record AssignmentItem(
            @NotNull UUID staffId,
            @NotNull LocalDate dayDate,
            @NotBlank @Size(max = 20) String shiftCode,
            Map<String, Object> shiftTimes
    ) {
        public static AssignmentItem from(RosterAssignment a) {
            return new AssignmentItem(a.getStaffId(), a.getDayDate(), a.getShiftCode(), a.getShiftTimes());
        }
    }

    public record CreateCycleRequest(
            @NotNull UUID facilityId,
            @NotNull LocalDate startDate,
            @NotNull LocalDate endDate,
            /** true = server generates the roster; false = use `assignments` as given */
            boolean generate,
            @Valid List<AssignmentItem> assignments
    ) {}

    public record UpdateAssignmentsRequest(@NotNull @Valid List<AssignmentItem> assignments) {}

    public record PatchCycleRequest(Boolean isLocked, LocalDate startDate, LocalDate endDate) {}

    /**
     * Includes BOTH the normalized rows and the SPA's existing in-memory shape
     * (`shifts[staffId] = code per day, indexed by day offset from startDate`)
     * so the frontend needs no adapter of its own.
     */
    public record CycleResponse(
            UUID id,
            UUID facilityId,
            LocalDate startDate,
            LocalDate endDate,
            boolean isLocked,
            List<AssignmentItem> assignments,
            Map<UUID, List<String>> shifts
    ) {
        public static CycleResponse from(RosterCycle c, List<AssignmentItem> assignments,
                                         Map<UUID, List<String>> shifts) {
            return new CycleResponse(c.getId(), c.getFacilityId(), c.getStartDate(),
                    c.getEndDate(), c.isLocked(), assignments, shifts);
        }
    }

    public record CycleSummaryResponse(UUID id, UUID facilityId, LocalDate startDate,
                                       LocalDate endDate, boolean isLocked) {
        public static CycleSummaryResponse from(RosterCycle c) {
            return new CycleSummaryResponse(c.getId(), c.getFacilityId(),
                    c.getStartDate(), c.getEndDate(), c.isLocked());
        }
    }

    public record CreateSnapshotRequest(@Size(max = 200) String label) {}

    public record SnapshotSummaryResponse(UUID id, UUID cycleId, String label, Instant createdAt) {
        public static SnapshotSummaryResponse from(RosterSnapshot s) {
            return new SnapshotSummaryResponse(s.getId(), s.getCycleId(), s.getLabel(), s.getCreatedAt());
        }
    }

    public record SnapshotResponse(UUID id, UUID cycleId, String label,
                                   Map<String, Object> snapshot, Instant createdAt) {
        public static SnapshotResponse from(RosterSnapshot s) {
            return new SnapshotResponse(s.getId(), s.getCycleId(), s.getLabel(),
                    s.getSnapshot(), s.getCreatedAt());
        }
    }
}
