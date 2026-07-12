package com.rotasync.api.tenancy;

import com.rotasync.api.domain.TenantOwnedEntity;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.aspectj.lang.JoinPoint;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.annotation.Before;
import org.hibernate.Session;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.UUID;

/**
 * Arms both query-time isolation layers at the start of every service call:
 *
 *  1. Enables the Hibernate tenant filter on the current Session so all JPA
 *     queries carry "AND tenant_id = :tenantId".
 *  2. Runs `set_config('app.tenant_id', ..., true)` so PostgreSQL RLS
 *     policies apply for the remainder of the transaction (transaction-local:
 *     pooled connections cannot leak it).
 *
 * Services are the transaction boundary (@Transactional), so pointcutting
 * them guarantees an active session/connection to arm. Calls with no tenant
 * in context (login/onboarding) skip arming — RLS then denies everything
 * tenant-owned, which is the correct fail-closed default.
 */
@Aspect
@Order(100)  // transaction advisor is order 0 (JpaConfig) -> we run inside the tx
@Component
public class TenantTransactionAspect {

    @PersistenceContext
    private EntityManager entityManager;

    @Before("execution(public * com.rotasync.api.service..*(..))")
    public void armTenantScoping(JoinPoint jp) {
        UUID tenantId = TenantContext.tenantIdOrNull();
        if (tenantId == null) {
            return;
        }
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
}
