# RotaSync API Contract (v1)

Base URL: `/api/v1`. All endpoints require `Authorization: Bearer <Firebase ID token>`
unless marked *public*. Errors use the uniform envelope:

```json
{ "timestamp": "…", "status": 404, "code": "NOT_FOUND", "message": "…", "path": "…" }
```

Conventions:

- **Tenant** is never sent by the client. It is resolved server-side from the
  caller's membership. Any id in a URL that belongs to another tenant returns
  **404** (not 403 — existence is information).
- Roles: `SYSTEM_OWNER` (platform), `ORG_ADMIN`, `MANAGER`, `MEMBER`.
  "Manager+" below means `MANAGER` or `ORG_ADMIN`.
- Members' reads of staff/tasks/roster are additionally scoped to their own
  department by the service layer (mirrors current Firestore behavior).
- All ids are UUIDs. Dates are `YYYY-MM-DD`; timestamps ISO-8601 UTC.

---

## Auth / session

| Method & path | Role | Description |
|---|---|---|
| `GET /me` | any authenticated | Who am I: user, tenant, role, facility, department, taxonomy. **This is the SPA's hydration entry point.** |

`GET /me` → 200:
```json
{
  "userId": "…", "email": "…", "displayName": "…",
  "systemOwner": false,
  "membership": {
    "tenantId": "…", "organizationName": "MBHS",
    "facilityId": "…", "departmentId": "…", "role": "MEMBER"
  } | null,
  "pendingInvite": { "inviteId": "…", "organizationName": "…", "facilityName": "…", "role": "MEMBER" } | null
}
```
No session endpoints are needed: the SPA already holds a Firebase ID token and
refreshes it via the Firebase SDK; the API is stateless.

## Onboarding

| Method & path | Role | Description |
|---|---|---|
| `POST /onboarding/organization` | any authenticated, no existing membership | Create org + first facility + departments + own ORG_ADMIN membership atomically |
| `POST /invites/{id}/accept` | any authenticated (email must match invite) | Accept invite → creates membership (+ links staff row by email) |

`POST /onboarding/organization` body:
```json
{
  "organizationName": "…",
  "facility": { "name": "…", "location": "…", "facilityType": "Branch" },
  "departments": [ { "name": "…", "description": "…" } ],
  "taxonomy": { …same shape the SPA uses today… },
  "team": [ { "name":"…", "fullName":"…", "email":"…", "employeeNo":"…", "departmentName":"…", "isManager":true } ]
}
```
(Server-side RLS bypass is used only inside this endpoint's transaction to
insert the organization row before a tenant exists.)

## Organizations & facilities

| Method & path | Role | Description |
|---|---|---|
| `GET /organization` | any member | Current org (id, name) |
| `PUT /organization` | ORG_ADMIN | Rename org — body `{ "name": "…" }` |
| `DELETE /organization` | ORG_ADMIN (re-auth required) | Soft-delete whole org (30-day recovery window) |
| `GET /facilities` | any member | Facilities of the tenant |
| `POST /facilities` | ORG_ADMIN | Create facility |
| `PUT /facilities/{id}` | Manager+ | Update name/location/type/leadManager |
| `DELETE /facilities/{id}` | ORG_ADMIN | Soft delete |
| `GET /facilities/{id}/departments` | any member | Departments (names/descriptions are tenant-public) |
| `POST /facilities/{id}/departments` | Manager+ | Create department |
| `PUT /departments/{id}` / `DELETE …` | Manager+ | Update / soft delete |

## Invites

| Method & path | Role | Description |
|---|---|---|
| `GET /invites?status=PENDING` | Manager+ | List invites for tenant |
| `POST /invites` | Manager+ | Body `{ email, role, facilityId, departmentId? }` → creates PENDING invite. `role: ORG_ADMIN` requires ORG_ADMIN caller. |
| `DELETE /invites/{id}` | Manager+ | Revoke |
| `POST /invites/{id}/accept` | invitee (email match) | See onboarding |

Email delivery: invite creation returns a shareable message (same WhatsApp/SMS
copy-link flow the app uses today); SMTP/SES can be added later without contract change.

## Staff

| Method & path | Role | Description |
|---|---|---|
| `GET /staff?facilityId=…` | any member (Members: own dept only) | List active staff |
| `GET /staff/{id}` | any member (dept-scoped) | One record |
| `POST /staff` | Manager+ | Create (see `UpsertStaffRequest`) |
| `PUT /staff/{id}` | Manager+ | Update |
| `DELETE /staff/{id}` | Manager+ | Soft delete |

## Roster

| Method & path | Role | Description |
|---|---|---|
| `GET /cycles?facilityId=…` | any member (Members: assignments filtered to own dept) | List cycles (id, dates, isLocked) |
| `GET /cycles/{id}` | any member (dept-scoped) | Cycle + its assignments `{ staffId, dayDate, shiftCode, shiftTimes? }[]` |
| `POST /cycles` | Manager+ | Create cycle `{ facilityId, startDate, endDate, generate, assignments[] }` — `generate: true` runs the server-side roster generator (staff spread across shift codes, max-consecutive-days from roster rules); `false` persists the given assignments |
| `PUT /cycles/{id}/assignments` | Manager+ | Bulk upsert assignments (idempotent by staffId+dayDate) |
| `PATCH /cycles/{id}` | Manager+ | `{ isLocked }` or date edits |
| `DELETE /cycles/{id}` | Manager+ | Soft delete |
| `GET /cycles/{id}/snapshots` | Manager+ | List snapshots |
| `POST /cycles/{id}/snapshots` | Manager+ | Freeze current state `{ label }` |
| `GET /snapshots/{id}` | Manager+ | Full frozen payload |

## Timesheets

| Method & path | Role | Description |
|---|---|---|
| `GET /timesheets?cycleId=…` | Manager+: all; Member: own only | List |
| `GET /timesheets/{id}` | owner or Manager+ | One (owner = linked staff.userId or matching email) |
| `PUT /timesheets/{id}/days` | owner (DRAFT/REJECTED only) | Update day entries `{ days: {…} }` |
| `POST /timesheets/{id}/submit` | owner | DRAFT → SUBMITTED |
| `POST /timesheets/{id}/approve` | Manager+ | SUBMITTED → APPROVED |
| `POST /timesheets/{id}/reject` | Manager+ | SUBMITTED → REJECTED `{ reason }` |

Server auto-creates DRAFT timesheets for each active staff member when a cycle
is created (replaces the client-side reconciliation effect).

## Approvals

| Method & path | Role | Description |
|---|---|---|
| `GET /approvals` | Manager+: all pending/decided; Member: own | List |
| `POST /approvals` | any member | Create `{ type, payload }` (staffId = caller's) |
| `POST /approvals/{id}/approve` / `…/reject` | Manager+ | Decide `{ note? }`; SHIFT_SWAP approval also applies the swap to assignments transactionally |
| `DELETE /approvals/{id}` | requester (PENDING only) | Cancel |

## Extra hours

| Method & path | Role | Description |
|---|---|---|
| `GET /extra-hours?staffId=…` | Manager+: any; Member: self | List |
| `POST /extra-hours` | any member (self) or Manager+ (anyone) | `{ staffId, workDate, hours, reason }` |
| `POST /extra-hours/{id}/approve` / `…/reject` | Manager+ | Decide |
| `DELETE /extra-hours/{id}` | creator (PENDING) or Manager+ | Remove |

## Daily tasks

| Method & path | Role | Description |
|---|---|---|
| `GET /tasks?facilityId=…&date=…` | any member (Members: own dept) | List |
| `POST /tasks` | Manager+ | Create |
| `PUT /tasks/{id}` | Manager+ | Full update |
| `PATCH /tasks/{id}/progress` | assignee or same department (Members), Manager+ | Progress-only update: status, notes, trackerValue, counterSign |
| `POST /tasks/generate` | Manager+ | Create today's board from task master list (server-side, replaces client auto-scheduler) |
| `DELETE /tasks/{id}` | Manager+ | Soft delete |

## Settings / terminology

| Method & path | Role | Description |
|---|---|---|
| `GET /settings?facilityId=…` | any member | taxonomy, shiftDefs, rosterRules, holidays (jsonb — same shapes the SPA uses today) |
| `PUT /settings/taxonomy` | Manager+ | Replace taxonomy (incl. org display name sync) |
| `PUT /settings/shift-defs` / `…/roster-rules` / `…/holidays` | Manager+ | Replace respective block |

## Administration

| Method & path | Role | Description |
|---|---|---|
| `POST /admin/factory-reset` | ORG_ADMIN (body must echo `{ "confirm": "<org name>", "facilityId"? }`) | Hard-deletes operational data (cycles, assignments, snapshots, timesheets, approvals, extra hours, tasks) for ONE facility or the whole tenant. **Preserves** org, facilities, departments, staff definitions, memberships, invites, settings. Writes audit record; returns per-entity deletion counts. |
| `GET /admin/audit?limit=…` | ORG_ADMIN | Recent audit log for tenant |
| `GET /sys/organizations` | SYSTEM_OWNER | Platform console: list orgs (no operational data) |
| `POST /sys/organizations/{id}/restore` | SYSTEM_OWNER | Undo org soft-delete within window |

---

### Status codes

`200/201/204` success · `400 VALIDATION_FAILED/BAD_REQUEST` · `401` missing/expired token ·
`403 FORBIDDEN` role too low · `404 NOT_FOUND` missing **or other-tenant** resource ·
`409 CONFLICT` (duplicate employeeNo, invite already accepted, state transitions) ·
`500 INTERNAL_ERROR`.
