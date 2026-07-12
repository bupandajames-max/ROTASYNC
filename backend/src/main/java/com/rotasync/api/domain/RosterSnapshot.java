package com.rotasync.api.domain;

import io.hypersistence.utils.hibernate.type.json.JsonType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.Type;

import java.util.Map;
import java.util.UUID;

/** Immutable point-in-time archive of a whole cycle. */
@Entity
@Table(name = "roster_snapshots")
public class RosterSnapshot extends TenantOwnedEntity {

    @Column(name = "facility_id", nullable = false)
    private UUID facilityId;

    @Column(name = "cycle_id", nullable = false)
    private UUID cycleId;

    private String label;

    @Type(JsonType.class)
    @Column(columnDefinition = "jsonb", nullable = false)
    private Map<String, Object> snapshot;

    @Column(name = "created_by")
    private UUID createdBy;

    public UUID getFacilityId() { return facilityId; }
    public void setFacilityId(UUID facilityId) { this.facilityId = facilityId; }

    public UUID getCycleId() { return cycleId; }
    public void setCycleId(UUID cycleId) { this.cycleId = cycleId; }

    public String getLabel() { return label; }
    public void setLabel(String label) { this.label = label; }

    public Map<String, Object> getSnapshot() { return snapshot; }
    public void setSnapshot(Map<String, Object> snapshot) { this.snapshot = snapshot; }

    public UUID getCreatedBy() { return createdBy; }
    public void setCreatedBy(UUID createdBy) { this.createdBy = createdBy; }
}
