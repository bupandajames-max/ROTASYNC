package com.rotasync.api.repository;

import com.rotasync.api.domain.DailyTask;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface DailyTaskRepository extends JpaRepository<DailyTask, UUID> {
    Optional<DailyTask> findOneById(UUID id);
    List<DailyTask> findByFacilityIdAndDeletedAtIsNullOrderByTaskDateDescCreatedAtAsc(UUID facilityId);
    List<DailyTask> findByFacilityIdAndTaskDateAndDeletedAtIsNull(UUID facilityId, LocalDate taskDate);
    boolean existsByFacilityIdAndTaskDateAndTaskNameIgnoreCaseAndDeletedAtIsNull(
            UUID facilityId, LocalDate taskDate, String taskName);
}
