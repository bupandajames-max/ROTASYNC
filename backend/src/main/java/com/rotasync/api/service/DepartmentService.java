package com.rotasync.api.service;

import com.rotasync.api.domain.Department;
import com.rotasync.api.repository.DepartmentRepository;
import com.rotasync.api.web.dto.OrgDtos.UpsertDepartmentRequest;
import jakarta.persistence.EntityNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
@Transactional
public class DepartmentService {

    private final DepartmentRepository departments;
    private final AuditService audit;

    public DepartmentService(DepartmentRepository departments, AuditService audit) {
        this.departments = departments;
        this.audit = audit;
    }

    @Transactional(readOnly = true)
    public List<Department> list(UUID facilityId) {
        return departments.findByFacilityIdAndDeletedAtIsNullOrderByCreatedAtAsc(facilityId);
    }

    public Department create(UUID facilityId, UpsertDepartmentRequest req) {
        departments.findByFacilityIdAndNameIgnoreCaseAndDeletedAtIsNull(facilityId, req.name().trim())
                .ifPresent(d -> { throw new IllegalStateException("A department with this name already exists"); });
        Department d = new Department();
        d.setFacilityId(facilityId);
        d.setName(req.name().trim());
        d.setDescription(req.description());
        Department saved = departments.save(d);
        audit.record("DEPARTMENT_CREATED", "department", saved.getId().toString(), null);
        return saved;
    }

    public Department update(UUID id, UpsertDepartmentRequest req) {
        Department d = get(id);
        d.setName(req.name().trim());
        d.setDescription(req.description());
        return departments.save(d);
    }

    public void delete(UUID id) {
        Department d = get(id);
        d.setDeletedAt(Instant.now());
        departments.save(d);
        audit.record("DEPARTMENT_DELETED", "department", id.toString(), null);
    }

    private Department get(UUID id) {
        return departments.findOneById(id)
                .filter(d -> !d.isDeleted())
                .orElseThrow(() -> new EntityNotFoundException("Department not found"));
    }
}
