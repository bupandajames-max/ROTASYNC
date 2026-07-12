package com.rotasync.api.repository;

import com.rotasync.api.domain.Timesheet;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface TimesheetRepository extends JpaRepository<Timesheet, UUID> {
    Optional<Timesheet> findOneById(UUID id);
    List<Timesheet> findByCycleIdAndDeletedAtIsNull(UUID cycleId);
    List<Timesheet> findByStaffIdAndDeletedAtIsNull(UUID staffId);
    Optional<Timesheet> findByStaffIdAndCycleIdAndDeletedAtIsNull(UUID staffId, UUID cycleId);
    List<Timesheet> findByFacilityIdAndDeletedAtIsNull(UUID facilityId);
}
