package com.rotasync.api.web;

import com.rotasync.api.service.ApprovalService;
import com.rotasync.api.web.dto.ApprovalDtos.ApprovalResponse;
import com.rotasync.api.web.dto.ApprovalDtos.CreateApprovalRequest;
import com.rotasync.api.web.dto.ApprovalDtos.DecisionRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/approvals")
public class ApprovalController {

    private final ApprovalService approvalService;

    public ApprovalController(ApprovalService approvalService) {
        this.approvalService = approvalService;
    }

    /** Manager+: all; Member: own requests (service-scoped). */
    @GetMapping
    @PreAuthorize("hasAnyRole('MEMBER','MANAGER','ORG_ADMIN')")
    public List<ApprovalResponse> list() {
        return approvalService.list().stream().map(ApprovalResponse::from).toList();
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('MEMBER','MANAGER','ORG_ADMIN')")
    @ResponseStatus(HttpStatus.CREATED)
    public ApprovalResponse create(@Valid @RequestBody CreateApprovalRequest request) {
        return ApprovalResponse.from(approvalService.create(request));
    }

    @PostMapping("/{id}/approve")
    @PreAuthorize("hasAnyRole('MANAGER','ORG_ADMIN')")
    public ApprovalResponse approve(@PathVariable UUID id,
                                    @Valid @RequestBody(required = false) DecisionRequest request) {
        return ApprovalResponse.from(
                approvalService.approve(id, request == null ? null : request.note()));
    }

    @PostMapping("/{id}/reject")
    @PreAuthorize("hasAnyRole('MANAGER','ORG_ADMIN')")
    public ApprovalResponse reject(@PathVariable UUID id,
                                   @Valid @RequestBody(required = false) DecisionRequest request) {
        return ApprovalResponse.from(
                approvalService.reject(id, request == null ? null : request.note()));
    }

    /** Requester cancels their own PENDING request. */
    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('MEMBER','MANAGER','ORG_ADMIN')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void cancel(@PathVariable UUID id) {
        approvalService.cancel(id);
    }
}
