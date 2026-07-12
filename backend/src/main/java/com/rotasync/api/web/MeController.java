package com.rotasync.api.web;

import com.rotasync.api.service.MeService;
import com.rotasync.api.web.dto.MeDtos.MeResponse;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/me")
public class MeController {

    private final MeService meService;

    public MeController(MeService meService) {
        this.meService = meService;
    }

    /** The SPA's hydration entry point; also provisions the user row on first sign-in. */
    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public MeResponse me(@AuthenticationPrincipal Jwt jwt) {
        return meService.me(jwt);
    }
}
