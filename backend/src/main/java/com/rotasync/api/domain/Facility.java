package com.rotasync.api.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

@Entity
@Table(name = "facilities")
public class Facility extends TenantOwnedEntity {

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private String location = "";

    @Column(name = "facility_type", nullable = false)
    private String facilityType = "Branch";

    @Column(name = "lead_manager")
    private String leadManager;

    @Column(name = "timezone_label")
    private String timezoneLabel;

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getLocation() { return location; }
    public void setLocation(String location) { this.location = location; }

    public String getFacilityType() { return facilityType; }
    public void setFacilityType(String facilityType) { this.facilityType = facilityType; }

    public String getLeadManager() { return leadManager; }
    public void setLeadManager(String leadManager) { this.leadManager = leadManager; }

    public String getTimezoneLabel() { return timezoneLabel; }
    public void setTimezoneLabel(String timezoneLabel) { this.timezoneLabel = timezoneLabel; }
}
