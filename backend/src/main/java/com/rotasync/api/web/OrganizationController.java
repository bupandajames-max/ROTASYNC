package com.rotasync.api.web;

import com.rotasync.api.service.OrganizationService;
import com.rotasync.api.web.dto.OrgDtos.DeleteOrganizationRequest;
import com.rotasync.api.web.dto.OrgDtos.OrganizationResponse;
import com.rotasync.api.web.dto.OrgDtos.UpdateOrganizationRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/organization")
public class OrganizationController {

    private final OrganizationService organizationService;

    public OrganizationController(OrganizationService organizationService) {
        this.organizationService = organizationService;
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('MEMBER','MANAGER','ORG_ADMIN')")
    public OrganizationResponse get() {
        return OrganizationResponse.from(organizationService.current());
    }

    @PutMapping
    @PreAuthorize("hasRole('ORG_ADMIN')")
    public OrganizationResponse rename(@Valid @RequestBody UpdateOrganizationRequest request) {
        return OrganizationResponse.from(organizationService.rename(request.name()));
    }

    @DeleteMapping
    @PreAuthorize("hasRole('ORG_ADMIN')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@Valid @RequestBody DeleteOrganizationRequest request) {
        organizationService.softDelete(request.confirm());
    }
}
