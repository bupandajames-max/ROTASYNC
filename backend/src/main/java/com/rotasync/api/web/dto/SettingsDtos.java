package com.rotasync.api.web.dto;

import com.rotasync.api.domain.TenantSettings;
import jakarta.validation.constraints.NotNull;

import java.util.List;
import java.util.Map;
import java.util.UUID;

public final class SettingsDtos {

    private SettingsDtos() {}

    public record SettingsResponse(
            UUID facilityId,
            Map<String, Object> taxonomy,
            Map<String, Object> shiftDefs,
            Map<String, Object> rosterRules,
            List<Object> holidays
    ) {
        public static SettingsResponse from(TenantSettings s) {
            return new SettingsResponse(s.getFacilityId(), s.getTaxonomy(),
                    s.getShiftDefs(), s.getRosterRules(), s.getHolidays());
        }
    }

    public record UpdateMapBlockRequest(@NotNull Map<String, Object> value) {}

    public record UpdateListBlockRequest(@NotNull List<Object> value) {}
}
