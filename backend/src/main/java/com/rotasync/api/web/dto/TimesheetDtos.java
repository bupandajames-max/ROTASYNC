package com.rotasync.api.web.dto;

import com.rotasync.api.domain.Timesheet;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.Map;
import java.util.UUID;

public final class TimesheetDtos {

    private TimesheetDtos() {}

    public record UpdateDaysRequest(@NotNull Map<String, Object> days) {}

    public record RejectRequest(@Size(max = 1000) String reason) {}

    public record TimesheetResponse(
            UUID id, UUID facilityId, UUID staffId, UUID cycleId,
            String status, Map<String, Object> days
    ) {
        public static TimesheetResponse from(Timesheet t) {
            return new TimesheetResponse(t.getId(), t.getFacilityId(), t.getStaffId(),
                    t.getCycleId(), t.getStatus(), t.getDays());
        }
    }
}
