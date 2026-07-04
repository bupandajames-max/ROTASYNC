import { describe, it, expect } from 'vitest';
import { shardCycle, mergeCycleShards, groupShardsByCycle, shardIdFor, UNASSIGNED_DEPT_KEY } from './cycleSharding';
import type { RosterCycle, StaffMember } from '../types';

const mkStaff = (id: string, departmentId?: string): StaffMember => ({
  id, name: id, fullName: id, email: `${id}@example.com`, role: 'Member',
  phone: '', contractedHours: 168, gender: '', employeeNo: id, isManager: false, departmentId,
});

describe('cycleSharding', () => {
  const cycle: RosterCycle = {
    id: 'cycle-test-2026-06-15',
    startDate: '2026-06-15',
    endDate: '2026-07-14',
    shifts: {
      pharmA: ['A', 'A', 'OFF'],
      pharmB: ['C', 'C', 'OFF'],
      nurseA: ['N', 'N', 'OFF'],
      noDept: ['A', 'OFF', 'OFF'],
    },
    isLocked: false,
  };
  const staff = [
    mkStaff('pharmA', 'pharmacy'),
    mkStaff('pharmB', 'pharmacy'),
    mkStaff('nurseA', 'nursing'),
    mkStaff('noDept'), // no department assigned
  ];

  it('splits shifts into one shard per department, plus an unassigned shard', () => {
    const shards = shardCycle(cycle, staff, 'fac1');
    const byDept = Object.fromEntries(shards.map(s => [s.departmentId, s]));

    expect(shards).toHaveLength(3); // pharmacy, nursing, unassigned ('')
    expect(Object.keys(byDept['pharmacy'].shifts).sort()).toEqual(['pharmA', 'pharmB']);
    expect(Object.keys(byDept['nursing'].shifts)).toEqual(['nurseA']);
    expect(Object.keys(byDept[''].shifts)).toEqual(['noDept']);
  });

  it('shards carry facilityId and a predictable id so rules can scope them', () => {
    const shards = shardCycle(cycle, staff, 'fac1');
    shards.forEach(s => {
      expect(s.facilityId).toBe('fac1');
      expect(s.cycleId).toBe(cycle.id);
      expect(s.id).toBe(shardIdFor(cycle.id, s.departmentId || UNASSIGNED_DEPT_KEY));
    });
  });

  it('a full round-trip (all shards merged back) reproduces the original shifts exactly', () => {
    const shards = shardCycle(cycle, staff, 'fac1');
    const merged = mergeCycleShards(shards, cycle.id);
    expect(merged).not.toBeNull();
    expect(merged!.shifts).toEqual(cycle.shifts);
    expect(merged!.startDate).toBe(cycle.startDate);
    expect(merged!.endDate).toBe(cycle.endDate);
  });

  it('merging only one department shard (simulating a non-manager read) exposes ONLY that department', () => {
    // This is the actual security-relevant behavior: a Member's
    // facility-scoped query only returns their own department's shard under
    // firestore.rules, so the merge step here must never pull in shifts for
    // staff outside that shard.
    const shards = shardCycle(cycle, staff, 'fac1');
    const pharmacyOnly = shards.filter(s => s.departmentId === 'pharmacy');
    const merged = mergeCycleShards(pharmacyOnly, cycle.id);

    expect(merged).not.toBeNull();
    expect(Object.keys(merged!.shifts).sort()).toEqual(['pharmA', 'pharmB']);
    expect(merged!.shifts.nurseA).toBeUndefined();
    expect(merged!.shifts.noDept).toBeUndefined();
  });

  it('returns null when no shard matches the requested cycle id', () => {
    const shards = shardCycle(cycle, staff, 'fac1');
    expect(mergeCycleShards(shards, 'cycle-does-not-exist')).toBeNull();
  });

  it('groups multiple distinct cycles worth of shards correctly', () => {
    const cycleB: RosterCycle = { ...cycle, id: 'cycle-test-2026-07-15', shifts: { pharmA: ['A'] } };
    const shardsA = shardCycle(cycle, staff, 'fac1');
    const shardsB = shardCycle(cycleB, staff, 'fac1');

    const grouped = groupShardsByCycle([...shardsA, ...shardsB]);
    const ids = grouped.map(c => c.id).sort();
    expect(ids).toEqual([cycle.id, cycleB.id].sort());

    const foundA = grouped.find(c => c.id === cycle.id)!;
    expect(foundA.shifts).toEqual(cycle.shifts);
  });

  it('treats a pre-migration whole-cycle document (no cycleId field) as a single shard', () => {
    // Backward compatibility: a cycle written before sharding existed has no
    // cycleId field, and its own id IS the base cycle id directly.
    const legacyDoc = { ...cycle } as any;
    delete legacyDoc.cycleId;
    const merged = mergeCycleShards([legacyDoc], cycle.id);
    expect(merged?.shifts).toEqual(cycle.shifts);
  });
});
