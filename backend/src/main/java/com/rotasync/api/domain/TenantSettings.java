package com.rotasync.api.domain;

import io.hypersistence.utils.hibernate.type.json.JsonType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.Type;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Per-facility (or org-wide when facilityId is null) settings blocks — kept
 * as jsonb in exactly the shapes the SPA already uses (taxonomy, shiftDefs,
 * rosterRules, holidays) so no client data-model rewrite is needed.
 */
@Entity
@Table(name = "tenant_settings")
public class TenantSettings extends TenantOwnedEntity {

    @Column(name = "facility_id")
    private UUID facilityId;

    @Type(JsonType.class)
    @Column(columnDefinition = "jsonb", nullable = false)
    private Map<String, Object> taxonomy = new HashMap<>();

    @Type(JsonType.class)
    @Column(name = "shift_defs", columnDefinition = "jsonb", nullable = false)
    private Map<String, Object> shiftDefs = new HashMap<>();

    @Type(JsonType.class)
    @Column(name = "roster_rules", columnDefinition = "jsonb", nullable = false)
    private Map<String, Object> rosterRules = new HashMap<>();

    @Type(JsonType.class)
    @Column(columnDefinition = "jsonb", nullable = false)
    private List<Object> holidays = new ArrayList<>();

    public UUID getFacilityId() { return facilityId; }
    public void setFacilityId(UUID facilityId) { this.facilityId = facilityId; }

    public Map<String, Object> getTaxonomy() { return taxonomy; }
    public void setTaxonomy(Map<String, Object> taxonomy) { this.taxonomy = taxonomy; }

    public Map<String, Object> getShiftDefs() { return shiftDefs; }
    public void setShiftDefs(Map<String, Object> shiftDefs) { this.shiftDefs = shiftDefs; }

    public Map<String, Object> getRosterRules() { return rosterRules; }
    public void setRosterRules(Map<String, Object> rosterRules) { this.rosterRules = rosterRules; }

    public List<Object> getHolidays() { return holidays; }
    public void setHolidays(List<Object> holidays) { this.holidays = holidays; }
}
