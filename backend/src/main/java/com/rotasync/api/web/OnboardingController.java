package com.rotasync.api.web;

import com.rotasync.api.service.OnboardingService;
import com.rotasync.api.web.dto.OnboardingDtos.CreateOrganizationRequest;
import com.rotasync.api.web.dto.OnboardingDtos.CreateOrganizationResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/onboarding")
public class OnboardingController {

    private final OnboardingService onboardingService;

    public OnboardingController(OnboardingService onboardingService) {
        this.onboardingService = onboardingService;
    }

    /** Any authenticated user with no existing membership can found an organization. */
    @PostMapping("/organization")
    @PreAuthorize("isAuthenticated()")
    @ResponseStatus(HttpStatus.CREATED)
    public CreateOrganizationResponse createOrganization(@AuthenticationPrincipal Jwt jwt,
                                                         @Valid @RequestBody CreateOrganizationRequest request) {
        return onboardingService.createOrganization(jwt, request);
    }
}
