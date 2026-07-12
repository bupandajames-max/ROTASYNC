package com.rotasync.api.repository;

import com.rotasync.api.domain.Staff;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Note there are NO explicit tenant conditions here — the Hibernate filter
 * (armed by TenantTransactionAspect) rewrites every query with
 * "AND tenant_id = :tenantId", and PostgreSQL RLS backs it up. Repository
 * code stays clean and cannot forget the predicate.
 */
public interface StaffRepository extends JpaRepository<Staff, UUID> {

    List<Staff> findByFacilityIdAndDeletedAtIsNull(UUID facilityId);

    List<Staff> findByDepartmentIdAndDeletedAtIsNull(UUID departmentId);

    /**
     * By-id lookup that goes through JPQL so the tenant filter applies.
     * IMPORTANT: never use findById()/getReferenceById() on tenant entities —
     * Hibernate @Filter does NOT apply to em.find() direct-by-id lookups,
     * which would let a caller probe another tenant's ids. (RLS would still
     * block it in production, but layer 1 must hold on its own.)
     */
    Optional<Staff> findOneById(UUID id);

    Optional<Staff> findByUserIdAndDeletedAtIsNull(UUID userId);

    Optional<Staff> findFirstByEmailIgnoreCaseAndDeletedAtIsNull(String email);
}
