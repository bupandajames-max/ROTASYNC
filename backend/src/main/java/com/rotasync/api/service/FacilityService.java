package com.rotasync.api.service;

import com.rotasync.api.domain.Facility;
import com.rotasync.api.repository.FacilityRepository;
import com.rotasync.api.web.dto.OrgDtos.UpsertFacilityRequest;
import jakarta.persistence.EntityNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
@Transactional
public class FacilityService {

    private final FacilityRepository facilities;
    private final AuditService audit;

    public FacilityService(FacilityRepository facilities, AuditService audit) {
        this.facilities = facilities;
        this.audit = audit;
    }

    @Transactional(readOnly = true)
    public List<Facility> list() {
        return facilities.findByDeletedAtIsNullOrderByCreatedAtAsc();
    }

    @Transactional(readOnly = true)
    public Facility get(UUID id) {
        return facilities.findOneById(id)
                .filter(f -> !f.isDeleted())
                .orElseThrow(() -> new EntityNotFoundException("Facility not found"));
    }

    public Facility create(UpsertFacilityRequest req) {
        Facility f = new Facility();
        apply(f, req);
        Facility saved = facilities.save(f);
        audit.record("FACILITY_CREATED", "facility", saved.getId().toString(), null);
        return saved;
    }

    public Facility update(UUID id, UpsertFacilityRequest req) {
        Facility f = get(id);
        apply(f, req);
        return facilities.save(f);
    }

    public void delete(UUID id) {
        Facility f = get(id);
        f.setDeletedAt(Instant.now());
        facilities.save(f);
        audit.record("FACILITY_DELETED", "facility", id.toString(), null);
    }

    private void apply(Facility f, UpsertFacilityRequest req) {
        f.setName(req.name());
        f.setLocation(req.location() == null ? "" : req.location());
        f.setFacilityType(req.facilityType() == null ? "Branch" : req.facilityType());
        f.setLeadManager(req.leadManager());
        f.setTimezoneLabel(req.timezoneLabel());
    }
}
