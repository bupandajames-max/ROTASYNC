package com.rotasync.api.repository;

import com.rotasync.api.domain.RosterSnapshot;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface RosterSnapshotRepository extends JpaRepository<RosterSnapshot, UUID> {
    Optional<RosterSnapshot> findOneById(UUID id);
    List<RosterSnapshot> findByCycleIdAndDeletedAtIsNullOrderByCreatedAtDesc(UUID cycleId);
    List<RosterSnapshot> findByCycleId(UUID cycleId);
}
