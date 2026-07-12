package com.rotasync.api.service;

import com.rotasync.api.domain.Organization;
import com.rotasync.api.repository.OrganizationRepository;
import com.rotasync.api.tenancy.TenantContext;
import jakarta.persistence.EntityNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Map;

@Service
@Transactional
public class OrganizationService {

    private final OrganizationRepository organizations;
    private final AuditService audit;

    public OrganizationService(OrganizationRepository organizations, AuditService audit) {
        this.organizations = organizations;
        this.audit = audit;
    }

    @Transactional(readOnly = true)
    public Organization current() {
        return organizations.findOneById(TenantContext.requireTenantId())
                .filter(o -> !o.isDeleted())
                .orElseThrow(() -> new EntityNotFoundException("Organization not found"));
    }

    public Organization rename(String name) {
        Organization org = current();
        String old = org.getName();
        org.setName(name.trim());
        audit.record("ORG_RENAMED", "organization", org.getId().toString(),
                Map.of("from", old, "to", org.getName()));
        return organizations.save(org);
    }

    /** Soft delete with a recovery window; system owner can restore. */
    public void softDelete(String confirmName) {
        Organization org = current();
        if (!org.getName().equalsIgnoreCase(confirmName == null ? "" : confirmName.trim())) {
            throw new IllegalArgumentException("Confirmation text must exactly match the organization name");
        }
        org.setDeletedAt(Instant.now());
        organizations.save(org);
        audit.record("ORG_DELETED", "organization", org.getId().toString(), null);
    }
}
