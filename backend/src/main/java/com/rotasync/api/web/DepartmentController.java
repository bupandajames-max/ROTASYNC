package com.rotasync.api.web;

import com.rotasync.api.service.DepartmentService;
import com.rotasync.api.web.dto.OrgDtos.DepartmentResponse;
import com.rotasync.api.web.dto.OrgDtos.UpsertDepartmentRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/departments")
public class DepartmentController {

    private final DepartmentService departmentService;

    public DepartmentController(DepartmentService departmentService) {
        this.departmentService = departmentService;
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('MANAGER','ORG_ADMIN')")
    public DepartmentResponse update(@PathVariable UUID id,
                                     @Valid @RequestBody UpsertDepartmentRequest request) {
        return DepartmentResponse.from(departmentService.update(id, request));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('MANAGER','ORG_ADMIN')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        departmentService.delete(id);
    }
}
