package com.rotasync.api.repository;

import com.rotasync.api.domain.AppUser;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface AppUserRepository extends JpaRepository<AppUser, UUID> {
    Optional<AppUser> findByFirebaseUid(String firebaseUid);
    Optional<AppUser> findByEmailIgnoreCase(String email);
}
