package com.rotasync.api.web;

import com.rotasync.api.service.SettingsService;
import com.rotasync.api.web.dto.SettingsDtos.SettingsResponse;
import com.rotasync.api.web.dto.SettingsDtos.UpdateListBlockRequest;
import com.rotasync.api.web.dto.SettingsDtos.UpdateMapBlockRequest;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/settings")
public class SettingsController {

    private final SettingsService settingsService;

    public SettingsController(SettingsService settingsService) {
        this.settingsService = settingsService;
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('MEMBER','MANAGER','ORG_ADMIN')")
    public SettingsResponse get(@RequestParam UUID facilityId) {
        return SettingsResponse.from(settingsService.getOrDefaults(facilityId));
    }

    @PutMapping("/taxonomy")
    @PreAuthorize("hasAnyRole('MANAGER','ORG_ADMIN')")
    public SettingsResponse updateTaxonomy(@RequestParam UUID facilityId,
                                           @Valid @RequestBody UpdateMapBlockRequest request) {
        return SettingsResponse.from(settingsService.updateTaxonomy(facilityId, request.value()));
    }

    @PutMapping("/shift-defs")
    @PreAuthorize("hasAnyRole('MANAGER','ORG_ADMIN')")
    public SettingsResponse updateShiftDefs(@RequestParam UUID facilityId,
                                            @Valid @RequestBody UpdateMapBlockRequest request) {
        return SettingsResponse.from(settingsService.updateShiftDefs(facilityId, request.value()));
    }

    @PutMapping("/roster-rules")
    @PreAuthorize("hasAnyRole('MANAGER','ORG_ADMIN')")
    public SettingsResponse updateRosterRules(@RequestParam UUID facilityId,
                                              @Valid @RequestBody UpdateMapBlockRequest request) {
        return SettingsResponse.from(settingsService.updateRosterRules(facilityId, request.value()));
    }

    @PutMapping("/holidays")
    @PreAuthorize("hasAnyRole('MANAGER','ORG_ADMIN')")
    public SettingsResponse updateHolidays(@RequestParam UUID facilityId,
                                           @Valid @RequestBody UpdateListBlockRequest request) {
        return SettingsResponse.from(settingsService.updateHolidays(facilityId, request.value()));
    }
}
