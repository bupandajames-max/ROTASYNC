package com.rotasync.api.web;

import com.rotasync.api.service.SysConsoleService;
import com.rotasync.api.web.dto.AdminDtos.SysOrganizationResponse;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/**
 * Platform-owner console. ROLE_SYSTEM_OWNER comes from the app_users flag —
 * it can never be granted through invites or memberships.
 */
@RestController
@RequestMapping("/api/v1/sys")
public class SysController {

    private final SysConsoleService sysConsoleService;

    public SysController(SysConsoleService sysConsoleService) {
        this.sysConsoleService = sysConsoleService;
    }

    @GetMapping("/organizations")
    @PreAuthorize("hasRole('SYSTEM_OWNER')")
    public List<SysOrganizationResponse> organizations() {
        return sysConsoleService.listOrganizations().stream()
                .map(SysOrganizationResponse::from)
                .toList();
    }

    @PostMapping("/organizations/{id}/restore")
    @PreAuthorize("hasRole('SYSTEM_OWNER')")
    public SysOrganizationResponse restore(@PathVariable UUID id) {
        return SysOrganizationResponse.from(sysConsoleService.restoreOrganization(id));
    }
}
