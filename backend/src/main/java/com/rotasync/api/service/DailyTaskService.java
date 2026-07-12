package com.rotasync.api.service;

import com.rotasync.api.domain.DailyTask;
import com.rotasync.api.domain.Staff;
import com.rotasync.api.repository.DailyTaskRepository;
import com.rotasync.api.tenancy.TenantContext;
import com.rotasync.api.web.dto.TaskDtos.GenerateTasksRequest;
import com.rotasync.api.web.dto.TaskDtos.TaskProgressRequest;
import com.rotasync.api.web.dto.TaskDtos.TaskTemplate;
import com.rotasync.api.web.dto.TaskDtos.UpsertTaskRequest;
import jakarta.persistence.EntityNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
@Transactional
public class DailyTaskService {

    private final DailyTaskRepository tasks;
    private final CallerStaffResolver callerStaff;
    private final AuditService audit;

    public DailyTaskService(DailyTaskRepository tasks, CallerStaffResolver callerStaff,
                            AuditService audit) {
        this.tasks = tasks;
        this.callerStaff = callerStaff;
        this.audit = audit;
    }

    /**
     * Members see only their own department's tasks (plus unassigned-department
     * tasks assigned directly to them) — mirrors the Firestore departmentId rules.
     */
    @Transactional(readOnly = true)
    public List<DailyTask> list(UUID facilityId, LocalDate date) {
        List<DailyTask> all = date == null
                ? tasks.findByFacilityIdAndDeletedAtIsNullOrderByTaskDateDescCreatedAtAsc(facilityId)
                : tasks.findByFacilityIdAndTaskDateAndDeletedAtIsNull(facilityId, date);
        TenantContext.Principal caller = TenantContext.require();
        if (caller.managerOrAbove()) {
            return all;
        }
        UUID dept = caller.departmentId();
        UUID ownStaffId = callerStaff.resolve().map(Staff::getId).orElse(null);
        return all.stream()
                .filter(t -> (dept != null && dept.equals(t.getDepartmentId()))
                        || (ownStaffId != null && ownStaffId.equals(t.getStaffId())))
                .toList();
    }

    public DailyTask create(UpsertTaskRequest req) {
        DailyTask t = new DailyTask();
        apply(t, req);
        DailyTask saved = tasks.save(t);
        audit.record("TASK_CREATED", "daily_task", saved.getId().toString(),
                Map.of("taskName", saved.getTaskName()));
        return saved;
    }

    /** Manager+ full edit. */
    public DailyTask update(UUID id, UpsertTaskRequest req) {
        DailyTask t = require(id);
        apply(t, req);
        return tasks.save(t);
    }

    /** Assignee-limited update: status, notes, tracker progress, counter-sign. */
    public DailyTask updateProgress(UUID id, TaskProgressRequest req) {
        DailyTask t = require(id);
        TenantContext.Principal caller = TenantContext.require();
        if (!caller.managerOrAbove()) {
            UUID ownStaffId = callerStaff.resolve().map(Staff::getId).orElse(null);
            boolean assignee = ownStaffId != null && ownStaffId.equals(t.getStaffId());
            boolean sameDept = caller.departmentId() != null
                    && caller.departmentId().equals(t.getDepartmentId());
            if (!assignee && !sameDept) {
                throw new EntityNotFoundException("Task not found");
            }
        }
        if (req.status() != null) {
            t.setStatus(req.status());
        }
        if (req.notes() != null) {
            t.setNotes(req.notes());
        }
        if (req.trackerValue() != null) {
            t.setTrackerValue(req.trackerValue());
        }
        if (req.counterSign() != null) {
            t.setCounterSign(req.counterSign());
        }
        return tasks.save(t);
    }

    /**
     * Board generation from templates (replaces the SPA's client-side
     * auto-scheduler). Idempotent: a template whose name already exists on
     * that date is skipped, so re-running never duplicates the board.
     */
    public List<DailyTask> generate(GenerateTasksRequest req) {
        List<DailyTask> created = new ArrayList<>();
        for (TaskTemplate tpl : req.templates()) {
            if (tasks.existsByFacilityIdAndTaskDateAndTaskNameIgnoreCaseAndDeletedAtIsNull(
                    req.facilityId(), req.date(), tpl.taskName().trim())) {
                continue;
            }
            DailyTask t = new DailyTask();
            t.setFacilityId(req.facilityId());
            t.setTaskDate(req.date());
            t.setTaskName(tpl.taskName().trim());
            t.setDepartmentId(tpl.departmentId());
            t.setStaffId(tpl.staffId());
            t.setPriority(tpl.priority() == null ? "NORMAL" : tpl.priority());
            t.setTrackerTarget(tpl.trackerTarget());
            created.add(tasks.save(t));
        }
        if (!created.isEmpty()) {
            audit.record("TASKS_GENERATED", "daily_task", null,
                    Map.of("date", req.date().toString(), "count", created.size()));
        }
        return created;
    }

    public void delete(UUID id) {
        DailyTask t = require(id);
        t.setDeletedAt(Instant.now());
        tasks.save(t);
    }

    private DailyTask require(UUID id) {
        return tasks.findOneById(id)
                .filter(t -> !t.isDeleted())
                .orElseThrow(() -> new EntityNotFoundException("Task not found"));
    }

    private void apply(DailyTask t, UpsertTaskRequest req) {
        t.setFacilityId(req.facilityId());
        t.setDepartmentId(req.departmentId());
        t.setStaffId(req.staffId());
        t.setTaskName(req.taskName().trim());
        t.setTaskDate(req.taskDate());
        if (req.status() != null) {
            t.setStatus(req.status());
        }
        t.setPriority(req.priority() == null ? "NORMAL" : req.priority());
        t.setNotes(req.notes());
        t.setTrackerValue(req.trackerValue());
        t.setTrackerTarget(req.trackerTarget());
    }
}
