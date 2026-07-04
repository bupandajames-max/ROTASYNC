import { RosterCycle, StaffMember } from '../types';
import { dbGetCollectionByFacility, dbSetDoc, dbDeleteDoc } from '../firebase';

// A cycle used to be ONE Firestore document holding every department's
// shifts for the whole facility in a single { [staffId]: string[] } map.
// Firestore security rules can only grant or deny access to a whole
// document — they can't redact fields within one — so as long as every
// department shared that one document, any rule that let a Member read
// their own shifts necessarily handed them every other department's shifts
// too. This module splits storage into one shard document per department
// (keyed by departmentId, or UNASSIGNED_DEPT_KEY for staff with none) so
// firestore.rules can scope reads per shard, while every existing consumer
// of RosterCycle (the scheduling optimizer, RosterGrid, timesheet
// reconciliation, Analytics, dashboards) keeps working against the exact
// same unified { id, startDate, endDate, shifts, isLocked } shape it always
// has — this module is the only place that knows shards exist at all.
export const UNASSIGNED_DEPT_KEY = 'none';

export interface CycleShardDoc {
  id: string; // `${cycleId}__${deptKey}`
  cycleId: string; // the logical cycle/snapshot id this shard belongs to
  departmentId: string; // '' for unassigned, otherwise the real department id
  facilityId: string;
  startDate: string;
  endDate: string;
  isLocked?: boolean;
  shifts: { [staffId: string]: string[] };
}

function deptKeyFor(staff: StaffMember): string {
  return staff.departmentId && staff.departmentId.trim() ? staff.departmentId : UNASSIGNED_DEPT_KEY;
}

export function shardIdFor(baseCycleId: string, deptKey: string): string {
  return `${baseCycleId}__${deptKey}`;
}

// Splits a unified RosterCycle into one shard per department.
export function shardCycle(cycle: RosterCycle, staffList: StaffMember[], facilityId: string): CycleShardDoc[] {
  const byDept: { [deptKey: string]: { [staffId: string]: string[] } } = {};

  staffList.forEach(s => {
    const staffShifts = cycle.shifts[s.id];
    if (!staffShifts) return;
    const key = deptKeyFor(s);
    if (!byDept[key]) byDept[key] = {};
    byDept[key][s.id] = staffShifts;
  });

  // Shift entries for a staffId no longer in the current staffList (e.g. a
  // deleted staff member) shouldn't be silently dropped — whoever could
  // already see them keeps being able to, via the unassigned shard.
  const knownStaffIds = new Set(staffList.map(s => s.id));
  Object.keys(cycle.shifts).forEach(staffId => {
    if (knownStaffIds.has(staffId)) return;
    if (!byDept[UNASSIGNED_DEPT_KEY]) byDept[UNASSIGNED_DEPT_KEY] = {};
    byDept[UNASSIGNED_DEPT_KEY][staffId] = cycle.shifts[staffId];
  });

  return Object.entries(byDept).map(([deptKey, shifts]) => ({
    id: shardIdFor(cycle.id, deptKey),
    cycleId: cycle.id,
    departmentId: deptKey === UNASSIGNED_DEPT_KEY ? '' : deptKey,
    facilityId,
    startDate: cycle.startDate,
    endDate: cycle.endDate,
    isLocked: cycle.isLocked,
    shifts,
  }));
}

// Writes every shard for a cycle, and deletes any previously-written shard
// that no longer applies (e.g. everyone in a department was reassigned or
// the department was removed) so stale shift data doesn't linger under an
// orphaned shard id. Only ever called by a manager (cycles writes are
// isManagerLevel()-only in firestore.rules), so a facility-scoped read
// already sees every existing shard needed to compute the diff.
export async function persistShardedCycle(cycle: RosterCycle, staffList: StaffMember[], facilityId: string): Promise<void> {
  const shards = shardCycle(cycle, staffList, facilityId);
  const currentShardIds = new Set(shards.map(s => s.id));

  let previousShardIds: string[] = [];
  try {
    const existing = await dbGetCollectionByFacility<CycleShardDoc>('cycles', facilityId);
    previousShardIds = existing.filter(d => (d.cycleId || d.id) === cycle.id).map(d => d.id);
  } catch {
    // If this read fails, fall through without deleting anything — better to
    // leave a stale shard behind than to accidentally wipe live data because
    // of a transient read error.
  }

  await Promise.all(shards.map(shard => dbSetDoc('cycles', shard.id, shard)));

  const toDelete = previousShardIds.filter(id => !currentShardIds.has(id));
  await Promise.all(toDelete.map(id => dbDeleteDoc('cycles', id).catch(() => {})));
}

// Merges whichever shards the caller's rules allowed them to read back into
// the single unified RosterCycle shape every consumer already expects. A
// non-manager will only ever have their own department's shard here — they
// simply won't have other departments' staffIds in the merged shifts map at
// all, which is exactly the point.
//
// Also transparently handles pre-migration documents: a cycle written before
// this module existed has no `cycleId` field and its own `id` IS the base
// cycle id directly (with every department's shifts already in one doc) —
// treating it as a single-shard group produces the correct result with no
// special-casing.
export function mergeCycleShards(shards: (CycleShardDoc | RosterCycle)[], baseCycleId: string): RosterCycle | null {
  const relevant = shards.filter((s: any) => (s.cycleId || s.id) === baseCycleId);
  if (relevant.length === 0) return null;

  const mergedShifts: { [staffId: string]: string[] } = {};
  relevant.forEach(shard => {
    Object.assign(mergedShifts, shard.shifts);
  });

  const first = relevant[0];
  return {
    id: baseCycleId,
    startDate: first.startDate,
    endDate: first.endDate,
    isLocked: relevant.some(s => !!s.isLocked),
    shifts: mergedShifts,
  };
}

// Groups a flat list of shard docs (as returned by one facility-scoped
// query, which mixes shards from multiple distinct cycles/snapshots
// together) by their base cycle id, merging each group — used for building
// a full roster-history list where many archived cycles are read at once.
export function groupShardsByCycle(shards: (CycleShardDoc | RosterCycle)[]): RosterCycle[] {
  const byCycleId = new Map<string, (CycleShardDoc | RosterCycle)[]>();
  shards.forEach((s: any) => {
    const key = s.cycleId || s.id;
    if (!byCycleId.has(key)) byCycleId.set(key, []);
    byCycleId.get(key)!.push(s);
  });
  const result: RosterCycle[] = [];
  byCycleId.forEach((group, cycleId) => {
    const merged = mergeCycleShards(group, cycleId);
    if (merged) result.push(merged);
  });
  return result;
}
