package com.rotasync.api.service;

import com.rotasync.api.domain.TenantSettings;
import com.rotasync.api.repository.TenantSettingsRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
@Transactional
public class SettingsService {

    private final TenantSettingsRepository repository;
    private final AuditService audit;

    public SettingsService(TenantSettingsRepository repository, AuditService audit) {
        this.repository = repository;
        this.audit = audit;
    }

    /** Facility settings, falling back to org-wide, falling back to a fresh empty row. */
    @Transactional(readOnly = true)
    public TenantSettings getOrDefaults(UUID facilityId) {
        return repository.findByFacilityIdAndDeletedAtIsNull(facilityId)
                .or(repository::findByFacilityIdIsNullAndDeletedAtIsNull)
                .orElseGet(() -> {
                    TenantSettings empty = new TenantSettings();
                    empty.setFacilityId(facilityId);
                    return empty; // not persisted — pure defaults view
                });
    }

    public TenantSettings updateTaxonomy(UUID facilityId, Map<String, Object> taxonomy) {
        TenantSettings s = ensureRow(facilityId);
        s.setTaxonomy(taxonomy);
        audit.record("SETTINGS_TAXONOMY_UPDATED", "tenant_settings", s.getId() == null ? null : s.getId().toString(), null);
        return repository.save(s);
    }

    public TenantSettings updateShiftDefs(UUID facilityId, Map<String, Object> shiftDefs) {
        TenantSettings s = ensureRow(facilityId);
        s.setShiftDefs(shiftDefs);
        return repository.save(s);
    }

    public TenantSettings updateRosterRules(UUID facilityId, Map<String, Object> rosterRules) {
        TenantSettings s = ensureRow(facilityId);
        s.setRosterRules(rosterRules);
        return repository.save(s);
    }

    public TenantSettings updateHolidays(UUID facilityId, List<Object> holidays) {
        TenantSettings s = ensureRow(facilityId);
        s.setHolidays(holidays);
        return repository.save(s);
    }

    private TenantSettings ensureRow(UUID facilityId) {
        return repository.findByFacilityIdAndDeletedAtIsNull(facilityId)
                .orElseGet(() -> {
                    TenantSettings s = new TenantSettings();
                    s.setFacilityId(facilityId);
                    return s;
                });
    }
}
