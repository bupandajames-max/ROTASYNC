package com.rotasync.api.repository;

import com.rotasync.api.domain.RosterCycle;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface RosterCycleRepository extends JpaRepository<RosterCycle, UUID> {
    Optional<RosterCycle> findOneById(UUID id);
    List<RosterCycle> findByFacilityIdAndDeletedAtIsNullOrderByStartDateDesc(UUID facilityId);
}
