package com.rotasync.api.web;

import com.rotasync.api.service.TimesheetService;
import com.rotasync.api.web.dto.TimesheetDtos.RejectRequest;
import com.rotasync.api.web.dto.TimesheetDtos.TimesheetResponse;
import com.rotasync.api.web.dto.TimesheetDtos.UpdateDaysRequest;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/timesheets")
public class TimesheetController {

    private final TimesheetService timesheetService;

    public TimesheetController(TimesheetService timesheetService) {
        this.timesheetService = timesheetService;
    }

    /** Manager+: all in cycle; Member: own only (service-scoped). */
    @GetMapping
    @PreAuthorize("hasAnyRole('MEMBER','MANAGER','ORG_ADMIN')")
    public List<TimesheetResponse> list(@RequestParam UUID cycleId) {
        return timesheetService.list(cycleId).stream()
                .map(TimesheetResponse::from)
                .toList();
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('MEMBER','MANAGER','ORG_ADMIN')")
    public TimesheetResponse get(@PathVariable UUID id) {
        return TimesheetResponse.from(timesheetService.get(id));
    }

    /** Owner only, DRAFT/REJECTED only. */
    @PutMapping("/{id}/days")
    @PreAuthorize("hasAnyRole('MEMBER','MANAGER','ORG_ADMIN')")
    public TimesheetResponse updateDays(@PathVariable UUID id,
                                        @Valid @RequestBody UpdateDaysRequest request) {
        return TimesheetResponse.from(timesheetService.updateDays(id, request.days()));
    }

    @PostMapping("/{id}/submit")
    @PreAuthorize("hasAnyRole('MEMBER','MANAGER','ORG_ADMIN')")
    public TimesheetResponse submit(@PathVariable UUID id) {
        return TimesheetResponse.from(timesheetService.submit(id));
    }

    @PostMapping("/{id}/approve")
    @PreAuthorize("hasAnyRole('MANAGER','ORG_ADMIN')")
    public TimesheetResponse approve(@PathVariable UUID id) {
        return TimesheetResponse.from(timesheetService.approve(id));
    }

    @PostMapping("/{id}/reject")
    @PreAuthorize("hasAnyRole('MANAGER','ORG_ADMIN')")
    public TimesheetResponse reject(@PathVariable UUID id,
                                    @Valid @RequestBody(required = false) RejectRequest request) {
        return TimesheetResponse.from(
                timesheetService.reject(id, request == null ? null : request.reason()));
    }
}
