package com.rotasync.api.service;

import com.rotasync.api.domain.Organization;
import com.rotasync.api.repository.OrganizationRepository;
import com.rotasync.api.tenancy.TenantBinder;
import jakarta.persistence.EntityNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/**
 * Platform-owner console. Cross-tenant BY DESIGN, which is why every method
 * runs under the RLS bypass — access is gated at the controller with
 * ROLE_SYSTEM_OWNER (a flag on app_users, never grantable via invites).
 * Exposes org-level metadata only, never operational tenant data.
 */
@Service
@Transactional
public class SysConsoleService {

    private final OrganizationRepository organizations;
    private final TenantBinder binder;

    public SysConsoleService(OrganizationRepository organizations, TenantBinder binder) {
        this.organizations = organizations;
        this.binder = binder;
    }

    @Transactional(readOnly = true)
    public List<Organization> listOrganizations() {
        binder.bypassRlsForCurrentTransaction();
        return organizations.findAllByOrderByCreatedAtDesc();
    }

    /** Undo an org soft-delete within the recovery window. */
    public Organization restoreOrganization(UUID orgId) {
        binder.bypassRlsForCurrentTransaction();
        Organization org = organizations.findOneById(orgId)
                .orElseThrow(() -> new EntityNotFoundException("Organization not found"));
        if (!org.isDeleted()) {
            throw new IllegalStateException("Organization is not deleted");
        }
        org.setDeletedAt(null);
        return organizations.save(org);
    }
}
