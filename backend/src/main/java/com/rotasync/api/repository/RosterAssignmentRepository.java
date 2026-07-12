package com.rotasync.api.repository;

import com.rotasync.api.domain.RosterAssignment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface RosterAssignmentRepository extends JpaRepository<RosterAssignment, UUID> {
    List<RosterAssignment> findByCycleId(UUID cycleId);
    List<RosterAssignment> findByCycleIdAndStaffIdIn(UUID cycleId, List<UUID> staffIds);
    Optional<RosterAssignment> findByCycleIdAndStaffIdAndDayDate(UUID cycleId, UUID staffId, LocalDate dayDate);
    void deleteByCycleId(UUID cycleId);
}
