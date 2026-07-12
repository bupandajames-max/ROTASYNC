package com.rotasync.api.domain;

import io.hypersistence.utils.hibernate.type.json.JsonType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.Type;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "timesheets")
public class Timesheet extends TenantOwnedEntity {

    public static final String STATUS_DRAFT = "DRAFT";
    public static final String STATUS_SUBMITTED = "SUBMITTED";
    public static final String STATUS_APPROVED = "APPROVED";
    public static final String STATUS_REJECTED = "REJECTED";

    @Column(name = "facility_id", nullable = false)
    private UUID facilityId;

    @Column(name = "staff_id", nullable = false)
    private UUID staffId;

    @Column(name = "cycle_id", nullable = false)
    private UUID cycleId;

    @Column(nullable = false)
    private String status = STATUS_DRAFT;

    /** Per-date entries — same shape the SPA already uses (jsonb). */
    @Type(JsonType.class)
    @Column(columnDefinition = "jsonb", nullable = false)
    private Map<String, Object> days = new HashMap<>();

    public UUID getFacilityId() { return facilityId; }
    public void setFacilityId(UUID facilityId) { this.facilityId = facilityId; }

    public UUID getStaffId() { return staffId; }
    public void setStaffId(UUID staffId) { this.staffId = staffId; }

    public UUID getCycleId() { return cycleId; }
    public void setCycleId(UUID cycleId) { this.cycleId = cycleId; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public Map<String, Object> getDays() { return days; }
    public void setDays(Map<String, Object> days) { this.days = days; }
}
