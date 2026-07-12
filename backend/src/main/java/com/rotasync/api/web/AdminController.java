package com.rotasync.api.web;

import com.rotasync.api.service.AdminService;
import com.rotasync.api.service.AuditService;
import com.rotasync.api.web.dto.AdminDtos.AuditEntryResponse;
import com.rotasync.api.web.dto.AdminDtos.FactoryResetRequest;
import com.rotasync.api.web.dto.AdminDtos.FactoryResetResponse;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/admin")
public class AdminController {

    private final AdminService adminService;
    private final AuditService auditService;

    public AdminController(AdminService adminService, AuditService auditService) {
        this.adminService = adminService;
        this.auditService = auditService;
    }

    /** Body must echo the exact organization name — deliberate friction. */
    @PostMapping("/factory-reset")
    @PreAuthorize("hasRole('ORG_ADMIN')")
    public FactoryResetResponse factoryReset(@Valid @RequestBody FactoryResetRequest request) {
        return adminService.factoryReset(request);
    }

    @GetMapping("/audit")
    @PreAuthorize("hasRole('ORG_ADMIN')")
    public List<AuditEntryResponse> audit(@RequestParam(defaultValue = "100") int limit) {
        return auditService.recent(limit).stream().map(AuditEntryResponse::from).toList();
    }
}
