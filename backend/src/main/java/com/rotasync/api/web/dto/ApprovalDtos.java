package com.rotasync.api.web.dto;

import com.rotasync.api.domain.Approval;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

public final class ApprovalDtos {

    private ApprovalDtos() {}

    public record CreateApprovalRequest(
            @NotBlank @Size(max = 60) String type,
            @NotNull Map<String, Object> payload
    ) {}

    public record DecisionRequest(@Size(max = 1000) String note) {}

    public record ApprovalResponse(
            UUID id, UUID facilityId, UUID staffId, String type, String status,
            Map<String, Object> payload, UUID decidedBy, Instant decidedAt, Instant createdAt
    ) {
        public static ApprovalResponse from(Approval a) {
            return new ApprovalResponse(a.getId(), a.getFacilityId(), a.getStaffId(),
                    a.getType(), a.getStatus(), a.getPayload(),
                    a.getDecidedBy(), a.getDecidedAt(), a.getCreatedAt());
        }
    }
}
