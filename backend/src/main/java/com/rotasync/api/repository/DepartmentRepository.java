package com.rotasync.api.repository;

import com.rotasync.api.domain.Department;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface DepartmentRepository extends JpaRepository<Department, UUID> {
    Optional<Department> findOneById(UUID id);
    List<Department> findByFacilityIdAndDeletedAtIsNullOrderByCreatedAtAsc(UUID facilityId);
    Optional<Department> findByFacilityIdAndNameIgnoreCaseAndDeletedAtIsNull(UUID facilityId, String name);
}
