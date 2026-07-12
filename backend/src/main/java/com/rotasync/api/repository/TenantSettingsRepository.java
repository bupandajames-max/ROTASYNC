package com.rotasync.api.repository;

import com.rotasync.api.domain.TenantSettings;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface TenantSettingsRepository extends JpaRepository<TenantSettings, UUID> {
    Optional<TenantSettings> findByFacilityIdAndDeletedAtIsNull(UUID facilityId);
    Optional<TenantSettings> findByFacilityIdIsNullAndDeletedAtIsNull();
}
