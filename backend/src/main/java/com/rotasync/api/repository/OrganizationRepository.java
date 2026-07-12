package com.rotasync.api.repository;

import com.rotasync.api.domain.Organization;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface OrganizationRepository extends JpaRepository<Organization, UUID> {
    // Organization has no Hibernate tenant filter (its id IS the tenant id);
    // RLS policy org_self scopes it. findOneById keeps the convention anyway.
    Optional<Organization> findOneById(UUID id);
    List<Organization> findAllByOrderByCreatedAtDesc(); // system-owner console (RLS bypass)
}
