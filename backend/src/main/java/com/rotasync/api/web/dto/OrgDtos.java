package com.rotasync.api.web.dto;

import com.rotasync.api.domain.Department;
import com.rotasync.api.domain.Facility;
import com.rotasync.api.domain.Organization;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.UUID;

public final class OrgDtos {

    private OrgDtos() {}

    public record OrganizationResponse(UUID id, String name) {
        public static OrganizationResponse from(Organization o) {
            return new OrganizationResponse(o.getId(), o.getName());
        }
    }

    public record UpdateOrganizationRequest(@NotBlank @Size(max = 200) String name) {}

    public record DeleteOrganizationRequest(@NotBlank String confirm) {}

    public record UpsertFacilityRequest(
            @NotBlank @Size(max = 200) String name,
            @Size(max = 300) String location,
            @Size(max = 60) String facilityType,
            @Size(max = 200) String leadManager,
            @Size(max = 100) String timezoneLabel
    ) {}

    public record FacilityResponse(
            UUID id, String name, String location, String facilityType,
            String leadManager, String timezoneLabel
    ) {
        public static FacilityResponse from(Facility f) {
            return new FacilityResponse(f.getId(), f.getName(), f.getLocation(),
                    f.getFacilityType(), f.getLeadManager(), f.getTimezoneLabel());
        }
    }

    public record UpsertDepartmentRequest(
            @NotBlank @Size(max = 200) String name,
            @Size(max = 1000) String description
    ) {}

    public record DepartmentResponse(UUID id, UUID facilityId, String name, String description) {
        public static DepartmentResponse from(Department d) {
            return new DepartmentResponse(d.getId(), d.getFacilityId(), d.getName(), d.getDescription());
        }
    }
}
