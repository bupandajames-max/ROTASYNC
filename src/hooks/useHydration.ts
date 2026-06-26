import { useEffect, useRef, useState } from 'react';
import {
  StaffMember, RosterCycle, DailyTask, ApprovalRequest, ExtraHoursEntry, Timesheet,
  Facility, Department, PublicHoliday, TaskMaster, RosterRuleSet, ShiftDef, Taxonomy,
} from '../types';
import {
  SHIFTS, DEFAULT_FACILITIES, getStaffSeedForFacility, getTasksSeedForFacility,
  upgradeFacilitiesList, buildDefaultRuleSet, buildDefaultWorkspaceConfig,
} from '../data/initialData';
import { getDatesForCycle, generateSeedShifts } from '../utils/rosterUtils';
import {
  dbGetCollection, dbSetDoc, dbDeleteDoc, dbGetDoc, dbGetCollectionByFacility,
  seedCollectionFromLocalIfEmpty,
} from '../firebase';
import { isSuperuserEmail } from '../config/access';
import { GLOBAL_KEYS, facilityKey, seededFlagKey } from '../utils/storageKeys';
import { DEFAULT_TAXONOMY } from './useWorkspaceConfig';

interface HydrationDeps {
  selectedFacilityId: string;
  setSelectedFacilityId: (id: string) => void;
  firebaseUser: any;
  // Owned by App.tsx, not this hook — useWorkspaceConfig also reads
  // isHydrated to gate its own persistence effects, so it has to be set up
  // before either hook runs, not produced by one of them.
  setIsHydrated: (v: boolean) => void;
  setFacilities: (f: Facility[]) => void;
  setDepartments: (d: Department[]) => void;
  setHolidays: (h: PublicHoliday[]) => void;
  setShifts: (s: { [code: string]: ShiftDef }) => void;
  setRuleSet: (rs: RosterRuleSet) => void;
  setTaskCategories: (c: string[]) => void;
  setFacilityTypes: (t: string[]) => void;
  setTimezoneLabel: (t: string) => void;
  setRegionPresetId: (id: string | undefined) => void;
  setTaxonomy: (t: Taxonomy) => void;
  handleGenericError: (error: any) => void;
  // Generates today's seed daily tasks. Defined in App.tsx (it's also used by
  // several runtime handlers there), passed in here so hydration can call it
  // with its own freshly-loaded dates/holidays rather than the live state —
  // avoids a circular dependency, since cycleDates is *owned* by this hook.
  generateDayTasksFn: (
    dateStr: string,
    staff: StaffMember[],
    cycle: RosterCycle,
    tasks: TaskMaster[],
    loadTally: Record<string, number> | undefined,
    datesOverride: string[],
    holidaysOverride: PublicHoliday[]
  ) => DailyTask[];
}

/**
 * Owns the "operational data" domain (staff, roster cycle, tasks, daily
 * tasks, approvals, extra hours, timesheets) and the one big hydration
 * effect that loads it all on facility switch / sign-in: local cache first,
 * then cloud authority if signed in, then post-hydration state alignment.
 *
 * This is the single riskiest piece of App.tsx's original god-component —
 * every other domain (auth, facilities, workspace config) was already split
 * into its own hook earlier; this was deliberately done last, after there
 * was less simultaneously in flight.
 */
export function useHydration(deps: HydrationDeps) {
  const {
    selectedFacilityId, setSelectedFacilityId, firebaseUser, setIsHydrated,
    setFacilities, setDepartments, setHolidays, setShifts,
    setRuleSet, setTaskCategories, setFacilityTypes, setTimezoneLabel, setRegionPresetId,
    setTaxonomy, handleGenericError, generateDayTasksFn,
  } = deps;

  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [activeStaffId, setActiveStaffId] = useState('');
  const [activeCycle, setActiveCycle] = useState<RosterCycle | null>(null);
  const [cycleDates, setCycleDates] = useState<string[]>([]);
  const [taskMasterList, setTaskMasterList] = useState<TaskMaster[]>([]);
  const [dailyTasks, setDailyTasks] = useState<DailyTask[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [extraHoursLog, setExtraHoursLog] = useState<ExtraHoursEntry[]>([]);
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);

  const staffListRef = useRef<StaffMember[] | null>(null);
  const lastStaffListRef = useRef<StaffMember[]>([]);
  const lastTaskMasterListRef = useRef<TaskMaster[]>([]);
  const lastDailyTasksRef = useRef<DailyTask[]>([]);
  const lastApprovalsRef = useRef<ApprovalRequest[]>([]);
  const lastExtraHoursLogRef = useRef<ExtraHoursEntry[]>([]);

  // 1. Unified Coordinated Hydration Engine state loader
  useEffect(() => {
    // NOTE: we intentionally do NOT early-return when there is no selected
    // facility — the hydrate() routine handles the first-run/blank-slate case
    // (loading any stored facilities, auto-selecting one, or marking hydration
    // complete so the setup wizard can appear).
    setIsHydrated(false);

    let active = true;

    async function hydrate() {
      // --- STEP A: Load Local Cache first so UI is immediately responsive ---
      // Load Facilities
      const storedFacilities = localStorage.getItem(GLOBAL_KEYS.facilitiesList);
      let loadedFacs = DEFAULT_FACILITIES;
      if (storedFacilities) {
        try {
          const parsed = JSON.parse(storedFacilities);
          const { upgraded, changed } = upgradeFacilitiesList(parsed);
          loadedFacs = upgraded;
          if (changed) {
            localStorage.setItem(GLOBAL_KEYS.facilitiesList, JSON.stringify(upgraded));
          }
        } catch (e) {
          loadedFacs = DEFAULT_FACILITIES;
        }
      }
      if (active) {
        setFacilities(loadedFacs);
      }

      // First-run / no active selection: nothing to hydrate yet. Auto-select the
      // first facility if one exists, otherwise fall through to the setup wizard.
      if (!selectedFacilityId) {
        if (loadedFacs.length > 0 && active) {
          setSelectedFacilityId(loadedFacs[0].id); // effect re-runs with the new id
        } else if (active) {
          setIsHydrated(true);
        }
        return;
      }

      const isSeededInitially = localStorage.getItem(seededFlagKey(selectedFacilityId)) === 'true';

      // Load Departments
      const storedDepts = localStorage.getItem(GLOBAL_KEYS.departments);
      let loadedDepts: Department[] = [];
      if (storedDepts) {
        try {
          loadedDepts = JSON.parse(storedDepts);
        } catch (e) {
          loadedDepts = [];
        }
      }
      if (active) {
        setDepartments(loadedDepts);
      }

      // Load Holidays (no region baked in; sourced from workspace config / region preset)
      let loadedHolidays: PublicHoliday[] = [];
      const storedHolidays = localStorage.getItem(facilityKey(selectedFacilityId, 'holidays')) || localStorage.getItem('kmh_holidays');
      if (storedHolidays) {
        try {
          loadedHolidays = JSON.parse(storedHolidays);
        } catch (e) {}
      }
      if (active) {
        setHolidays(loadedHolidays);
      }

      // Load custom shifts
      const storedShifts = localStorage.getItem(facilityKey(selectedFacilityId, 'custom_shifts'));
      let loadedShifts = SHIFTS;
      if (storedShifts) {
        try {
          loadedShifts = JSON.parse(storedShifts);
        } catch (e) {}
      }
      if (active) {
        setShifts(loadedShifts);
      }

      // Load workspace configuration (ruleset, categories, facility types, regional).
      // Migration: if no bundled config exists yet, wrap the loose settings already
      // loaded above into a default config so existing installs keep working.
      const storedConfig = localStorage.getItem(facilityKey(selectedFacilityId, 'config'));
      let loadedRuleSet = buildDefaultRuleSet();
      let loadedCategories = buildDefaultWorkspaceConfig().taskCategories;
      let loadedFacTypes = buildDefaultWorkspaceConfig().facilityTypes;
      let loadedTimezone = '';
      let loadedRegionId: string | undefined = undefined;
      if (storedConfig) {
        try {
          const cfg = JSON.parse(storedConfig) as any;
          if (cfg.ruleSet) loadedRuleSet = cfg.ruleSet;
          if (Array.isArray(cfg.taskCategories) && cfg.taskCategories.length) loadedCategories = cfg.taskCategories;
          if (Array.isArray(cfg.facilityTypes) && cfg.facilityTypes.length) loadedFacTypes = cfg.facilityTypes;
          if (typeof cfg.timezoneLabel === 'string') loadedTimezone = cfg.timezoneLabel;
          if (typeof cfg.regionPresetId === 'string') loadedRegionId = cfg.regionPresetId;
        } catch (e) {}
      }
      if (active) {
        setRuleSet(loadedRuleSet);
        setTaskCategories(loadedCategories);
        setFacilityTypes(loadedFacTypes);
        setTimezoneLabel(loadedTimezone);
        setRegionPresetId(loadedRegionId);
      }

      // Load Staff
      let loadedStaff: StaffMember[] = [];
      const storedStaff = localStorage.getItem(facilityKey(selectedFacilityId, 'staff_list'));
      if (storedStaff) {
        try {
          loadedStaff = JSON.parse(storedStaff);
        } catch (e) {
          loadedStaff = isSeededInitially ? [] : getStaffSeedForFacility(selectedFacilityId);
        }
      } else {
        loadedStaff = isSeededInitially ? [] : getStaffSeedForFacility(selectedFacilityId);
      }
      loadedStaff = (loadedStaff || [])
        .filter((s): s is StaffMember => s !== null && typeof s === 'object' && typeof s.name === 'string')
        .map(s => ({
        id: s.id || `staff-${Math.random().toString(36).substring(2, 11)}`,
        name: s.name || 'Unnamed',
        email: s.email || `${(s.name || 'staff').toLowerCase().replace(/\s+/g, '')}@example.com`,
        role: s.role || 'Staff Member',
        facilityId: s.facilityId || selectedFacilityId,
        phone: s.phone || '',
        contractedHours: Number(s.contractedHours) || 168,
        gender: s.gender || '',
        fullName: s.fullName || s.name || 'Unnamed Staff Member',
        employeeNo: s.employeeNo || `EMP-${Math.floor(Math.random() * 1000)}`,
        isManager: !!s.isManager,
        departmentId: s.departmentId || undefined
      }));

      // Apply self-healing deduplication to check if the firebaseUser had a previous placeholder staff member
      if (firebaseUser?.email) {
        const userEmail = firebaseUser.email.toLowerCase().trim();
        const onboardedUser = loadedStaff.find(s => s.email?.toLowerCase().trim() === userEmail);
        if (onboardedUser) {
          const shortOnboardName = (onboardedUser.name || '').toLowerCase().trim();
          const legacyUser = loadedStaff.find(s =>
            s.id !== onboardedUser.id &&
            (s.name || '').toLowerCase().trim() === shortOnboardName &&
            (!s.email || s.email.includes('@example.com') || s.email.includes('demo') || s.email === 'james@example.com' || s.email === 'getrude@example.com' || s.email === 'staff@example.com')
          );
          if (legacyUser) {
            const merged: StaffMember = {
              ...legacyUser,
              email: onboardedUser.email,
              fullName: onboardedUser.fullName || legacyUser.fullName,
              phone: onboardedUser.phone || legacyUser.phone,
              gender: onboardedUser.gender || legacyUser.gender,
              isManager: legacyUser.isManager || onboardedUser.isManager,
              departmentId: legacyUser.departmentId || onboardedUser.departmentId
            };
            loadedStaff = loadedStaff.filter(s => s.id !== onboardedUser.id);
            loadedStaff = loadedStaff.map(s => s.id === legacyUser.id ? merged : s);
          }
        }
      }

      if (active) {
        setStaffList(loadedStaff);
        lastStaffListRef.current = loadedStaff;
      }

      // Load cycle dates
      const storedDates = localStorage.getItem(facilityKey(selectedFacilityId, 'cycle_dates'));
      let loadedDates = getDatesForCycle('2026-06-15');
      if (storedDates) {
        try {
          loadedDates = JSON.parse(storedDates);
        } catch (e) {}
      }
      if (active) {
        setCycleDates(loadedDates);
      }

      // Load Active Cycle
      const storedCycle = localStorage.getItem(facilityKey(selectedFacilityId, 'active_cycle'));
      let loadedCycle: RosterCycle | null = null;
      if (storedCycle) {
        try {
          loadedCycle = JSON.parse(storedCycle);
        } catch (e) {}
      }
      if (!loadedCycle) {
        const initialShifts = generateSeedShifts(loadedStaff, loadedDates, loadedHolidays, loadedRuleSet);
        loadedCycle = {
          id: `cycle-${selectedFacilityId}-2026-06-15`,
          startDate: '2026-06-15',
          endDate: '2026-07-14',
          shifts: initialShifts,
          isLocked: false
        };
      }
      if (active) {
        setActiveCycle(loadedCycle);
      }

      // Load Task Master
      const storedTaskMaster = localStorage.getItem(facilityKey(selectedFacilityId, 'task_master'));
      let loadedTasks: TaskMaster[] = [];
      if (storedTaskMaster) {
        try {
          loadedTasks = JSON.parse(storedTaskMaster);
        } catch (e) {
          loadedTasks = isSeededInitially ? [] : getTasksSeedForFacility(selectedFacilityId);
        }
      } else {
        loadedTasks = isSeededInitially ? [] : getTasksSeedForFacility(selectedFacilityId);
      }
      if (active) {
        setTaskMasterList(loadedTasks);
        lastTaskMasterListRef.current = loadedTasks;
      }

      // Load Approvals
      const storedApprovals = localStorage.getItem(facilityKey(selectedFacilityId, 'approvals'));
      let loadedApprovals: ApprovalRequest[] = [];
      if (storedApprovals) {
        try {
          loadedApprovals = JSON.parse(storedApprovals);
        } catch (e) {}
      }
      if (active) {
        setApprovals(loadedApprovals);
        lastApprovalsRef.current = loadedApprovals;
      }

      // Load Overtime logs
      const storedExtra = localStorage.getItem(facilityKey(selectedFacilityId, 'extra_hours_log'));
      let loadedExtra: ExtraHoursEntry[] = [];
      if (storedExtra) {
        try {
          loadedExtra = JSON.parse(storedExtra);
        } catch (e) {}
      }
      if (active) {
        setExtraHoursLog(loadedExtra);
        lastExtraHoursLogRef.current = loadedExtra;
      }

      // Load Daily Tasks log
      const storedDaily = localStorage.getItem(facilityKey(selectedFacilityId, 'daily_tasks'));
      let loadedDaily: DailyTask[] = [];
      if (storedDaily) {
        try {
          loadedDaily = JSON.parse(storedDaily);
        } catch (e) {}
      }
      if (loadedDaily.length === 0 && loadedCycle) {
        loadedDaily = generateDayTasksFn('2026-06-18', loadedStaff, loadedCycle, loadedTasks, undefined, loadedDates, loadedHolidays);
      }
      if (active) {
        setDailyTasks(loadedDaily);
        lastDailyTasksRef.current = loadedDaily;
      }

      // Load Timesheets list
      const storedTimesheets = localStorage.getItem(facilityKey(selectedFacilityId, 'timesheets_list'));
      let loadedTimesheets: Timesheet[] = [];
      if (storedTimesheets) {
        try {
          loadedTimesheets = JSON.parse(storedTimesheets);
        } catch (e) {}
      }
      if (active) {
        setTimesheets(loadedTimesheets);
      }

      // Load Taxonomy
      const storedTax = localStorage.getItem(facilityKey(selectedFacilityId, 'taxonomy'));
      let loadedTax = DEFAULT_TAXONOMY;
      if (storedTax) {
        try {
          loadedTax = JSON.parse(storedTax);
        } catch (e) {}
      }
      if (active) {
        setTaxonomy(loadedTax);
      }

      if (!isSeededInitially) {
        localStorage.setItem(seededFlagKey(selectedFacilityId), 'true');
      }

      // --- STEP B: Hydrate from Cloud authority if firebase user is signed in ---
      if (firebaseUser) {
        try {
          // Per-tenant read isolation: super users read everything (and filter
          // client-side); everyone else reads only their facility's docs. Super is
          // determined from the email allowlist so it's reliable before access resolves.
          const scopeReads = !isSuperuserEmail(firebaseUser.email);
          const readCol = <T,>(p: string): Promise<T[]> =>
            scopeReads ? dbGetCollectionByFacility<T>(p, selectedFacilityId) : dbGetCollection<T>(p);

          // One-time backfill: tag any pre-isolation docs (missing facilityId) with
          // the current facility so non-super reads (which now require the field)
          // can see them. Only the super's unscoped read can find these.
          const backfillFacility = (path: string, items: { id: string; facilityId?: string }[]) => {
            if (scopeReads) return;
            const missing = items.filter(i => !i.facilityId);
            missing.forEach(i => {
              dbSetDoc(path, i.id, { ...i, facilityId: selectedFacilityId } as any).catch(() => {});
            });
          };

          const configDoc = await dbGetDoc<{ id: string; seeded: boolean }>('systemConfig', 'status');
          const cloudIsAlreadySeeded = configDoc !== null;

          // 1. Facilities — a facility doc's own id IS its facilityId (there's
          // no separate field), so the generic where('facilityId',...) scoped
          // reader doesn't apply here. Non-super users only ever have one
          // facility anyway, so fetch it directly by id instead of listing.
          let cloudFacs: Facility[] = scopeReads
            ? (selectedFacilityId ? [await dbGetDoc<Facility>('facilities', selectedFacilityId)].filter((f): f is Facility => f !== null) : [])
            : await dbGetCollection<Facility>('facilities');
          cloudFacs = await seedCollectionFromLocalIfEmpty('facilities', cloudFacs, cloudIsAlreadySeeded, loadedFacs);
          if (cloudFacs.length > 0) {
            const { upgraded, changed } = upgradeFacilitiesList(cloudFacs);
            cloudFacs = upgraded;
            if (active) setFacilities(cloudFacs);
            localStorage.setItem(GLOBAL_KEYS.facilitiesList, JSON.stringify(cloudFacs));
          }

          // 2. Departments
          const cloudDepts = await readCol<Department>('departments');
          if (active) setDepartments(cloudDepts);
          localStorage.setItem(GLOBAL_KEYS.departments, JSON.stringify(cloudDepts));

          // 3. Staff List
          let cloudStaff = await readCol<StaffMember>('staff');
          backfillFacility('staff', cloudStaff);
          cloudStaff = cloudStaff.map(s => ({
            id: s.id || `staff-${Math.random().toString(36).substring(2, 11)}`,
            name: s.name || 'Unnamed',
            email: s.email || `${(s.name || 'staff').toLowerCase().replace(/\s+/g, '')}@example.com`,
            role: s.role || 'Staff Member',
            facilityId: s.facilityId || selectedFacilityId,
            phone: s.phone || '',
            contractedHours: Number(s.contractedHours) || 168,
            gender: s.gender || '',
            fullName: s.fullName || s.name || 'Unnamed Staff Member',
            employeeNo: s.employeeNo || `EMP-${Math.floor(Math.random() * 1000)}`,
            isManager: !!s.isManager,
            departmentId: s.departmentId || undefined
          }));
          let partitionedCloudStaff = cloudStaff.filter(s => s.facilityId === selectedFacilityId);
          if (partitionedCloudStaff.length === 0 && !cloudIsAlreadySeeded && loadedStaff.length > 0) {
            for (const s of loadedStaff) {
              await dbSetDoc('staff', s.id, { ...s, facilityId: selectedFacilityId });
            }
            partitionedCloudStaff = loadedStaff;
          }

          // Self-healing merge of duplicate user profiles (e.g. James real email vs placeholder demo email)
          if (firebaseUser?.email) {
            const userEmail = firebaseUser.email.toLowerCase().trim();
            const onboardedUser = partitionedCloudStaff.find(s => s.email?.toLowerCase().trim() === userEmail);
            if (onboardedUser) {
              const shortOnboardName = (onboardedUser.name || '').toLowerCase().trim();
              const legacyUser = partitionedCloudStaff.find(s =>
                s.id !== onboardedUser.id &&
                (s.name || '').toLowerCase().trim() === shortOnboardName &&
                (!s.email || s.email.includes('@example.com') || s.email.includes('demo') || s.email === 'james@example.com' || s.email === 'getrude@example.com' || s.email === 'staff@example.com')
              );

              if (legacyUser) {
                const merged: StaffMember = {
                  ...legacyUser,
                  email: onboardedUser.email,
                  fullName: onboardedUser.fullName || legacyUser.fullName,
                  phone: onboardedUser.phone || legacyUser.phone,
                  gender: onboardedUser.gender || legacyUser.gender,
                  isManager: legacyUser.isManager || onboardedUser.isManager,
                  departmentId: legacyUser.departmentId || onboardedUser.departmentId
                };

                // Firestore writes to link real email with original ID and clear temporary onboarding profiles
                await dbDeleteDoc('staff', onboardedUser.id).catch(() => {});
                await dbSetDoc('staff', legacyUser.id, merged);

                partitionedCloudStaff = partitionedCloudStaff.filter(s => s.id !== onboardedUser.id);
                partitionedCloudStaff = partitionedCloudStaff.map(s => s.id === legacyUser.id ? merged : s);
              }
            }
          }

          if (active) {
            setStaffList(partitionedCloudStaff);
            lastStaffListRef.current = partitionedCloudStaff;
          }
          localStorage.setItem(facilityKey(selectedFacilityId, 'staff_list'), JSON.stringify(partitionedCloudStaff));
          loadedStaff = partitionedCloudStaff;

          // 4. Active Cycle
          const cloudCycles = await readCol<RosterCycle>('cycles');
          backfillFacility('cycles', cloudCycles);
          const targetCycleId = `cycle-${selectedFacilityId}-2026-06-15`;
          let cloudCycle = cloudCycles.find(c => c.id === targetCycleId);
          if (!cloudCycle && !cloudIsAlreadySeeded && loadedCycle) {
            await dbSetDoc('cycles', loadedCycle.id, loadedCycle);
            cloudCycle = loadedCycle;
          }
          if (active) {
            setActiveCycle(cloudCycle || null);
          }
          if (cloudCycle) {
            localStorage.setItem(facilityKey(selectedFacilityId, 'active_cycle'), JSON.stringify(cloudCycle));
            loadedCycle = cloudCycle;
          } else {
            localStorage.removeItem(facilityKey(selectedFacilityId, 'active_cycle'));
            loadedCycle = null;
          }

          // 5. Tasks Master
          let cloudTasks = await readCol<TaskMaster>('taskMasters');
          backfillFacility('taskMasters', cloudTasks);
          cloudTasks = await seedCollectionFromLocalIfEmpty('taskMasters', cloudTasks, cloudIsAlreadySeeded, loadedTasks);
          if (active) {
            setTaskMasterList(cloudTasks);
            lastTaskMasterListRef.current = cloudTasks;
          }
          localStorage.setItem(facilityKey(selectedFacilityId, 'task_master'), JSON.stringify(cloudTasks));
          loadedTasks = cloudTasks;

          // 6. Daily Tasks
          let cloudDailyTasks = await readCol<DailyTask>('dailyTasks');
          backfillFacility('dailyTasks', cloudDailyTasks);
          let partitionedCloudDaily = cloudDailyTasks.filter(t =>
            loadedStaff.some(s => s.name === t.staffName)
          );
          partitionedCloudDaily = await seedCollectionFromLocalIfEmpty('dailyTasks', partitionedCloudDaily, cloudIsAlreadySeeded, loadedDaily);
          if (active) {
            setDailyTasks(partitionedCloudDaily);
            lastDailyTasksRef.current = partitionedCloudDaily;
          }
          localStorage.setItem(facilityKey(selectedFacilityId, 'daily_tasks'), JSON.stringify(partitionedCloudDaily));
          loadedDaily = partitionedCloudDaily;

          // 7. Approvals
          let cloudApprovals = await readCol<ApprovalRequest>('approvals');
          backfillFacility('approvals', cloudApprovals);
          cloudApprovals = await seedCollectionFromLocalIfEmpty('approvals', cloudApprovals, cloudIsAlreadySeeded, loadedApprovals);
          if (active) {
            setApprovals(cloudApprovals);
            lastApprovalsRef.current = cloudApprovals;
          }
          localStorage.setItem(facilityKey(selectedFacilityId, 'approvals'), JSON.stringify(cloudApprovals));

          // 8. Extra Hours Log
          let cloudExtra = await readCol<ExtraHoursEntry>('extraHours');
          backfillFacility('extraHours', cloudExtra);
          cloudExtra = await seedCollectionFromLocalIfEmpty('extraHours', cloudExtra, cloudIsAlreadySeeded, loadedExtra);
          if (active) {
            setExtraHoursLog(cloudExtra);
            lastExtraHoursLogRef.current = cloudExtra;
          }
          localStorage.setItem(facilityKey(selectedFacilityId, 'extra_hours_log'), JSON.stringify(cloudExtra));

          // 9. Timesheets
          const cloudTimesheets = await readCol<Timesheet>('timesheets');
          backfillFacility('timesheets', cloudTimesheets);
          let partitionedCloudTimesheets = cloudTimesheets.filter(t =>
            loadedStaff.some(s => s.id === t.staffId)
          );
          partitionedCloudTimesheets = await seedCollectionFromLocalIfEmpty('timesheets', partitionedCloudTimesheets, cloudIsAlreadySeeded, loadedTimesheets);
          if (active) {
            setTimesheets(partitionedCloudTimesheets);
          }
          localStorage.setItem(facilityKey(selectedFacilityId, 'timesheets_list'), JSON.stringify(partitionedCloudTimesheets));

          if (!cloudIsAlreadySeeded) {
            await dbSetDoc('systemConfig', 'status', { id: 'status', seeded: true });
          }

        } catch (err) {
          console.error("Coordinated cloud recovery sync failed:", err);
          handleGenericError(err);
        }
      }

      // --- STEP C: Post-Hydration State Alignment ---
      // Configure operator/member view credentials
      const storedActiveId = localStorage.getItem(facilityKey(selectedFacilityId, 'active_staff_id'));
      if (storedActiveId && loadedStaff.some(s => s.id === storedActiveId)) {
        if (active) setActiveStaffId(storedActiveId);
      } else {
        const manager = loadedStaff.find(s => s.isManager) || loadedStaff[0];
        const fallbackId = manager ? manager.id : '';
        if (active) {
          setActiveStaffId(fallbackId);
          localStorage.setItem(facilityKey(selectedFacilityId, 'active_staff_id'), fallbackId);
        }
      }

      if (active) {
        setIsHydrated(true);
      }
    }

    hydrate();

    return () => {
      active = false;
    };
  }, [selectedFacilityId, firebaseUser]);

  return {
    staffList, setStaffList,
    activeStaffId, setActiveStaffId,
    activeCycle, setActiveCycle,
    cycleDates, setCycleDates,
    taskMasterList, setTaskMasterList,
    dailyTasks, setDailyTasks,
    approvals, setApprovals,
    extraHoursLog, setExtraHoursLog,
    timesheets, setTimesheets,
    staffListRef, lastStaffListRef, lastTaskMasterListRef, lastDailyTasksRef, lastApprovalsRef, lastExtraHoursLogRef,
  };
}
