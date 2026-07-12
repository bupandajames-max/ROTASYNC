package com.rotasync.api.web.dto;

import com.rotasync.api.domain.ExtraHours;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

public final class ExtraHoursDtos {

    private ExtraHoursDtos() {}

    public record CreateExtraHoursRequest(
            @NotNull UUID staffId,
            @NotNull LocalDate workDate,
            @NotNull @DecimalMin(value = "0.25") @DecimalMax(value = "24") BigDecimal hours,
            @Size(max = 1000) String reason
    ) {}

    public record ExtraHoursResponse(
            UUID id, UUID facilityId, UUID staffId, LocalDate workDate,
            BigDecimal hours, String reason, String status
    ) {
        public static ExtraHoursResponse from(ExtraHours e) {
            return new ExtraHoursResponse(e.getId(), e.getFacilityId(), e.getStaffId(),
                    e.getWorkDate(), e.getHours(), e.getReason(), e.getStatus());
        }
    }
}
