package com.rotasync.api.repository;

import com.rotasync.api.domain.Invite;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface InviteRepository extends JpaRepository<Invite, UUID> {
    Optional<Invite> findOneById(UUID id);
    List<Invite> findByStatusAndDeletedAtIsNullOrderByCreatedAtDesc(String status);
    List<Invite> findByDeletedAtIsNullOrderByCreatedAtDesc();
    // Cross-tenant by design: pending-invite lookup for a signing-in user.
    // Callers MUST run under TenantBinder.bypassRlsForCurrentTransaction()
    // and only ever pass the authenticated caller's own email.
    Optional<Invite> findFirstByEmailIgnoreCaseAndStatusOrderByCreatedAtDesc(String email, String status);
}
