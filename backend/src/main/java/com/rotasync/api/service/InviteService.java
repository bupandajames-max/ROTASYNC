package com.rotasync.api.service;

import com.rotasync.api.domain.AppUser;
import com.rotasync.api.domain.Facility;
import com.rotasync.api.domain.Invite;
import com.rotasync.api.domain.Membership;
import com.rotasync.api.domain.Organization;
import com.rotasync.api.repository.FacilityRepository;
import com.rotasync.api.repository.InviteRepository;
import com.rotasync.api.repository.MembershipRepository;
import com.rotasync.api.repository.OrganizationRepository;
import com.rotasync.api.repository.StaffRepository;
import com.rotasync.api.tenancy.TenantBinder;
import com.rotasync.api.tenancy.TenantContext;
import com.rotasync.api.web.dto.InviteDtos.AcceptInviteResponse;
import com.rotasync.api.web.dto.InviteDtos.CreateInviteRequest;
import jakarta.persistence.EntityNotFoundException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
@Transactional
public class InviteService {

    private final InviteRepository invites;
    private final MembershipRepository memberships;
    private final StaffRepository staffRepository;
    private final OrganizationRepository organizations;
    private final FacilityRepository facilities;
    private final MeService meService;
    private final TenantBinder binder;
    private final AuditService audit;

    public InviteService(InviteRepository invites, MembershipRepository memberships,
                         StaffRepository staffRepository, OrganizationRepository organizations,
                         FacilityRepository facilities,
                         MeService meService, TenantBinder binder, AuditService audit) {
        this.invites = invites;
        this.memberships = memberships;
        this.staffRepository = staffRepository;
        this.organizations = organizations;
        this.facilities = facilities;
        this.meService = meService;
        this.binder = binder;
        this.audit = audit;
    }

    @Transactional(readOnly = true)
    public List<Invite> list(String status) {
        return status == null
                ? invites.findByDeletedAtIsNullOrderByCreatedAtDesc()
                : invites.findByStatusAndDeletedAtIsNullOrderByCreatedAtDesc(status);
    }

    public Invite create(CreateInviteRequest req) {
        TenantContext.Principal caller = TenantContext.require();
        // Only an org admin can mint another org admin
        if (Membership.ROLE_ORG_ADMIN.equals(req.role()) && !Membership.ROLE_ORG_ADMIN.equals(caller.role())) {
            throw new AccessDeniedException("Only an organization admin can invite another admin");
        }
        Invite invite = new Invite();
        invite.setEmail(req.email().toLowerCase().trim());
        invite.setRole(req.role());
        invite.setFacilityId(req.facilityId());
        invite.setDepartmentId(req.departmentId());
        invite.setInvitedBy(caller.userId());
        invite.setExpiresAt(Instant.now().plus(14, ChronoUnit.DAYS));
        Invite saved = invites.save(invite);
        audit.record("INVITE_CREATED", "invite", saved.getId().toString(),
                Map.of("email", saved.getEmail(), "role", saved.getRole()));
        return saved;
    }

    /** Copy-paste message for WhatsApp/SMS — same delivery model the app uses today. */
    @Transactional(readOnly = true)
    public String shareMessage(Invite invite) {
        String orgName = organizations.findOneById(invite.getTenantId())
                .map(Organization::getName).orElse("your organization");
        String facilityName = facilities.findOneById(invite.getFacilityId())
                .map(Facility::getName).orElse("");
        return "You've been invited to join " + orgName
                + (facilityName.isEmpty() ? "" : " (" + facilityName + ")")
                + " on RotaSync as " + invite.getRole()
                + ". Sign in with this email address to accept: " + invite.getEmail();
    }

    public void revoke(UUID inviteId) {
        Invite invite = invites.findOneById(inviteId)
                .filter(i -> !i.isDeleted())
                .orElseThrow(() -> new EntityNotFoundException("Invite not found"));
        if (!Invite.STATUS_PENDING.equals(invite.getStatus())) {
            throw new IllegalStateException("Only pending invites can be revoked");
        }
        invite.setStatus(Invite.STATUS_REVOKED);
        invites.save(invite);
        audit.record("INVITE_REVOKED", "invite", inviteId.toString(), null);
    }

    /**
     * Invite acceptance — sanctioned RLS-bypass path: the caller has no tenant
     * yet, and the tenant to join comes FROM the invite. Email match against
     * the authenticated token is the security boundary.
     */
    public AcceptInviteResponse accept(Jwt jwt, UUID inviteId) {
        AppUser user = meService.ensureUser(jwt);

        binder.bypassRlsForCurrentTransaction();
        Invite invite = invites.findOneById(inviteId)
                .filter(i -> !i.isDeleted())
                .orElseThrow(() -> new EntityNotFoundException("Invite not found"));

        if (!invite.getEmail().equalsIgnoreCase(user.getEmail())) {
            // 404, not 403: an invite's existence shouldn't leak to other users
            throw new EntityNotFoundException("Invite not found");
        }
        if (!Invite.STATUS_PENDING.equals(invite.getStatus())) {
            throw new IllegalStateException("This invite is no longer open");
        }
        if (invite.getExpiresAt() != null && invite.getExpiresAt().isBefore(Instant.now())) {
            invite.setStatus(Invite.STATUS_EXPIRED);
            invites.save(invite);
            throw new IllegalStateException("This invite has expired");
        }
        if (!memberships.findActiveByUserId(user.getId()).isEmpty()) {
            throw new IllegalStateException("You already belong to an organization");
        }

        // Join the invite's tenant for the rest of the transaction
        TenantContext.set(new TenantContext.Principal(
                user.getId(), user.getEmail(), invite.getTenantId(),
                invite.getFacilityId(), invite.getDepartmentId(), invite.getRole(),
                user.isSystemOwner()));
        binder.bindTenantForCurrentTransaction(invite.getTenantId());

        Membership membership = new Membership();
        membership.setUserId(user.getId());
        membership.setFacilityId(invite.getFacilityId());
        membership.setDepartmentId(invite.getDepartmentId());
        membership.setRole(invite.getRole());
        memberships.save(membership);

        // Link the pre-created staff record (if the manager added one by email)
        staffRepository.findFirstByEmailIgnoreCaseAndDeletedAtIsNull(user.getEmail())
                .ifPresent(staff -> {
                    staff.setUserId(user.getId());
                    if (staff.getDepartmentId() == null && invite.getDepartmentId() != null) {
                        staff.setDepartmentId(invite.getDepartmentId());
                    }
                    staffRepository.save(staff);
                });

        invite.setStatus(Invite.STATUS_ACCEPTED);
        invites.save(invite);
        audit.record("INVITE_ACCEPTED", "invite", inviteId.toString(),
                Map.of("userId", user.getId().toString()));

        return new AcceptInviteResponse(invite.getTenantId(), invite.getFacilityId(), invite.getRole());
    }
}
