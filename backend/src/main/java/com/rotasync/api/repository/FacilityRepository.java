package com.rotasync.api.repository;

import com.rotasync.api.domain.Facility;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface FacilityRepository extends JpaRepository<Facility, UUID> {
    Optional<Facility> findOneById(UUID id);
    List<Facility> findByDeletedAtIsNullOrderByCreatedAtAsc();
}
