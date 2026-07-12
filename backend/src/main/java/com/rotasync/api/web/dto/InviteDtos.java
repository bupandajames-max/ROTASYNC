package com.rotasync.api.web.dto;

import com.rotasync.api.domain.Invite;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

import java.time.Instant;
import java.util.UUID;

public final class InviteDtos {

    private InviteDtos() {}

    public record CreateInviteRequest(
            @NotBlank @Email String email,
            @NotNull @Pattern(regexp = "ORG_ADMIN|MANAGER|MEMBER") String role,
            @NotNull UUID facilityId,
            UUID departmentId
    ) {}

    public record InviteResponse(
            UUID id, String email, String role, UUID facilityId, UUID departmentId,
            String status, Instant expiresAt, String shareMessage
    ) {
        public static InviteResponse from(Invite i, String shareMessage) {
            return new InviteResponse(i.getId(), i.getEmail(), i.getRole(),
                    i.getFacilityId(), i.getDepartmentId(), i.getStatus(),
                    i.getExpiresAt(), shareMessage);
        }
    }

    public record AcceptInviteResponse(UUID tenantId, UUID facilityId, String role) {}
}
