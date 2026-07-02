-- Phase 0 spike: Organization / Facility / Department / Profile / Invite core
-- schema, translating firestore.rules' isolation and role-capping logic into
-- RLS as faithfully as possible. This is the proving ground for the
-- Supabase migration plan — nothing in the live app reads from this yet.
--
-- Design notes vs. the Firestore model:
-- - IDs are kept as TEXT, matching the existing Firestore doc-ID scheme
--   (slugs, deterministic invite IDs), so a later ETL pass can preserve
--   existing IDs directly instead of needing an ID-remapping step.
-- - `profiles` merges what used to be two separate things in Firestore —
--   the `staff` doc (name/role/department) and the `users/{uid}` role
--   mirror doc (accessLevel/facilityId, the actual privilege choke point)
--   — into a single row with a real foreign key to auth.users. That mirror
--   doc only existed in Firestore because there was no relational way to
--   join identity to profile; Postgres doesn't need the workaround.
-- - Foreign keys give referential integrity Firestore never had — e.g. a
--   deleted department can no longer leave a dangling departmentId behind
--   the way a factory reset could before (an actual bug this project hit).

-- ── organizations ───────────────────────────────────────────────────────
create table organizations (
  id text primary key,
  name text not null check (char_length(name) between 1 and 150),
  -- Firebase Auth uid during the dual-auth transition window; becomes an
  -- auth.users(id) foreign key once auth fully cuts over (see migration plan).
  owner_uid text not null,
  created_at timestamptz not null default now()
);

-- ── facilities ───────────────────────────────────────────────────────────
create table facilities (
  id text primary key,
  organization_id text not null references organizations(id) on delete restrict,
  name text not null check (char_length(name) between 1 and 150),
  location text not null check (char_length(location) <= 150),
  lead_manager text,
  facilities_type text,
  created_at timestamptz not null default now()
);
create index facilities_organization_id_idx on facilities (organization_id);

-- ── departments ──────────────────────────────────────────────────────────
create table departments (
  id text primary key,
  facility_id text not null references facilities(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 150),
  description text,
  created_at timestamptz not null default now()
);
create index departments_facility_id_idx on departments (facility_id);

-- ── profiles ─────────────────────────────────────────────────────────────
-- One row per person. access_level is the actual privilege choke point
-- (equivalent to Firestore's users/{uid}.accessLevel); role_title is the
-- free-text job title (equivalent to StaffMember.role), kept distinct on
-- purpose — these were always two different concepts sharing confusingly
-- similar names in the Firestore model.
create table profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  email text not null check (char_length(email) between 1 and 150),
  full_name text not null check (char_length(full_name) <= 100),
  short_name text,
  employee_no text,
  role_title text check (char_length(role_title) <= 100),
  access_level text not null default 'staff'
    check (access_level in ('staff', 'dept_head', 'facility_manager', 'superuser')),
  facility_id text references facilities(id) on delete set null,
  department_id text references departments(id) on delete set null,
  contracted_hours integer,
  gender text,
  phone text,
  skills text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_facility_id_idx on profiles (facility_id);
create unique index profiles_email_facility_idx on profiles (lower(email), facility_id);

-- ── invites ──────────────────────────────────────────────────────────────
-- Doc-ID-equivalent deterministic key kept as facility_id || '--' || email
-- for continuity with the Firestore scheme, though Postgres doesn't
-- strictly need it the way Firestore rules' get()/exists() did (a plain
-- unique constraint + query does the same job here).
create table invites (
  id text primary key,
  email text not null check (char_length(email) between 1 and 150),
  organization_id text not null references organizations(id) on delete cascade,
  facility_id text not null references facilities(id) on delete cascade,
  department_id text references departments(id) on delete set null,
  facility_name text,
  department_name text,
  role text not null check (role in ('staff', 'dept_head', 'facility_manager')),
  invited_by text not null check (char_length(invited_by) <= 150),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  created_at timestamptz not null default now(),
  constraint invites_id_matches_content check (id = facility_id || '--' || email)
);
create index invites_facility_id_idx on invites (facility_id);
create index invites_email_idx on invites (lower(email));

-- ── role/scope helper functions ─────────────────────────────────────────
-- security definer + fixed search_path: these read `profiles` on behalf of
-- the caller to resolve their own role/facility, which would otherwise
-- recurse into RLS on `profiles` itself (the classic Postgres RLS
-- self-reference gotcha). This mirrors how Firestore rules' get() on
-- users/{uid} implicitly bypasses rule evaluation on the target doc.

create or replace function caller_profile()
returns profiles
language sql stable security definer set search_path = public as $$
  select * from profiles where auth_user_id = auth.uid() limit 1;
$$;

create or replace function caller_facility_id()
returns text
language sql stable security definer set search_path = public as $$
  select facility_id from profiles where auth_user_id = auth.uid() limit 1;
$$;

create or replace function caller_organization_id()
returns text
language sql stable security definer set search_path = public as $$
  select f.organization_id
  from profiles p
  join facilities f on f.id = p.facility_id
  where p.auth_user_id = auth.uid()
  limit 1;
$$;

create or replace function caller_access_level()
returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select access_level from profiles where auth_user_id = auth.uid() limit 1),
    'staff'
  );
$$;

create or replace function caller_email()
returns text
language sql stable security definer set search_path = public as $$
  select email from auth.users where id = auth.uid();
$$;

create or replace function is_super()
returns boolean
language sql stable as $$
  select caller_access_level() = 'superuser';
$$;

create or replace function is_facility_level()
returns boolean
language sql stable as $$
  select is_super() or caller_access_level() = 'facility_manager';
$$;

create or replace function is_manager_level()
returns boolean
language sql stable as $$
  select is_facility_level() or caller_access_level() = 'dept_head';
$$;

-- Per-tenant write isolation, same shape as firestore.rules' inMyFacility().
create or replace function in_my_facility(fid text)
returns boolean
language sql stable as $$
  select is_super() or fid = caller_facility_id();
$$;

-- Mirrors EnterpriseAdmin's assignableRoles cap / firestore.rules'
-- canGrantRole(): only a superuser may grant facility_manager; anyone
-- manager-level+ may grant dept_head; anyone may grant plain staff.
create or replace function can_grant_role(target_role text)
returns boolean
language sql stable as $$
  select target_role = 'staff'
    or (target_role = 'dept_head' and is_manager_level())
    or (target_role = 'facility_manager' and is_super());
$$;

-- Mirrors isOrgBootstrap(): true only for the first-run creator of an
-- organization+facility pair they own, who doesn't already belong to a
-- facility. Used to let a brand-new profile self-insert at facility_manager.
-- Takes only the facility id — profiles has no organization_id column of
-- its own, so the organization is derived from the facility itself rather
-- than trusted as a second, independently-supplied argument.
create or replace function is_org_bootstrap(target_facility_id text)
returns boolean
language sql stable as $$
  select exists (
    select 1
    from facilities f
    join organizations o on o.id = f.organization_id
    where f.id = target_facility_id
      and o.owner_uid = auth.uid()::text
  )
  and caller_facility_id() is null;
$$;

-- Mirrors inviteGrantsLevel(): a usable (non-revoked) invite exists for
-- this email+facility, granting exactly this role.
create or replace function invite_grants_level(target_email text, target_facility_id text, target_role text)
returns boolean
language sql stable as $$
  select exists (
    select 1 from invites i
    where i.email = target_email
      and i.facility_id = target_facility_id
      and i.role = target_role
      and i.status <> 'revoked'
  );
$$;

-- ── row level security ──────────────────────────────────────────────────
alter table organizations enable row level security;
alter table facilities enable row level security;
alter table departments enable row level security;
alter table profiles enable row level security;
alter table invites enable row level security;

-- organizations: self-serve create (mirrors the users/{uid} self-create-as-
-- 'staff' bootstrap pattern) — anyone signed in may create ONE they own.
-- Rate-limiting/abuse prevention for repeated org creation is deferred,
-- same as the Firestore version.
create policy organizations_select on organizations for select
  using (is_super() or id = caller_organization_id() or owner_uid = auth.uid()::text);

create policy organizations_insert on organizations for insert
  with check (owner_uid = auth.uid()::text);

create policy organizations_update on organizations for update
  using (is_super() or owner_uid = auth.uid()::text)
  with check (is_super() or owner_uid = auth.uid()::text);

-- facilities: readable only by members of that facility (or super users).
-- Creation is super-only EXCEPT a genuine first-run bootstrap — a signed-in
-- user with no facility yet, creating the first facility under an
-- organization they own. Additional facilities under an existing org are
-- deliberately still super-only, matching the deferred scope from the
-- Firestore version.
create policy facilities_select on facilities for select
  using (is_super() or id = caller_facility_id());

create policy facilities_insert_super on facilities for insert
  with check (is_super());

create policy facilities_insert_bootstrap on facilities for insert
  with check (
    caller_facility_id() is null
    and exists (
      select 1 from organizations o
      where o.id = facilities.organization_id and o.owner_uid = auth.uid()::text
    )
  );

create policy facilities_update on facilities for update
  using (is_super())
  with check (is_super());

-- departments: facility managers and above, only within their own facility.
create policy departments_select on departments for select
  using (is_super() or facility_id = caller_facility_id());

create policy departments_write on departments for all
  using (is_facility_level() and in_my_facility(facility_id))
  with check (is_facility_level() and in_my_facility(facility_id));

-- profiles: writes are manager-level+ within their own facility, OR a
-- signed-in user self-inserting their OWN profile — either as an org
-- bootstrap (facility_manager) or as an invite-gated join (role pinned
-- exactly to what the invite grants). Unlike the Firestore self-onboard
-- rule, this can express the accessLevel==inviteRole check directly
-- without the get()-call gymnastics Firestore rules needed.
create policy profiles_select on profiles for select
  using (is_super() or facility_id = caller_facility_id() or auth_user_id = auth.uid());

create policy profiles_insert_manager on profiles for insert
  with check (is_manager_level() and in_my_facility(facility_id));

create policy profiles_insert_self on profiles for insert
  with check (
    auth_user_id = auth.uid()
    and email = caller_email()
    and (
      -- org bootstrap: first facility_manager of a freshly-created org+facility
      (access_level = 'facility_manager' and is_org_bootstrap(facility_id))
      or
      -- invite-gated join: role pinned exactly to what the invite grants
      invite_grants_level(email, facility_id, access_level)
    )
  );

create policy profiles_update_manager on profiles for update
  using (is_manager_level() and in_my_facility(facility_id))
  with check (is_manager_level() and in_my_facility(facility_id));

-- Self-update: never allowed to change your own access_level (mirrors
-- users/{uid}'s "incoming().accessLevel == existing().accessLevel" guard —
-- re-affirming is fine, self-escalating is not). profile_access_level()
-- reads the row by primary key rather than inlining a bare correlated
-- subquery, since that's the documented, tested pattern for this "compare
-- against the pre-update value" case in Postgres RLS — NEEDS A LIVE TEST
-- once a real project exists, same as everything else in this file; this
-- comment is not a substitute for actually running it.
create or replace function profile_access_level(pid uuid)
returns text
language sql stable security definer set search_path = public as $$
  select access_level from profiles where id = pid;
$$;

create policy profiles_update_self on profiles for update
  using (auth_user_id = auth.uid())
  with check (
    auth_user_id = auth.uid()
    and access_level = profile_access_level(id)
  );

-- invites: the only path into an existing facility. A manager creates one
-- scoped to their own facility/org, capped to a role they're allowed to
-- grant. The invitee can read it by email before accepting, and flip it to
-- 'accepted' themselves — no other field may change on that write. A
-- manager may revoke a pending invite, or re-issue one (same validation as
-- insert) at any time, in their own facility. No "claim by link" — every
-- read/accept is pinned to the invitee's own signed-in email.
create policy invites_select on invites for select
  using (
    is_super()
    or email = caller_email()
    or (is_manager_level() and facility_id = caller_facility_id())
  );

create policy invites_insert on invites for insert
  with check (
    is_manager_level()
    and in_my_facility(facility_id)
    and organization_id = caller_organization_id()
    and invited_by = caller_email()
    and status = 'pending'
    and can_grant_role(role)
  );

create policy invites_update_accept on invites for update
  using (email = caller_email() and status = 'pending')
  with check (
    status = 'accepted'
    and email = (select i2.email from invites i2 where i2.id = invites.id)
    and facility_id = (select i2.facility_id from invites i2 where i2.id = invites.id)
    and organization_id = (select i2.organization_id from invites i2 where i2.id = invites.id)
    and role = (select i2.role from invites i2 where i2.id = invites.id)
  );

-- Manager revoke: ANY manager in the same facility may revoke a pending
-- invite, regardless of who originally issued it — deliberately broader
-- than re-issue below, matching firestore.rules' revoke clause exactly
-- (it never checked invited_by).
create policy invites_update_revoke on invites for update
  using (is_manager_level() and in_my_facility(facility_id))
  with check (status = 'revoked');

-- Manager re-issue: same email/facility already invited again (e.g. after
-- a revoke, or by mistake) — identical validation to insert. Unlike
-- Firestore (where a write to an existing doc silently reclassifies as an
-- update, which is exactly what broke re-inviting after a revoke),
-- Postgres treats INSERT and UPDATE as genuinely distinct statements — an
-- upsert here correctly hits whichever policy applies, with no equivalent
-- gotcha. Kept as an explicit policy anyway for parity/defense in depth.
create policy invites_update_reissue on invites for update
  using (is_manager_level() and in_my_facility(facility_id))
  with check (
    is_manager_level()
    and in_my_facility(facility_id)
    and organization_id = caller_organization_id()
    and invited_by = caller_email()
    and status = 'pending'
    and can_grant_role(role)
  );

create policy invites_delete on invites for delete
  using (is_manager_level() and in_my_facility(facility_id));
