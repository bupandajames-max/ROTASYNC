package com.rotasync.api.web;

import com.rotasync.api.service.RosterService;
import com.rotasync.api.web.dto.RosterDtos.CreateCycleRequest;
import com.rotasync.api.web.dto.RosterDtos.CreateSnapshotRequest;
import com.rotasync.api.web.dto.RosterDtos.CycleResponse;
import com.rotasync.api.web.dto.RosterDtos.CycleSummaryResponse;
import com.rotasync.api.web.dto.RosterDtos.PatchCycleRequest;
import com.rotasync.api.web.dto.RosterDtos.SnapshotResponse;
import com.rotasync.api.web.dto.RosterDtos.SnapshotSummaryResponse;
import com.rotasync.api.web.dto.RosterDtos.UpdateAssignmentsRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
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

@RestController
@RequestMapping("/api/v1")
public class RosterController {

    private final RosterService rosterService;

    public RosterController(RosterService rosterService) {
        this.rosterService = rosterService;
    }

    // ── Cycles ───────────────────────────────────────────────────────────

    @GetMapping("/cycles")
    @PreAuthorize("hasAnyRole('MEMBER','MANAGER','ORG_ADMIN')")
    public List<CycleSummaryResponse> list(@RequestParam UUID facilityId) {
        return rosterService.list(facilityId).stream()
                .map(CycleSummaryResponse::from)
                .toList();
    }

    /** Members receive only their own department's assignments (service-scoped). */
    @GetMapping("/cycles/{id}")
    @PreAuthorize("hasAnyRole('MEMBER','MANAGER','ORG_ADMIN')")
    public CycleResponse get(@PathVariable UUID id) {
        return rosterService.get(id);
    }

    @PostMapping("/cycles")
    @PreAuthorize("hasAnyRole('MANAGER','ORG_ADMIN')")
    @ResponseStatus(HttpStatus.CREATED)
    public CycleResponse create(@Valid @RequestBody CreateCycleRequest request) {
        return rosterService.create(request);
    }

    @PutMapping("/cycles/{id}/assignments")
    @PreAuthorize("hasAnyRole('MANAGER','ORG_ADMIN')")
    public CycleResponse updateAssignments(@PathVariable UUID id,
                                           @Valid @RequestBody UpdateAssignmentsRequest request) {
        return rosterService.updateAssignments(id, request.assignments());
    }

    @PatchMapping("/cycles/{id}")
    @PreAuthorize("hasAnyRole('MANAGER','ORG_ADMIN')")
    public CycleResponse patch(@PathVariable UUID id, @RequestBody PatchCycleRequest request) {
        return rosterService.patch(id, request);
    }

    @DeleteMapping("/cycles/{id}")
    @PreAuthorize("hasAnyRole('MANAGER','ORG_ADMIN')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        rosterService.delete(id);
    }

    // ── Snapshots ────────────────────────────────────────────────────────

    @GetMapping("/cycles/{id}/snapshots")
    @PreAuthorize("hasAnyRole('MANAGER','ORG_ADMIN')")
    public List<SnapshotSummaryResponse> listSnapshots(@PathVariable UUID id) {
        return rosterService.listSnapshots(id).stream()
                .map(SnapshotSummaryResponse::from)
                .toList();
    }

    @PostMapping("/cycles/{id}/snapshots")
    @PreAuthorize("hasAnyRole('MANAGER','ORG_ADMIN')")
    @ResponseStatus(HttpStatus.CREATED)
    public SnapshotSummaryResponse createSnapshot(@PathVariable UUID id,
                                                  @Valid @RequestBody CreateSnapshotRequest request) {
        return SnapshotSummaryResponse.from(rosterService.createSnapshot(id, request));
    }

    @GetMapping("/snapshots/{id}")
    @PreAuthorize("hasAnyRole('MANAGER','ORG_ADMIN')")
    public SnapshotResponse getSnapshot(@PathVariable UUID id) {
        return SnapshotResponse.from(rosterService.getSnapshot(id));
    }

    @DeleteMapping("/snapshots/{id}")
    @PreAuthorize("hasAnyRole('MANAGER','ORG_ADMIN')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteSnapshot(@PathVariable UUID id) {
        rosterService.deleteSnapshot(id);
    }
}
