package com.rotasync.api.tenancy;

import com.rotasync.api.domain.TenantOwnedEntity;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreRemove;
import jakarta.persistence.PreUpdate;

import java.util.UUID;

/**
 * JPA-level tenant guard (layer 2 of 3):
 *  - INSERT: stamps the caller's tenant id; refuses to persist an entity
 *    already stamped for a different tenant.
 *  - UPDATE/DELETE: refuses if the loaded entity's tenant differs from the
 *    caller's. This catches "load by id, mutate, save" paths where the
 *    query filter alone wouldn't help (e.g. em.getReference()).
 */
public class TenantEntityListener {

    @PrePersist
    public void onPersist(TenantOwnedEntity entity) {
        UUID current = TenantContext.requireTenantId();
        if (entity.getTenantId() == null) {
            entity.setTenantId(current);
        } else if (!current.equals(entity.getTenantId())) {
            throw new TenantViolationException(
                    "Attempt to persist an entity for another tenant");
        }
    }

    @PreUpdate
    public void onUpdate(TenantOwnedEntity entity) {
        verify(entity, "update");
    }

    @PreRemove
    public void onRemove(TenantOwnedEntity entity) {
        verify(entity, "delete");
    }

    private void verify(TenantOwnedEntity entity, String op) {
        UUID current = TenantContext.requireTenantId();
        if (!current.equals(entity.getTenantId())) {
            throw new TenantViolationException(
                    "Attempt to " + op + " an entity belonging to another tenant");
        }
    }
}
