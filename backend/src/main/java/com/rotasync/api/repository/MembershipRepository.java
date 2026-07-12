package com.rotasync.api.repository;

import com.rotasync.api.domain.Membership;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface MembershipRepository extends JpaRepository<Membership, UUID> {

    /**
     * Login-time lookup — runs BEFORE a tenant is bound, so it cannot rely on
     * the tenant filter (which isn't armed yet) and must be explicit.
     * This is intentionally the only tenant-crossing query in the system.
     */
    @Query("select m from Membership m where m.userId = :userId and m.status = 'ACTIVE' and m.deletedAt is null")
    List<Membership> findActiveByUserId(@Param("userId") UUID userId);
}
