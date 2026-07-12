package com.rotasync.api.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "daily_tasks")
public class DailyTask extends TenantOwnedEntity {

    public static final String STATUS_PENDING = "PENDING";
    public static final String STATUS_IN_PROGRESS = "IN_PROGRESS";
    public static final String STATUS_BLOCKED = "BLOCKED";
    public static final String STATUS_PENDING_REVIEW = "PENDING_REVIEW";
    public static final String STATUS_DONE = "DONE";

    @Column(name = "facility_id", nullable = false)
    private UUID facilityId;

    @Column(name = "department_id")
    private UUID departmentId;

    @Column(name = "staff_id")
    private UUID staffId;

    @Column(name = "task_name", nullable = false)
    private String taskName;

    @Column(name = "task_date", nullable = false)
    private LocalDate taskDate;

    @Column(nullable = false)
    private String status = STATUS_PENDING;

    @Column(nullable = false)
    private String priority = "NORMAL";

    private String notes;

    @Column(name = "tracker_value")
    private Integer trackerValue;

    @Column(name = "tracker_target")
    private Integer trackerTarget;

    @Column(name = "counter_sign")
    private String counterSign;

    public UUID getFacilityId() { return facilityId; }
    public void setFacilityId(UUID facilityId) { this.facilityId = facilityId; }

    public UUID getDepartmentId() { return departmentId; }
    public void setDepartmentId(UUID departmentId) { this.departmentId = departmentId; }

    public UUID getStaffId() { return staffId; }
    public void setStaffId(UUID staffId) { this.staffId = staffId; }

    public String getTaskName() { return taskName; }
    public void setTaskName(String taskName) { this.taskName = taskName; }

    public LocalDate getTaskDate() { return taskDate; }
    public void setTaskDate(LocalDate taskDate) { this.taskDate = taskDate; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getPriority() { return priority; }
    public void setPriority(String priority) { this.priority = priority; }

    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }

    public Integer getTrackerValue() { return trackerValue; }
    public void setTrackerValue(Integer trackerValue) { this.trackerValue = trackerValue; }

    public Integer getTrackerTarget() { return trackerTarget; }
    public void setTrackerTarget(Integer trackerTarget) { this.trackerTarget = trackerTarget; }

    public String getCounterSign() { return counterSign; }
    public void setCounterSign(String counterSign) { this.counterSign = counterSign; }
}
