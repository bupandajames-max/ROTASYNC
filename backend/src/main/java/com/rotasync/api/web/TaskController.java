package com.rotasync.api.web;

import com.rotasync.api.service.DailyTaskService;
import com.rotasync.api.web.dto.TaskDtos.GenerateTasksRequest;
import com.rotasync.api.web.dto.TaskDtos.TaskProgressRequest;
import com.rotasync.api.web.dto.TaskDtos.TaskResponse;
import com.rotasync.api.web.dto.TaskDtos.UpsertTaskRequest;
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

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/tasks")
public class TaskController {

    private final DailyTaskService taskService;

    public TaskController(DailyTaskService taskService) {
        this.taskService = taskService;
    }

    /** Members: own department + directly-assigned tasks only (service-scoped). */
    @GetMapping
    @PreAuthorize("hasAnyRole('MEMBER','MANAGER','ORG_ADMIN')")
    public List<TaskResponse> list(@RequestParam UUID facilityId,
                                   @RequestParam(required = false) LocalDate date) {
        return taskService.list(facilityId, date).stream().map(TaskResponse::from).toList();
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('MANAGER','ORG_ADMIN')")
    @ResponseStatus(HttpStatus.CREATED)
    public TaskResponse create(@Valid @RequestBody UpsertTaskRequest request) {
        return TaskResponse.from(taskService.create(request));
    }

    /** Full edit — Manager+. */
    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('MANAGER','ORG_ADMIN')")
    public TaskResponse update(@PathVariable UUID id,
                               @Valid @RequestBody UpsertTaskRequest request) {
        return TaskResponse.from(taskService.update(id, request));
    }

    /** Progress-only edit (status/notes/tracker/counter-sign) — assignee or same department. */
    @PatchMapping("/{id}/progress")
    @PreAuthorize("hasAnyRole('MEMBER','MANAGER','ORG_ADMIN')")
    public TaskResponse updateProgress(@PathVariable UUID id,
                                       @Valid @RequestBody TaskProgressRequest request) {
        return TaskResponse.from(taskService.updateProgress(id, request));
    }

    /** Server-side board generation from templates — idempotent per name+date. */
    @PostMapping("/generate")
    @PreAuthorize("hasAnyRole('MANAGER','ORG_ADMIN')")
    @ResponseStatus(HttpStatus.CREATED)
    public List<TaskResponse> generate(@Valid @RequestBody GenerateTasksRequest request) {
        return taskService.generate(request).stream().map(TaskResponse::from).toList();
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('MANAGER','ORG_ADMIN')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        taskService.delete(id);
    }
}
