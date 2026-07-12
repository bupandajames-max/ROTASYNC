package com.rotasync.api.repository;

import com.rotasync.api.domain.Approval;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ApprovalRepository extends JpaRepository<Approval, UUID> {
    Optional<Approval> findOneById(UUID id);
    List<Approval> findByDeletedAtIsNullOrderByCreatedAtDesc();
    List<Approval> findByStaffIdAndDeletedAtIsNullOrderByCreatedAtDesc(UUID staffId);
}
