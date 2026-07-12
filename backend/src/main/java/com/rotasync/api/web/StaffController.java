package com.rotasync.api.web;

import com.rotasync.api.service.StaffService;
import com.rotasync.api.web.dto.StaffDtos.StaffResponse;
import com.rotasync.api.web.dto.StaffDtos.UpsertStaffRequest;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/**
 * Reference controller. Auth model:
 *   - reads: any active member of the tenant (department scoping in service)
 *   - writes: MANAGER or ORG_ADMIN only
 * Tenant scoping never appears here — it's impossible to forget because it
 * lives in the persistence layer, not in each endpoint.
 */
@RestController
@RequestMapping("/api/v1/staff")
public class StaffController {

    private final StaffService staffService;

    public StaffController(StaffService staffService) {
        this.staffService = staffService;
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('MEMBER','MANAGER','ORG_ADMIN')")
    public List<StaffResponse> list(@RequestParam UUID facilityId) {
        return staffService.listForCaller(facilityId).stream()
                .map(StaffResponse::from)
                .toList();
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('MEMBER','MANAGER','ORG_ADMIN')")
    public StaffResponse get(@PathVariable UUID id) {
        return StaffResponse.from(staffService.get(id));
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('MANAGER','ORG_ADMIN')")
    @ResponseStatus(HttpStatus.CREATED)
    public StaffResponse create(@Valid @RequestBody UpsertStaffRequest request) {
        return StaffResponse.from(staffService.create(request));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('MANAGER','ORG_ADMIN')")
    public StaffResponse update(@PathVariable UUID id,
                                @Valid @RequestBody UpsertStaffRequest request) {
        return StaffResponse.from(staffService.update(id, request));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('MANAGER','ORG_ADMIN')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        staffService.delete(id);
    }
}
