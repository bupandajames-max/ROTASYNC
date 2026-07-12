package com.rotasync.api.web;

import com.rotasync.api.service.InviteService;
import com.rotasync.api.web.dto.InviteDtos.AcceptInviteResponse;
import com.rotasync.api.web.dto.InviteDtos.CreateInviteRequest;
import com.rotasync.api.web.dto.InviteDtos.InviteResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/invites")
public class InviteController {

    private final InviteService inviteService;

    public InviteController(InviteService inviteService) {
        this.inviteService = inviteService;
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('MANAGER','ORG_ADMIN')")
    public List<InviteResponse> list(@RequestParam(required = false) String status) {
        return inviteService.list(status).stream()
                .map(i -> InviteResponse.from(i, inviteService.shareMessage(i)))
                .toList();
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('MANAGER','ORG_ADMIN')")
    @ResponseStatus(HttpStatus.CREATED)
    public InviteResponse create(@Valid @RequestBody CreateInviteRequest request) {
        var invite = inviteService.create(request);
        return InviteResponse.from(invite, inviteService.shareMessage(invite));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('MANAGER','ORG_ADMIN')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void revoke(@PathVariable UUID id) {
        inviteService.revoke(id);
    }

    /** Invitee accepts — needs no membership yet, only a matching email. */
    @PostMapping("/{id}/accept")
    @PreAuthorize("isAuthenticated()")
    public AcceptInviteResponse accept(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return inviteService.accept(jwt, id);
    }
}
