package com.rotasync.api.web.dto;

import java.util.UUID;

public final class MeDtos {

    private MeDtos() {}

    public record MembershipView(
            UUID tenantId,
            String organizationName,
            UUID facilityId,
            UUID departmentId,
            String role
    ) {}

    public record PendingInviteView(
            UUID inviteId,
            String organizationName,
            String facilityName,
            String role
    ) {}

    public record MeResponse(
            UUID userId,
            String email,
            String displayName,
            boolean systemOwner,
            MembershipView membership,
            PendingInviteView pendingInvite
    ) {}
}
