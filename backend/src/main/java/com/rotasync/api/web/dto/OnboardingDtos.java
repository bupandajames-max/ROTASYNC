package com.rotasync.api.web.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.Map;
import java.util.UUID;

public final class OnboardingDtos {

    private OnboardingDtos() {}

    public record NewFacility(
            @NotBlank @Size(max = 200) String name,
            @Size(max = 300) String location,
            @Size(max = 60) String facilityType
    ) {}

    public record NewDepartment(
            @NotBlank @Size(max = 200) String name,
            @Size(max = 1000) String description
    ) {}

    public record NewTeamMember(
            @NotBlank @Size(max = 200) String name,
            @NotBlank @Size(max = 300) String fullName,
            @Email String email,
            @Size(max = 60) String employeeNo,
            @Size(max = 200) String departmentName,
            boolean isManager
    ) {}

    public record CreateOrganizationRequest(
            @NotBlank @Size(max = 200) String organizationName,
            @NotNull @Valid NewFacility facility,
            @Valid List<NewDepartment> departments,
            Map<String, Object> taxonomy,
            @Valid List<NewTeamMember> team
    ) {}

    public record CreateOrganizationResponse(
            UUID organizationId,
            UUID facilityId,
            List<UUID> departmentIds,
            int staffCreated
    ) {}
}
