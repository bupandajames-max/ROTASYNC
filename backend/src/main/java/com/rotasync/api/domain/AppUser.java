package com.rotasync.api.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.util.UUID;

/**
 * Global identity — deliberately NOT tenant-owned: one human can belong to
 * several organizations, and the login-time lookup happens before any tenant
 * is known. Contains identity data only; everything operational lives in
 * tenant-owned tables.
 */
@Entity
@Table(name = "app_users")
public class AppUser {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "firebase_uid", unique = true)
    private String firebaseUid;

    @Column(nullable = false)
    private String email;

    @Column(name = "display_name")
    private String displayName;

    @Column(name = "is_system_owner", nullable = false)
    private boolean systemOwner;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public String getFirebaseUid() { return firebaseUid; }
    public void setFirebaseUid(String firebaseUid) { this.firebaseUid = firebaseUid; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getDisplayName() { return displayName; }
    public void setDisplayName(String displayName) { this.displayName = displayName; }

    public boolean isSystemOwner() { return systemOwner; }
    public void setSystemOwner(boolean systemOwner) { this.systemOwner = systemOwner; }
}
