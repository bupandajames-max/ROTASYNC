package com.rotasync.api.web;

import com.rotasync.api.service.DepartmentService;
import com.rotasync.api.service.FacilityService;
import com.rotasync.api.web.dto.OrgDtos.DepartmentResponse;
import com.rotasync.api.web.dto.OrgDtos.FacilityResponse;
import com.rotasync.api.web.dto.OrgDtos.UpsertDepartmentRequest;
import com.rotasync.api.web.dto.OrgDtos.UpsertFacilityRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/facilities")
public class FacilityController {

    private final FacilityService facilityService;
    private final DepartmentService departmentService;

    public FacilityController(FacilityService facilityService, DepartmentService departmentService) {
        this.facilityService = facilityService;
        this.departmentService = departmentService;
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('MEMBER','MANAGER','ORG_ADMIN')")
    public List<FacilityResponse> list() {
        return facilityService.list().stream().map(FacilityResponse::from).toList();
    }

    @PostMapping
    @PreAuthorize("hasRole('ORG_ADMIN')")
    @ResponseStatus(HttpStatus.CREATED)
    public FacilityResponse create(@Valid @RequestBody UpsertFacilityRequest request) {
        return FacilityResponse.from(facilityService.create(request));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('MANAGER','ORG_ADMIN')")
    public FacilityResponse update(@PathVariable UUID id,
                                   @Valid @RequestBody UpsertFacilityRequest request) {
        return FacilityResponse.from(facilityService.update(id, request));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ORG_ADMIN')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        facilityService.delete(id);
    }

    // ── Departments (nested under their facility, as in the API contract) ──

    @GetMapping("/{facilityId}/departments")
    @PreAuthorize("hasAnyRole('MEMBER','MANAGER','ORG_ADMIN')")
    public List<DepartmentResponse> listDepartments(@PathVariable UUID facilityId) {
        return departmentService.list(facilityId).stream().map(DepartmentResponse::from).toList();
    }

    @PostMapping("/{facilityId}/departments")
    @PreAuthorize("hasAnyRole('MANAGER','ORG_ADMIN')")
    @ResponseStatus(HttpStatus.CREATED)
    public DepartmentResponse createDepartment(@PathVariable UUID facilityId,
                                               @Valid @RequestBody UpsertDepartmentRequest request) {
        return DepartmentResponse.from(departmentService.create(facilityId, request));
    }
}
