package com.rotasync.api.web;

import com.rotasync.api.service.ExtraHoursService;
import com.rotasync.api.web.dto.ExtraHoursDtos.CreateExtraHoursRequest;
import com.rotasync.api.web.dto.ExtraHoursDtos.ExtraHoursResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
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
@RequestMapping("/api/v1/extra-hours")
public class ExtraHoursController {

    private final ExtraHoursService extraHoursService;

    public ExtraHoursController(ExtraHoursService extraHoursService) {
        this.extraHoursService = extraHoursService;
    }

    /** Manager+: any/all; Member: own only (service-scoped; staffId param ignored for members). */
    @GetMapping
    @PreAuthorize("hasAnyRole('MEMBER','MANAGER','ORG_ADMIN')")
    public List<ExtraHoursResponse> list(@RequestParam(required = false) UUID staffId) {
        return extraHoursService.list(staffId).stream()
                .map(ExtraHoursResponse::from)
                .toList();
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('MEMBER','MANAGER','ORG_ADMIN')")
    @ResponseStatus(HttpStatus.CREATED)
    public ExtraHoursResponse create(@Valid @RequestBody CreateExtraHoursRequest request) {
        return ExtraHoursResponse.from(extraHoursService.create(request));
    }

    @PostMapping("/{id}/approve")
    @PreAuthorize("hasAnyRole('MANAGER','ORG_ADMIN')")
    public ExtraHoursResponse approve(@PathVariable UUID id) {
        return ExtraHoursResponse.from(extraHoursService.approve(id));
    }

    @PostMapping("/{id}/reject")
    @PreAuthorize("hasAnyRole('MANAGER','ORG_ADMIN')")
    public ExtraHoursResponse reject(@PathVariable UUID id) {
        return ExtraHoursResponse.from(extraHoursService.reject(id));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('MEMBER','MANAGER','ORG_ADMIN')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        extraHoursService.delete(id);
    }
}
