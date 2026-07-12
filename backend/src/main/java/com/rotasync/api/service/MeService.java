package com.rotasync.api.service;

import com.rotasync.api.domain.AppUser;
import com.rotasync.api.domain.Facility;
import com.rotasync.api.domain.Invite;
import com.rotasync.api.domain.Organization;
import com.rotasync.api.repository.AppUserRepository;
import com.rotasync.api.repository.FacilityRepository;
import com.rotasync.api.repository.InviteRepository;
import com.rotasync.api.repository.OrganizationRepository;
import com.rotasync.api.tenancy.TenantBinder;
import com.rotasync.api.tenancy.TenantContext;
import com.rotasync.api.web.dto.MeDtos.MeResponse;
import com.rotasync.api.web.dto.MeDtos.MembershipView;
import com.rotasync.api.web.dto.MeDtos.PendingInviteView;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class MeService {

    private final AppUserRepository users;
    private final OrganizationRepository organizations;
    private final FacilityRepository facilities;
    private final InviteRepository invites;
    private final TenantBinder binder;

    public MeService(AppUserRepository users, OrganizationRepository organizations,
                     FacilityRepository facilities, InviteRepository invites, TenantBinder binder) {
        this.users = users;
        this.organizations = organizations;
        this.facilities = facilities;
        this.invites = invites;
        this.binder = binder;
    }

    /**
     * The SPA's hydration entry point. Also auto-provisions the app_users row
     * on first sign-in (identity data only — no tenant access is granted here).
     */
    public MeResponse me(Jwt jwt) {
        AppUser user = ensureUser(jwt);
        TenantContext.Principal caller = TenantContext.get();

        MembershipView membershipView = null;
        if (caller != null && caller.tenantId() != null) {
            String orgName = organizations.findOneById(caller.tenantId())
                    .map(Organization::getName).orElse("");
            membershipView = new MembershipView(caller.tenantId(), orgName,
                    caller.facilityId(), caller.departmentId(), caller.role());
        }

        PendingInviteView inviteView = null;
        if (membershipView == null) {
            // Cross-tenant by necessity: a user with no membership yet must be
            // able to see the invite waiting for THEIR OWN email.
            binder.bypassRlsForCurrentTransaction();
            Invite pending = invites.findFirstByEmailIgnoreCaseAndStatusOrderByCreatedAtDesc(
                    user.getEmail(), Invite.STATUS_PENDING).orElse(null);
            if (pending != null) {
                String orgName = organizations.findOneById(pending.getTenantId())
                        .map(Organization::getName).orElse("");
                String facilityName = facilities.findOneById(pending.getFacilityId())
                        .map(Facility::getName).orElse("");
                inviteView = new PendingInviteView(pending.getId(), orgName, facilityName, pending.getRole());
            }
        }

        return new MeResponse(user.getId(), user.getEmail(), user.getDisplayName(),
                user.isSystemOwner(), membershipView, inviteView);
    }

    AppUser ensureUser(Jwt jwt) {
        String uid = jwt.getSubject();
        String email = jwt.getClaimAsString("email");
        String name = jwt.getClaimAsString("name");
        return users.findByFirebaseUid(uid)
                .or(() -> email == null ? java.util.Optional.empty() : users.findByEmailIgnoreCase(email))
                .map(existing -> {
                    boolean dirty = false;
                    if (existing.getFirebaseUid() == null) { existing.setFirebaseUid(uid); dirty = true; }
                    if (name != null && !name.equals(existing.getDisplayName())) { existing.setDisplayName(name); dirty = true; }
                    return dirty ? users.save(existing) : existing;
                })
                .orElseGet(() -> {
                    if (email == null) {
                        throw new IllegalArgumentException("Token has no email claim");
                    }
                    AppUser u = new AppUser();
                    u.setFirebaseUid(uid);
                    u.setEmail(email.toLowerCase().trim());
                    u.setDisplayName(name);
                    return users.save(u);
                });
    }
}
