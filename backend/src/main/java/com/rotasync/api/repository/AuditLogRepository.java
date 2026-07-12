package com.rotasync.api.repository;

import com.rotasync.api.domain.AuditLog;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface AuditLogRepository extends JpaRepository<AuditLog, Long> {
    // AuditLog is not a TenantOwnedEntity (append-only, bigint id), so it is
    // filtered explicitly here — and RLS enforces the same predicate below us.
    List<AuditLog> findByTenantIdOrderByCreatedAtDesc(UUID tenantId, Pageable pageable);
}
