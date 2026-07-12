package com.rotasync.api.security;

import com.rotasync.api.domain.AppUser;
import com.rotasync.api.domain.Membership;
import com.rotasync.api.repository.AppUserRepository;
import com.rotasync.api.repository.MembershipRepository;
import com.rotasync.api.tenancy.TenantContext;
import org.springframework.core.convert.converter.Converter;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Turns a verified JWT into (a) Spring authorities for @PreAuthorize checks
 * and (b) the request's TenantContext for data isolation.
 *
 * Resolution order:
 *   1. find AppUser by firebase uid (JWT "sub"), falling back to email —
 *      first sign-in after data migration links the uid to the migrated row;
 *   2. load their ACTIVE membership -> tenant + role;
 *   3. bind TenantContext (cleared by TenantContextCleanupFilter).
 *
 * A signed-in user with no membership yet is authenticated but tenant-less:
 * they can call onboarding/invite-acceptance endpoints and nothing else that
 * touches tenant data (RLS + requireTenantId() both fail closed).
 */
@Component
public class TenantAwareJwtConverter implements Converter<Jwt, AbstractAuthenticationToken> {

    private final AppUserRepository users;
    private final MembershipRepository memberships;
    private final com.rotasync.api.tenancy.TenantBinder binder;

    public TenantAwareJwtConverter(AppUserRepository users, MembershipRepository memberships,
                                   com.rotasync.api.tenancy.TenantBinder binder) {
        this.users = users;
        this.memberships = memberships;
        this.binder = binder;
    }

    @Override
    @Transactional(readOnly = true)
    public AbstractAuthenticationToken convert(Jwt jwt) {
        String uid = jwt.getSubject();
        String email = jwt.getClaimAsString("email");

        // The membership lookup runs before any tenant is bound, so RLS would
        // return zero rows. This read-only bypass is one of the three
        // sanctioned TenantBinder call sites (login, onboarding, invite accept).
        binder.bypassRlsForCurrentTransaction();

        Optional<AppUser> userOpt = users.findByFirebaseUid(uid)
                .or(() -> email == null ? Optional.empty() : users.findByEmailIgnoreCase(email));

        List<GrantedAuthority> authorities = new ArrayList<>();
        authorities.add(new SimpleGrantedAuthority("ROLE_AUTHENTICATED"));

        if (userOpt.isPresent()) {
            AppUser user = userOpt.get();
            if (user.isSystemOwner()) {
                authorities.add(new SimpleGrantedAuthority("ROLE_SYSTEM_OWNER"));
            }
            Membership m = memberships.findActiveByUserId(user.getId())
                    .stream().findFirst().orElse(null);
            if (m != null) {
                authorities.add(new SimpleGrantedAuthority("ROLE_" + m.getRole()));
                TenantContext.set(new TenantContext.Principal(
                        user.getId(), user.getEmail(), m.getTenantId(),
                        m.getFacilityId(), m.getDepartmentId(), m.getRole(),
                        user.isSystemOwner()));
            } else {
                TenantContext.set(new TenantContext.Principal(
                        user.getId(), user.getEmail(), null, null, null, null,
                        user.isSystemOwner()));
            }
        }

        return new JwtAuthenticationToken(jwt, authorities,
                email != null ? email : uid);
    }
}
