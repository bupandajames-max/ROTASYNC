package com.rotasync.api.repository;

import com.rotasync.api.domain.ExtraHours;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ExtraHoursRepository extends JpaRepository<ExtraHours, UUID> {
    Optional<ExtraHours> findOneById(UUID id);
    List<ExtraHours> findByDeletedAtIsNullOrderByWorkDateDesc();
    List<ExtraHours> findByStaffIdAndDeletedAtIsNullOrderByWorkDateDesc(UUID staffId);
}
