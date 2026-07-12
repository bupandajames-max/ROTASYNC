# Frontend Integration Plan (React/Vite SPA → Spring API)

Goal: keep every screen and flow as-is. The SPA's data layer is already
funneled through a handful of modules (`src/firebase.ts`, `src/hooks/useHydration.ts`,
scattered `dbSetDoc`/`persistState` calls in `App.tsx`) — that's the seam we swap.

## 1. What stays unchanged

- **All UI components** (Dashboard, RosterGrid, TimesheetPortal, TaskBoard,
  EnterpriseAdmin, …): they consume in-memory state (`staffList`, `activeCycle`,
  `timesheets`…) and never talk to Firebase directly.
- **Firebase Auth + sign-in screen**: kept as the IdP. `signInWithGoogle()`
  is unchanged; we reuse the ID token as the API bearer token.
- **Local-first behavior**: localStorage caching per facility keeps working as
  the offline/optimistic layer.
- **In-memory data shapes** (`RosterCycle`, `Timesheet`, `DailyTask`…): the API
  is designed around them (jsonb `days`, taxonomy, etc.). One adapter maps
  `cycle.shifts{staffId: code[]}` ⇄ normalized assignment rows.

## 2. New module: `src/api/client.ts`

```ts
import { auth } from '../firebase';

const BASE = import.meta.env.VITE_API_BASE_URL; // e.g. https://api.rotasync.app

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  // Firebase SDK caches and auto-refreshes; this is cheap after first call
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(`${BASE}/api/v1${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, json?.code ?? 'UNKNOWN', json?.message ?? res.statusText);
  }
  return json as T;
}

export const api = {
  get:  <T>(p: string) => request<T>('GET', p),
  post: <T>(p: string, b?: unknown) => request<T>('POST', p, b),
  put:  <T>(p: string, b?: unknown) => request<T>('PUT', p, b),
  patch:<T>(p: string, b?: unknown) => request<T>('PATCH', p, b),
  del:  <T>(p: string) => request<T>('DELETE', p),
};
```

Notes:
- **No tenant anywhere in the client.** The server derives it from the token.
  This deletes a whole class of today's client-side scoping code (the
  `dbGetCollectionByFacilityAndField` machinery exists only because Firestore
  rules need query shapes to match — Postgres doesn't).
- 401 → trigger token refresh once, then sign-out flow. 404 on a known id →
  treat as "not visible to you" (same UX as Firestore permission-denied today).

## 3. Auth/session handling

Unchanged login UX. After `onAuthStateChanged` fires:

```ts
const me = await api.get<MeResponse>('/me');
```

`/me` replaces today's users-doc + membership + invite lookups:
- `membership == null && pendingInvite != null` → show the existing
  "Finish setting up your profile" invite-acceptance screen → `POST /invites/{id}/accept`.
- `membership == null && pendingInvite == null` → onboarding wizard →
  `POST /onboarding/organization`.
- otherwise → hydrate.

## 4. Hydration strategy (replaces `useHydration.ts` STEP B)

One request per collection, in parallel — exactly the current structure, so the
hook's shape barely changes:

```ts
const [staff, cycles, tasks, timesheets, approvals, extraHours, settings] =
  await Promise.all([
    api.get(`/staff?facilityId=${fid}`),
    api.get(`/cycles?facilityId=${fid}`),
    api.get(`/tasks?facilityId=${fid}&date=${today}`),
    api.get(`/timesheets?cycleId=${activeCycleId}`),
    api.get(`/approvals`),
    api.get(`/extra-hours`),
    api.get(`/settings?facilityId=${fid}`),
  ]);
```

Department/self scoping happens **server-side**; the client stops filtering
for security (it may still filter for UX). localStorage keeps serving as the
instant-boot cache: render cached state, hydrate from API, reconcile — the
same pattern as today.

## 5. Write-path replacement map

| Today (Firebase) | Replacement |
|---|---|
| `dbSetDoc('staff', …)` | `api.post/put('/staff…')` |
| cycle shard writes (`cycleSharding.ts`) | `api.put('/cycles/{id}/assignments')` — sharding module **deleted**, server owns scoping |
| `dbSetDoc('timesheets', …)` reconciliation effect | delete — server auto-creates DRAFTs per cycle |
| `dbSetDoc('approvals'/'extraHours'/'dailyTasks', …)` | corresponding endpoints |
| taxonomy/org-name writes (`organizations`, `workspaceConfigs`) | `PUT /organization`, `PUT /settings/*` |
| Factory reset multi-collection wipe | `POST /admin/factory-reset` (atomic, server-side) |
| `handleGenericError` permission-banner | keep; map `ApiError` 401/403/404 into it |

Adapter for the roster shape (one function, both directions):

```ts
// server → SPA
cycle.shifts = groupBy(assignments, a => a.staffId).mapValues(rows =>
  cycleDates.map(d => rows.find(r => r.dayDate === d)?.shiftCode ?? 'OFF'));
```

## 6. Dual-mode switch during migration

```ts
const DATA_BACKEND = import.meta.env.VITE_DATA_BACKEND; // 'firebase' | 'api'
```

`useHydration` and the write helpers branch on this one flag. Ship the SPA with
`firebase` as default; flip per-environment (staging first, then production)
without a rebuild by serving two envs. This is the rollback lever: flipping
back to `firebase` restores today's behavior instantly.

## 7. What gets deleted at cutover

- `firestore.rules`, `cycleSharding.ts`, `dbGetCollectionByFacilityAndField`
  and the query-shape workarounds, client-side timesheet reconciliation,
  the seed-from-local machinery (`seedCollectionFromLocalIfEmpty`).
- `firebase.ts` shrinks to auth-only (~40 lines) — or is replaced entirely if
  auth is later moved off Firebase (not required; Firebase Auth's free tier
  is generous and independent of Firestore).
