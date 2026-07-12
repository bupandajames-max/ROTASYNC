package com.rotasync.api.web.dto;

import com.rotasync.api.domain.DailyTask;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public final class TaskDtos {

    private TaskDtos() {}

    private static final String STATUSES = "PENDING|IN_PROGRESS|BLOCKED|PENDING_REVIEW|DONE";
    private static final String PRIORITIES = "LOW|NORMAL|HIGH";

    public record UpsertTaskRequest(
            @NotNull UUID facilityId,
            UUID departmentId,
            UUID staffId,
            @NotBlank @Size(max = 300) String taskName,
            @NotNull LocalDate taskDate,
            @Pattern(regexp = STATUSES) String status,
            @Pattern(regexp = PRIORITIES) String priority,
            @Size(max = 2000) String notes,
            @Min(0) @Max(100000) Integer trackerValue,
            @Min(0) @Max(100000) Integer trackerTarget
    ) {}

    /** Assignee-updatable subset — everything else requires Manager+. */
    public record TaskProgressRequest(
            @Pattern(regexp = STATUSES) String status,
            @Size(max = 2000) String notes,
            @Min(0) @Max(100000) Integer trackerValue,
            @Size(max = 200) String counterSign
    ) {}

    public record TaskTemplate(
            @NotBlank @Size(max = 300) String taskName,
            UUID departmentId,
            UUID staffId,
            @Pattern(regexp = PRIORITIES) String priority,
            @Min(0) @Max(100000) Integer trackerTarget
    ) {}

    public record GenerateTasksRequest(
            @NotNull UUID facilityId,
            @NotNull LocalDate date,
            @NotNull @Valid List<TaskTemplate> templates
    ) {}

    public record TaskResponse(
            UUID id, UUID facilityId, UUID departmentId, UUID staffId,
            String taskName, LocalDate taskDate, String status, String priority,
            String notes, Integer trackerValue, Integer trackerTarget, String counterSign
    ) {
        public static TaskResponse from(DailyTask t) {
            return new TaskResponse(t.getId(), t.getFacilityId(), t.getDepartmentId(),
                    t.getStaffId(), t.getTaskName(), t.getTaskDate(), t.getStatus(),
                    t.getPriority(), t.getNotes(), t.getTrackerValue(),
                    t.getTrackerTarget(), t.getCounterSign());
        }
    }
}
