package com.rotasync.api.tenancy;

import com.rotasync.api.domain.TenantOwnedEntity;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.hibernate.Session;
import org.springframework.stereotype.Component;

import java.util.UUID;

/**
 * Manual arming of the isolation layers for the few flows where the tenant is
 * NOT known at request start (so TenantTransactionAspect couldn't arm them):
 *
 *  - onboarding: the organization row is created inside the transaction;
 *  - invite acceptance: the tenant comes from the invite being accepted;
 *  - login-time membership lookup: runs before any tenant exists.
 *
 * bypassRlsForCurrentTransaction() is the ONLY sanctioned way around RLS.
 * It is transaction-local (set_config 3rd arg = true), so it can never leak
 * through the connection pool, and every call site must be a code path that
 * either predates tenant existence or is guarded by SYSTEM_OWNER.
 */
@Component
public class TenantBinder {

    @PersistenceContext
    private EntityManager entityManager;

    /** Arms the Hibernate filter + RLS binding mid-transaction. */
    public void bindTenantForCurrentTransaction(UUID tenantId) {
        Session session = entityManager.unwrap(Session.class);
        session.enableFilter(TenantOwnedEntity.TENANT_FILTER)
               .setParameter("tenantId", tenantId);
        session.doWork(connection -> {
            try (var ps = connection.prepareStatement(
                    "SELECT set_config('app.tenant_id', ?, true)")) {
                ps.setString(1, tenantId.toString());
                ps.execute();
            }
        });
    }

    public void bypassRlsForCurrentTransaction() {
        Session session = entityManager.unwrap(Session.class);
        session.doWork(connection -> {
            try (var st = connection.createStatement()) {
                st.execute("SELECT set_config('app.bypass_rls', 'on', true)");
            }
        });
    }
}
