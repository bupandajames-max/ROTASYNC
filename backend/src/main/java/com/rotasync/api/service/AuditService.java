package com.rotasync.api.service;

import com.rotasync.api.domain.AuditLog;
import com.rotasync.api.repository.AuditLogRepository;
import com.rotasync.api.tenancy.TenantContext;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;

@Service
@Transactional
public class AuditService {

    private final AuditLogRepository auditLogRepository;

    public AuditService(AuditLogRepository auditLogRepository) {
        this.auditLogRepository = auditLogRepository;
    }

    /** Records an action for the current tenant/actor. Call inside the same transaction as the change. */
    public void record(String action, String entityType, String entityId, Map<String, Object> detail) {
        TenantContext.Principal caller = TenantContext.require();
        AuditLog entry = new AuditLog();
        entry.setTenantId(caller.tenantId());
        entry.setActorUserId(caller.userId());
        entry.setAction(action);
        entry.setEntityType(entityType);
        entry.setEntityId(entityId);
        entry.setDetail(detail);
        auditLogRepository.save(entry);
    }

    @Transactional(readOnly = true)
    public List<AuditLog> recent(int limit) {
        return auditLogRepository.findByTenantIdOrderByCreatedAtDesc(
                TenantContext.requireTenantId(),
                PageRequest.of(0, Math.min(Math.max(limit, 1), 500)));
    }
}
