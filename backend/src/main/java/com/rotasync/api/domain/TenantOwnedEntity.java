package com.rotasync.api.domain;

import com.rotasync.api.tenancy.TenantEntityListener;
import jakarta.persistence.Column;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.MappedSuperclass;
import org.hibernate.annotations.Filter;
import org.hibernate.annotations.FilterDef;
import org.hibernate.annotations.ParamDef;

import java.time.Instant;
import java.util.UUID;

/**
 * Base class for every tenant-owned entity.
 *
 * Layer 1 of isolation: the Hibernate filter appends
 * "tenant_id = :tenantId" to every JPA query against subclasses
 * (enabled per-transaction by {@link com.rotasync.api.tenancy.TenantTransactionAspect}).
 *
 * Layer 2: {@link TenantEntityListener} stamps tenant_id on insert and
 * refuses updates/deletes whose tenant_id doesn't match the caller.
 *
 * Layer 3: PostgreSQL row-level security (V2 migration) enforces the same
 * predicate inside the database, covering native queries and future bugs.
 */
@MappedSuperclass
@EntityListeners(TenantEntityListener.class)
@FilterDef(name = TenantOwnedEntity.TENANT_FILTER,
           parameters = @ParamDef(name = "tenantId", type = UUID.class))
@Filter(name = TenantOwnedEntity.TENANT_FILTER, condition = "tenant_id = :tenantId")
public abstract class TenantOwnedEntity {

    public static final String TENANT_FILTER = "tenantFilter";

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "tenant_id", nullable = false, updatable = false)
    private UUID tenantId;

    @Column(name = "created_at", nullable = false, updatable = false, insertable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false, insertable = false, updatable = false)
    private Instant updatedAt;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public UUID getTenantId() { return tenantId; }
    public void setTenantId(UUID tenantId) { this.tenantId = tenantId; }

    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }

    public Instant getDeletedAt() { return deletedAt; }
    public void setDeletedAt(Instant deletedAt) { this.deletedAt = deletedAt; }

    public boolean isDeleted() { return deletedAt != null; }
}
