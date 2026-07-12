package com.rotasync.api.web.dto;

import com.rotasync.api.domain.AuditLog;
import com.rotasync.api.domain.Organization;
import jakarta.validation.constraints.NotBlank;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

public final class AdminDtos {

    private AdminDtos() {}

    public record FactoryResetRequest(
            /** Must exactly match the organization name — deliberate friction. */
            @NotBlank String confirm,
            /** null = reset every facility in the tenant */
            UUID facilityId
    ) {}

    public record FactoryResetResponse(
            int cyclesDeleted,
            int assignmentsDeleted,
            int snapshotsDeleted,
            int timesheetsDeleted,
            int approvalsDeleted,
            int extraHoursDeleted,
            int tasksDeleted,
            String preserved
    ) {}

    public record AuditEntryResponse(
            Long id, String action, String entityType, String entityId,
            UUID actorUserId, Map<String, Object> detail, Instant createdAt
    ) {
        public static AuditEntryResponse from(AuditLog a) {
            return new AuditEntryResponse(a.getId(), a.getAction(), a.getEntityType(),
                    a.getEntityId(), a.getActorUserId(), a.getDetail(), a.getCreatedAt());
        }
    }

    public record SysOrganizationResponse(UUID id, String name, Instant createdAt, Instant deletedAt) {
        public static SysOrganizationResponse from(Organization o) {
            return new SysOrganizationResponse(o.getId(), o.getName(), o.getCreatedAt(), o.getDeletedAt());
        }
    }
}
