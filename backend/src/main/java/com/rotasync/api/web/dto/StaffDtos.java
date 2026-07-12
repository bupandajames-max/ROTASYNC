package com.rotasync.api.web.dto;

import com.rotasync.api.domain.Staff;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.util.List;
import java.util.UUID;

/** Request/response shapes for the staff endpoints. */
public final class StaffDtos {

    private StaffDtos() {}

    public record UpsertStaffRequest(
            @NotNull UUID facilityId,
            UUID departmentId,
            @NotBlank String name,
            @NotBlank String fullName,
            String email,
            String phone,
            String roleTitle,
            @NotBlank String employeeNo,
            @Min(1) @Max(400) Integer contractedHours,
            String gender,
            List<String> skills,
            boolean isManager
    ) {}

    public record StaffResponse(
            UUID id,
            UUID facilityId,
            UUID departmentId,
            String name,
            String fullName,
            String email,
            String phone,
            String roleTitle,
            String employeeNo,
            int contractedHours,
            String gender,
            List<String> skills,
            boolean isManager
    ) {
        public static StaffResponse from(Staff s) {
            return new StaffResponse(
                    s.getId(), s.getFacilityId(), s.getDepartmentId(),
                    s.getName(), s.getFullName(), s.getEmail(), s.getPhone(),
                    s.getRoleTitle(), s.getEmployeeNo(), s.getContractedHours(),
                    s.getGender(), s.getSkills(), s.isManager());
        }
    }
}
