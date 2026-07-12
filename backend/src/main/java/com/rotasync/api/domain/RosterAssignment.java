package com.rotasync.api.domain;

import io.hypersistence.utils.hibernate.type.json.JsonType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.hibernate.annotations.Type;

import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;

/** One person's shift on one day of one cycle. */
@Entity
@Table(name = "roster_assignments")
public class RosterAssignment extends TenantOwnedEntity {

    public static final String OFF = "OFF";

    @Column(name = "cycle_id", nullable = false)
    private UUID cycleId;

    @Column(name = "staff_id", nullable = false)
    private UUID staffId;

    @Column(name = "day_date", nullable = false)
    private LocalDate dayDate;

    @Column(name = "shift_code", nullable = false)
    private String shiftCode;

    /** Ad hoc time override: {"start":"08:00","end":"17:30"} — usually null. */
    @Type(JsonType.class)
    @Column(name = "shift_times", columnDefinition = "jsonb")
    private Map<String, Object> shiftTimes;

    public UUID getCycleId() { return cycleId; }
    public void setCycleId(UUID cycleId) { this.cycleId = cycleId; }

    public UUID getStaffId() { return staffId; }
    public void setStaffId(UUID staffId) { this.staffId = staffId; }

    public LocalDate getDayDate() { return dayDate; }
    public void setDayDate(LocalDate dayDate) { this.dayDate = dayDate; }

    public String getShiftCode() { return shiftCode; }
    public void setShiftCode(String shiftCode) { this.shiftCode = shiftCode; }

    public Map<String, Object> getShiftTimes() { return shiftTimes; }
    public void setShiftTimes(Map<String, Object> shiftTimes) { this.shiftTimes = shiftTimes; }
}
