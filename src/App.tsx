import React, { useState, useEffect, useRef } from 'react';
import {
  ShiftDef,
  StaffMember,
  RosterCycle,
  AbsenceLog,
  TaskMaster,
  DailyTask,
  ApprovalRequest,
  ExtraHoursEntry,
  PublicHoliday,
  Facility,
  Timesheet,
  TimesheetDay,
  Department,
  TaskHistoryEntry,
  RosterRuleSet,
  WorkspaceConfig
} from './types';
import { SHIFTS, INITIAL_STAFF, INITIAL_TASKS, DEFAULT_FACILITIES, getStaffSeedForFacility, getTasksSeedForFacility, upgradeFacilitiesList, buildDefaultRuleSet, buildDefaultWorkspaceConfig, WEEKDAY_NAMES } from './data/initialData';
import { getDatesForCycle, generateSeedShifts, runSmartPersonaOptimizer, isPublicHoliday, alignShiftsToNewDates } from './utils/rosterUtils';
import SetupWizard from './components/SetupWizard';
import ConfirmIdentity from './components/ConfirmIdentity';
import LoadingScreen from './components/LoadingScreen';
import SetupChecklist from './components/SetupChecklist';
import EmptyState from './components/EmptyState';
import { useToast } from './components/ui/ToastProvider';
import { useConfirm } from './components/ui/ConfirmProvider';
import { generateDefaultTimesheet, reconcileTimesheetWithRoster } from './utils/timesheetUtils';
import { GLOBAL_KEYS, facilityKey, seededFlagKey, setupHiddenKey, welcomedKey, mirrorLegacyFacilityKey } from './utils/storageKeys';
import firebaseConfig from '../firebase-applet-config.json';
import Header from './components/Header';
import Navigation from './components/Navigation';
import DashboardHome from './components/DashboardHome';
import RosterGrid from './components/RosterGrid';
import TaskBoard from './components/TaskBoard';
import TimesheetPortal from './components/TimesheetPortal';
import RosterWizard from './components/RosterWizard';
import NewStaffOnboardingModal from './components/NewStaffOnboardingModal';
import StaffPortal from './components/StaffPortal';
import PortalGateway from './components/PortalGateway';

// Manager-only screens, code-split so the common staff/day-to-day path
// doesn't have to download them upfront. Each is already conditionally
// mounted (currentTab === 'x' && ...), not always-mounted-but-hidden, so
// lazy() is safe here without causing a Suspense flash on initial load.
const TaskRegister = React.lazy(() => import('./components/TaskRegister'));
const ManagerDashboard = React.lazy(() => import('./components/ManagerDashboard'));
const Analytics = React.lazy(() => import('./components/Analytics'));
const EnterpriseAdmin = React.lazy(() => import('./components/EnterpriseAdmin'));
import { Sparkles, Calendar, ClipboardCheck, Clock, Loader2 } from 'lucide-react';
import {
  dbGetCollection,
  dbSetDoc,
  dbSaveListAtomic,
  dbDeleteDoc,
  dbGetDoc,
  dbGetCollectionByFacility,
  dbFindUserInFacilityByEmail,
  dbFindUserByEmail,
  seedCollectionFromLocalIfEmpty
} from './firebase';
import { isSuperuserEmail, resolveAccess } from './config/access';
import { useAuthGate } from './hooks/useAuthGate';
import { useFacilities } from './hooks/useFacilities';
import { useWorkspaceConfig, DEFAULT_TAXONOMY } from './hooks/useWorkspaceConfig';
import { useHydration } from './hooks/useHydration';

// --- Assignment engine helpers (Increment 1: availability + fairness) ---
// Codes that mean a staff member is NOT available for task assignment that day.
const ROTA_ABSENCE_CODES = ['OFF', 'AL', 'SL', 'CO', 'MD'];
const isWorkingCode = (code?: string): boolean => !!code && !ROTA_ABSENCE_CODES.includes(code);

// Build a per-staff task-count map from already-generated daily tasks, used to
// seed fairness so balancing accounts for work already on the board.
const buildLoadTally = (tasks: DailyTask[]): Record<string, number> => {
  const tally: Record<string, number> = {};
  tasks.forEach(t => { tally[t.staffName] = (tally[t.staffName] || 0) + 1; });
  return tally;
};

export default function App() {
  const toast = useToast();
  const confirm = useConfirm();

  // Write-only busy flag used around the Factory Reset purge — never
  // rendered anywhere, kept only so handleDeepAtomicPurge's existing
  // setIsSyncingFirebase calls keep compiling unchanged.
  const [, setIsSyncingFirebase] = useState<boolean>(false);

  const [currentTab, setCurrentTab] = useState('home');
  const [isManagerView, setIsManagerView] = useState(false);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [setupHidden, setSetupHidden] = useState(false);

  // Identity, sign-in, RBAC access tier, and "are they let in" gating — see useAuthGate.
  // (isRegisteredStaff/needsOnboarding/access-resolution need staffList, which
  // comes from useHydration below — computed further down once both are available.)
  const {
    firebaseUser,
    isFirebaseSyncEnabled,
    access, setAccess,
    isSandboxBypassActive,
    setIsSandboxBypassActive,
    confirmedIdentity,
    setConfirmedIdentity,
    handleGoogleSignIn,
    handleSignOut,
    isAuthorized,
  } = useAuthGate();

  // Connecteam Custom Configurations & Multi-tenant States
  const [currentDeptId, setCurrentDeptId] = useState<string>('');
  const [isSandboxStrictMode, setIsSandboxStrictMode] = useState<boolean>(false);

  const [isHydrated, setIsHydrated] = useState<boolean>(false);

  const [firebaseErrorBanner, setFirebaseErrorBanner] = useState<{message: string, link?: string} | null>(null);

  const handleGenericError = (error: any) => {
    console.error("Firebase Operation Error (caught):", error);
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('resource-exhausted') || msg.toLowerCase().includes('resource_exhausted')) {
      const projId = firebaseConfig.projectId || 'gen-lang-client-0706186972';
      const dbId = firebaseConfig.firestoreDatabaseId || 'ai-studio-edcd9041-8cfa-4252-8425-aec992679dde';
      setFirebaseErrorBanner({
        message: "Firestore Quota Exceeded (Read-Only Mode): The daily free-tier write units per project limit has been reached. Your changes are saved locally to your device and will sync when the quota resets tomorrow.",
        link: `https://console.firebase.google.com/project/${projId}/firestore/databases/${dbId}/data?openUpgradeDialog=true`
      });
    }
  };

  // Facilities + departments domain — see useFacilities.
  const {
    facilities,
    setFacilities,
    selectedFacilityId,
    setSelectedFacilityId,
    departments,
    setDepartments,
    handleCreateFacility,
    handleUpdateFacility,
    handleDeleteFacility,
    handleCreateDepartment,
    handleDeleteDepartment,
  } = useFacilities(firebaseUser, handleGenericError);

  // Per-facility workspace configuration (shifts, taxonomy, rules, regional) — see useWorkspaceConfig.
  const {
    shifts, setShifts,
    taxonomy, setTaxonomy,
    ruleSet, setRuleSet,
    taskCategories, setTaskCategories,
    facilityTypes, setFacilityTypes,
    timezoneLabel, setTimezoneLabel,
    regionPresetId, setRegionPresetId,
    holidays, setHolidays,
  } = useWorkspaceConfig(selectedFacilityId, isHydrated, firebaseUser);

  // Generates a day's worth of assigned tasks from staff/cycle/task-master
  // data. Used by several handlers below (with live cycleDates/holidays via
  // closure) and by useHydration (which passes its own freshly-loaded
  // dates/holidays explicitly instead — see the override params). Must be
  // defined before the useHydration() call below, since it's passed in as
  // an argument there.
  const generateDayTasks = (
    dateStr: string,
    uStaff: StaffMember[],
    uCycle: RosterCycle,
    uTasks: TaskMaster[],
    loadTally?: Record<string, number>, // optional: when provided, balances assignment by load and is mutated in place
    datesOverride?: string[],
    holidaysOverride?: PublicHoliday[]
  ): DailyTask[] => {
    const uDates = datesOverride ?? cycleDates;
    const uHolidays = holidaysOverride ?? holidays;
    const list: DailyTask[] = [];
    const dow = new Date(dateStr + 'T00:00:00').getDay();
    const dayIdx = uDates.length > 0 ? uDates.indexOf(dateStr) : -1;
    if (dayIdx === -1) return [];

    // Map shifts for easy lookup
    const shiftStaffMap: { [shift: string]: string[] } = {};
    const staffShiftMap: { [name: string]: string } = {};
    const staffByName: { [name: string]: StaffMember } = {};

    uStaff.forEach(s => {
      const code = uCycle.shifts[s.id]?.[dayIdx] || 'OFF';
      staffShiftMap[s.name] = code;
      staffByName[s.name] = s;
      // Only treat genuinely-working codes as available — exclude OFF and leave/absence.
      if (isWorkingCode(code)) {
        if (!shiftStaffMap[code]) shiftStaffMap[code] = [];
        shiftStaffMap[code].push(s.name);
      }
    });

    // Skills-based eligibility: a staffer qualifies if they hold every required skill.
    const hasRequiredSkills = (name: string, required: string[]): boolean => {
      if (!required || required.length === 0) return true;
      const owned = (staffByName[name]?.skills || []).map(x => x.toLowerCase().trim());
      return required.every(r => owned.includes(r.toLowerCase().trim()));
    };
    // Lowest-load picker (fairness) over a candidate list; deterministic when no tally.
    const pickFairest = (names: StaffMember[]): StaffMember | null => {
      if (names.length === 0) return null;
      return loadTally
        ? names.reduce((best, s) => ((loadTally[s.name] || 0) < (loadTally[best.name] || 0) ? s : best), names[0])
        : names[0];
    };

    const isWknd = dow === 0 || dow === 6;
    const isPH = isPublicHoliday(dateStr, uHolidays);
    const dateObj = new Date(dateStr + 'T00:00:00');
    const isLastDOM = dateObj.getDate() === new Date(dateObj.getFullYear(), dateObj.getMonth() + 1, 0).getDate();

    uTasks.forEach(task => {
      if (!task.active) return;

      // Filter daily vs weekly vs monthly
      let isDue = false;
      const weeklyDayMatch = task.frequency.match(/^Weekly \((\w+)\)$/);
      const monthlyDayMatch = task.frequency.match(/^Monthly \(Day (\d+)\)$/);

      if (task.frequency === 'Daily') isDue = true;
      else if (task.frequency.includes('Continuous')) isDue = true; // continuous trackers accumulate every day
      else if (task.frequency.includes('Last day')) isDue = isLastDOM;
      else if (weeklyDayMatch) isDue = dow === WEEKDAY_NAMES.indexOf(weeklyDayMatch[1]);
      else if (monthlyDayMatch) isDue = dateObj.getDate() === parseInt(monthlyDayMatch[1], 10);
      // Legacy fallbacks for tasks saved before per-day frequency existed.
      else if (task.frequency.includes('Sunday') && dow === 0) isDue = true;
      else if (task.frequency.includes('Monthly') && (isLastDOM || dow === 4)) isDue = true;

      if (!isDue) return;

      // Determine who to assign
      let assignees: { name: string; shift: string }[] = [];
      const required = task.requiredSkills || [];

      if (task.pattern === 'Auto') {
        // Smart auto-assign: one staffer = on shift ∩ has required skills ∩ (optional role) → fairest.
        const roleFilter = (task.assignedValue || '').trim();
        const candidates = uStaff.filter(s =>
          isWorkingCode(staffShiftMap[s.name])
          && (!roleFilter || s.role === roleFilter)
          && hasRequiredSkills(s.name, required)
        ).sort((a, b) => a.name.localeCompare(b.name));
        const assignee = pickFairest(candidates);
        if (assignee) assignees.push({ name: assignee.name, shift: staffShiftMap[assignee.name] || 'A' });
      } else if (task.pattern === 'Dispensing-rotate') {
        // Round-robin among available working staff who hold the required skills.
        const workingStaffForDay = uStaff.filter(s => isWorkingCode(staffShiftMap[s.name]) && hasRequiredSkills(s.name, required))
          .sort((a, b) => a.name.localeCompare(b.name));

        if (workingStaffForDay.length > 0) {
          const slot = parseInt(task.assignedValue) || 0;
          const dayOffset = Math.max(0, Math.round((new Date(dateStr + 'T00:00:00').getTime() - new Date(uCycle.startDate + 'T00:00:00').getTime()) / 864e5));
          const rotStart = (dayOffset + slot) % workingStaffForDay.length;
          // Rotate the candidate order so ties break deterministically and spread over time,
          // then pick the least-loaded (fairness) — falls back to pure rotation with no tally.
          const ordered = [...workingStaffForDay.slice(rotStart), ...workingStaffForDay.slice(0, rotStart)];
          const assignee = pickFairest(ordered)!;
          assignees.push({ name: assignee.name, shift: staffShiftMap[assignee.name] || 'A' });
        }
      } else if (task.pattern === 'Shift-based') {
        const tgtShift = task.assignedValue; // e.g. "Shift C", "Shift B" or raw code "C"
        const cleanS = tgtShift.replace('Shift ', '').trim();
        const names = shiftStaffMap[cleanS] || [];
        names.forEach(n => assignees.push({ name: n, shift: cleanS }));
      } else if (task.pattern === 'Linked') {
        // Dynamically find the linked master task assignee on that day
        const targetTask = uTasks.find(t => t.id === task.assignedValue || t.name === task.assignedValue);
        if (targetTask) {
          if (targetTask.pattern === 'Manager-assign' || targetTask.pattern === 'Collab') {
            const names = (targetTask.managerAssignedName || '').split(',').map(n => n.trim());
            names.forEach(n => {
              if (n && isWorkingCode(staffShiftMap[n])) {
                assignees.push({ name: n, shift: staffShiftMap[n] });
              }
            });
          } else if (targetTask.pattern === 'Person-specific') {
            const specName = targetTask.assignedValue;
            if (specName && isWorkingCode(staffShiftMap[specName])) {
              assignees.push({ name: specName, shift: staffShiftMap[specName] });
            }
          }
        }
      } else if (task.pattern === 'Collab') {
        const names = (task.managerAssignedName || '').split(',').map(n => n.trim());
        names.forEach(n => {
          if (n && isWorkingCode(staffShiftMap[n])) {
            assignees.push({ name: n, shift: staffShiftMap[n] });
          }
        });
      } else if (task.pattern === 'Manager-assign') {
        const names = (task.managerAssignedName || '').split(',').map(n => n.trim());
        names.forEach(n => {
          if (n && isWorkingCode(staffShiftMap[n])) {
            assignees.push({ name: n, shift: staffShiftMap[n] });
          }
        });
      } else if (task.pattern === 'Person-specific') {
        const specName = task.assignedValue;
        if (specName && isWorkingCode(staffShiftMap[specName])) {
          assignees.push({ name: specName, shift: staffShiftMap[specName] });
        }
      } else if (task.pattern === 'Role-group') {
        const targetRole = task.assignedValue;
        uStaff.forEach(s => {
          if (s.role === targetRole && isWorkingCode(staffShiftMap[s.name]) && hasRequiredSkills(s.name, required)) {
            assignees.push({ name: s.name, shift: staffShiftMap[s.name] });
          }
        });
      }

      assignees.forEach(a => {
        list.push({
          id: `dt-${task.id}-${a.name}-${dateStr}`,
          date: dateStr,
          staffName: a.name,
          taskName: task.name,
          category: task.category,
          shiftCode: a.shift,
          priority: task.priority,
          status: 'Pending',
          compliance: task.compliance,
          isTracker: task.frequency.includes('Continuous'),
          trackerTarget: task.trackerTarget,
          trackerValue: task.trackerValue,
          customFields: task.customFields,
          customFieldsData: {}
        });
        // Fairness bookkeeping: count every assignment so rotation balances total load.
        if (loadTally) loadTally[a.name] = (loadTally[a.name] || 0) + 1;
      });
    });

    return list;
  };

  // Operational data domain (staff, roster cycle, tasks, daily tasks,
  // approvals, extra hours, timesheets) + the one big hydration effect that
  // loads it all — see useHydration. The riskiest piece of the original god
  // component, deliberately tackled last.
  const {
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
  } = useHydration({
    selectedFacilityId, setSelectedFacilityId, firebaseUser, setIsHydrated,
    setFacilities, setDepartments, setHolidays, setShifts,
    setRuleSet, setTaskCategories, setFacilityTypes, setTimezoneLabel, setRegionPresetId,
    setTaxonomy, handleGenericError, generateDayTasksFn: generateDayTasks,
  });

  // isRegisteredStaff/needsOnboarding/access-tier resolution need staffList
  // (from useHydration, above) and firebaseUser (from useAuthGate) — computed
  // here rather than inside either hook, since each hook's inputs can't
  // depend on the other's outputs.
  const isRegisteredStaff = staffList.some(s => s.email?.toLowerCase().trim() === firebaseUser?.email?.toLowerCase().trim());
  const needsOnboarding = !!(firebaseUser && !isRegisteredStaff);

  useEffect(() => {
    if (!firebaseUser) {
      setAccess({ accessLevel: 'staff', email: '' });
      return;
    }
    let resolved = resolveAccess(firebaseUser.email, staffList);
    (async () => {
      // Durable super-admin grants (see firestore.rules platformAdmins) live
      // outside the staff/facility model entirely, so resolveAccess can't see
      // them on its own — check separately and upgrade if granted.
      if (resolved.accessLevel !== 'superuser') {
        const grant = await dbGetDoc<{ id: string }>('platformAdmins', firebaseUser.uid);
        if (grant) {
          resolved = { ...resolved, accessLevel: 'superuser' };
        }
      }
      setAccess(resolved);
      dbSetDoc('users', firebaseUser.uid, {
        id: firebaseUser.uid,
        email: resolved.email,
        accessLevel: resolved.accessLevel,
        facilityId: resolved.facilityId || '',
        departmentId: resolved.departmentId || '',
      }).catch(() => {});
    })();
  }, [firebaseUser, staffList]);

  // Finalizes an access-level grant a manager already made on a staff
  // record (staff/{id}.accessLevel — always correctly gated). That alone
  // doesn't take effect in the target's own session: their users/{uid}
  // mirror only changes via this explicit, separate write, performed by
  // the manager, once the target has an account to find by email. Run on
  // demand from Settings > People rather than silently in the background.
  const handleSyncGrantedAccess = async (): Promise<{ synced: number; pending: number }> => {
    if (!firebaseUser || !selectedFacilityId) return { synced: 0, pending: 0 };
    let synced = 0;
    let pending = 0;
    for (const s of staffList) {
      const intended = s.accessLevel || (s.isManager ? 'facility_manager' : 'staff');
      if (intended === 'staff' || !s.email) continue;
      const match = await dbFindUserInFacilityByEmail<{ id: string; accessLevel: string }>(s.email, selectedFacilityId);
      if (!match) { pending++; continue; }
      if (match.accessLevel !== intended) {
        await dbSetDoc('users', match.id, {
          id: match.id,
          email: s.email,
          accessLevel: intended,
          facilityId: selectedFacilityId,
          departmentId: s.departmentId || '',
        }).catch(() => {});
        synced++;
      }
    }
    return { synced, pending };
  };

  // Durable super-admin management (Settings > Advanced, super users only).
  // platformAdmins is the in-app replacement for editing SUPERUSER_EMAILS in
  // source — see firestore.rules for the actual enforcement.
  const [platformAdmins, setPlatformAdmins] = useState<{ id: string; email?: string }[]>([]);
  useEffect(() => {
    if (!firebaseUser || access.accessLevel !== 'superuser') return;
    dbGetCollection<{ id: string; email?: string }>('platformAdmins').then(setPlatformAdmins).catch(() => {});
  }, [firebaseUser, access.accessLevel]);

  const handleGrantPlatformAdmin = async (email: string): Promise<'granted' | 'not_found' | 'already'> => {
    const match = await dbFindUserByEmail<{ id: string; email?: string }>(email.trim().toLowerCase());
    if (!match) return 'not_found';
    if (platformAdmins.some(a => a.id === match.id)) return 'already';
    await dbSetDoc('platformAdmins', match.id, { id: match.id, email: match.email, grantedBy: firebaseUser?.email || '', grantedAt: new Date().toISOString() });
    setPlatformAdmins([...platformAdmins, { id: match.id, email: match.email }]);
    return 'granted';
  };

  const handleRevokePlatformAdmin = async (uid: string) => {
    await dbDeleteDoc('platformAdmins', uid);
    setPlatformAdmins(platformAdmins.filter(a => a.id !== uid));
  };

  // Self onboarding profile handler
  const handleSelfOnboard = async (newStaff: StaffMember) => {
    const updatedStaff = [...staffList, newStaff];
    setStaffList(updatedStaff);
    setActiveStaffId(newStaff.id);
    setIsManagerView(newStaff.isManager);
    
    // Switch key context if facility is different
    if (newStaff.facilityId && newStaff.facilityId !== selectedFacilityId) {
      setSelectedFacilityId(newStaff.facilityId);
    }
    
    // Save to Firestore and local storage cache
    persistState('staff_list', updatedStaff);
    localStorage.setItem(facilityKey(newStaff.facilityId, 'active_staff_id'), newStaff.id);
  };

  const handleOnboardNewStaff = (newStaff: StaffMember) => {
    const updatedStaff = [...staffList, newStaff];
    setStaffList(updatedStaff);
    persistState('staff_list', updatedStaff);
  };

  // Sandbox Persona simulator
  const handleSelectSandboxBypass = (staffId: string) => {
    setIsSandboxBypassActive(true);
    if (staffId === 'demo-member') {
      const staffMember = staffList.find(s => !s.isManager);
      if (staffMember) {
        setActiveStaffId(staffMember.id);
        setIsManagerView(false);
        localStorage.setItem(facilityKey(selectedFacilityId, 'active_staff_id'), staffMember.id);
      } else {
        // Fallback or guest staff on the fly
        const guestStaff: StaffMember = {
          id: 'guest-staff-silo',
          name: 'Demo Staff',
          email: 'staff@example.com',
          role: 'Emulated Staff',
          facilityId: selectedFacilityId,
          phone: '',
          contractedHours: 168,
          gender: 'M',
          fullName: 'Emulated Practice Staff',
          employeeNo: 'EMP-DEMO',
          isManager: false
        };
        const updated = [...staffList, guestStaff];
        setStaffList(updated);
        setActiveStaffId(guestStaff.id);
        setIsManagerView(false);
        persistState('staff_list', updated);
        localStorage.setItem(facilityKey(selectedFacilityId, 'active_staff_id'), guestStaff.id);
      }
    } else {
      setActiveStaffId(staffId);
      const matched = staffList.find(s => s.id === staffId);
      if (matched) {
        setIsManagerView(matched.isManager);
      }
      localStorage.setItem(facilityKey(selectedFacilityId, 'active_staff_id'), staffId);
    }
  };

  const handleBypassAsGuestManager = () => {
    setIsSandboxBypassActive(true);
    setIsManagerView(true);
    // Auto find an existing manager or create one
    const manager = staffList.find(s => s.isManager);
    if (manager) {
      setActiveStaffId(manager.id);
    }
  };

  // Synchronously seed and reconcile timesheets whenever staffList or activeCycle changes (Only post-hydration)
  useEffect(() => {
    if (!isHydrated || !selectedFacilityId || !activeCycle || staffList.length === 0) return;
    
    setTimesheets(currentTimesheets => {
      let timesheetChanged = false;
      const updatedTimesheets = [...currentTimesheets];
      
      staffList.forEach(staff => {
        const tsIndex = updatedTimesheets.findIndex(t => t.staffId === staff.id && t.cycleId === activeCycle.id);
        if (tsIndex === -1) {
          const defaultTs = generateDefaultTimesheet(staff, activeCycle, cycleDates, holidays);
          updatedTimesheets.push(defaultTs);
          timesheetChanged = true;
          return;
        }

        // Keep an already-created timesheet's scheduled shifts in sync with
        // later roster edits — otherwise a shift change made after the
        // timesheet's first generation would never show up here, and
        // would look like the roster "lost" it. Submitted/Approved
        // timesheets are a frozen record and are intentionally left alone.
        const existing = updatedTimesheets[tsIndex];
        if (existing.status === 'Draft') {
          const { timesheet, changed } = reconcileTimesheetWithRoster(existing, activeCycle, staff.id, cycleDates, holidays);
          if (changed) {
            updatedTimesheets[tsIndex] = timesheet;
            timesheetChanged = true;
          }
        }
      });
      
      // Clean up timesheets for staff members who are no longer in the staffList
      const cleanedTimesheets = updatedTimesheets.filter(t => 
        staffList.some(s => s.id === t.staffId)
      );
      if (cleanedTimesheets.length !== updatedTimesheets.length) {
        timesheetChanged = true;
      }
      
      if (timesheetChanged) {
        localStorage.setItem(facilityKey(selectedFacilityId, 'timesheets_list'), JSON.stringify(cleanedTimesheets));
        if (firebaseUser) {
          const toWrite = cleanedTimesheets.filter(t => {
            const prev = currentTimesheets.find(p => p.id === t.id);
            return !prev || JSON.stringify(prev) !== JSON.stringify(t);
          });
          const toDelete = currentTimesheets.filter(p => !cleanedTimesheets.some(t => t.id === p.id));

          toDelete.forEach((del) => {
            dbDeleteDoc('timesheets', del.id).catch(err => {
              console.error("Firestore timesheet cascading delete failure:", err);
              handleGenericError(err);
            });
          });

          toWrite.forEach(ts => {
            dbSetDoc('timesheets', ts.id, { ...ts, facilityId: (ts as any).facilityId || selectedFacilityId }).catch(err => {
              console.error("Firestore timesheet cascading sync failure:", err);
              handleGenericError(err);
            });
          });
        }
        return cleanedTimesheets;
      }
      return currentTimesheets;
    });
  }, [staffList, activeCycle, selectedFacilityId, cycleDates, holidays, firebaseUser, isHydrated]);

  // Sync active user profile back with facility partition
  useEffect(() => {
    if (activeStaffId && selectedFacilityId) {
      localStorage.setItem(facilityKey(selectedFacilityId, 'active_staff_id'), activeStaffId);
    }
  }, [activeStaffId, selectedFacilityId]);

  // Sync staffList with Firestore only on actual changes post-hydration
  useEffect(() => {
    if (isHydrated && selectedFacilityId && staffList) {
      if (staffListRef.current !== null && staffListRef.current !== staffList) {
        persistState('staff_list', staffList);
      }
      staffListRef.current = staffList;
    }
  }, [staffList, selectedFacilityId, isHydrated]);

  // Re-verify and auto-align activeStaffId when staffList changes during session
  useEffect(() => {
    if (isHydrated && staffList) {
      if (staffList.length === 0) {
        if (activeStaffId !== '') {
          setActiveStaffId('');
          localStorage.removeItem(facilityKey(selectedFacilityId, 'active_staff_id'));
        }
      } else if (!staffList.some(s => s.id === activeStaffId)) {
        const fallback = staffList.find(s => s.isManager) || staffList[0];
        if (fallback) {
          setActiveStaffId(fallback.id);
        } else {
          setActiveStaffId('');
        }
      }
    }
  }, [staffList, isHydrated, activeStaffId, selectedFacilityId]);

  // Privileges follow the resolved access tier (from the authenticated email),
  // not a manual toggle. Staff get the staff view; anyone above gets manager tools.
  useEffect(() => {
    if (firebaseUser) {
      setIsManagerView(access.accessLevel !== 'staff');
    }
  }, [access.accessLevel, firebaseUser]);

  // Restore whether the setup checklist was hidden for the active workspace.
  useEffect(() => {
    try {
      setSetupHidden(localStorage.getItem(setupHiddenKey(selectedFacilityId)) === '1');
    } catch {
      setSetupHidden(false);
    }
  }, [selectedFacilityId]);

  // One-time friendly welcome that points a manager at the Get started checklist.
  useEffect(() => {
    if (!isHydrated || !isManagerView || !selectedFacilityId) return;
    const rosterPlanned = !!activeCycle && Object.values(activeCycle.shifts || {}).some((a: any) => Array.isArray(a) && a.some((c: string) => c && c !== 'OFF'));
    const setupComplete = staffList.length > 0 && rosterPlanned && taskMasterList.length > 0 && dailyTasks.length > 0;
    if (setupComplete) return;
    try {
      if (localStorage.getItem(welcomedKey(selectedFacilityId)) === '1') return;
      localStorage.setItem(welcomedKey(selectedFacilityId), '1');
    } catch { return; }
    toast.success('Welcome! Follow the “Get started” steps on your dashboard to set up your workspace.');
  }, [isHydrated, isManagerView, selectedFacilityId, staffList.length, taskMasterList.length, dailyTasks.length, activeCycle]);

  // Safety guard: if the active tab is privileged but the user isn't a manager, redirect home.
  useEffect(() => {
    const managerOnlyTabs = ['manager', 'admin', 'register', 'analytics'];
    if (managerOnlyTabs.includes(currentTab) && !isManagerView && staffList.length > 0) {
      setCurrentTab('home');
    }
  }, [currentTab, isManagerView, staffList]);

  // Strict Data Isolation selectors
  const displayedStaffList = isSandboxStrictMode && currentDeptId
    ? staffList.filter(s => s.departmentId === currentDeptId)
    : staffList;

  const displayedDailyTasks = isSandboxStrictMode && currentDeptId
    ? dailyTasks.filter(t => displayedStaffList.some(s => s.name === t.staffName))
    : dailyTasks;

  const displayedTimesheets = isSandboxStrictMode && currentDeptId
    ? timesheets.filter(t => displayedStaffList.some(s => s.id === t.staffId))
    : timesheets;

  // First-run setup wizard completion: provision the first facility + workspace config.
  const handleCompleteSetup = (data: {
    facility: Facility;
    config: WorkspaceConfig;
    departments: Department[];
    staff: StaffMember[];
  }) => {
    const { facility, config, departments: depts, staff } = data;

    // Facility
    const updatedFacs = [...facilities, facility];
    setFacilities(updatedFacs);
    localStorage.setItem(GLOBAL_KEYS.facilitiesList, JSON.stringify(updatedFacs));

    // Workspace config → individual states + persisted bundle
    setShifts(config.shifts);
    setRuleSet(config.ruleSet);
    setTaskCategories(config.taskCategories);
    setFacilityTypes(config.facilityTypes);
    setHolidays(config.holidays);
    setTimezoneLabel(config.timezoneLabel);
    setRegionPresetId(config.regionPresetId);
    setTaxonomy(config.taxonomy);
    localStorage.setItem(facilityKey(facility.id, 'custom_shifts'), JSON.stringify(config.shifts));
    localStorage.setItem(facilityKey(facility.id, 'taxonomy'), JSON.stringify(config.taxonomy));
    localStorage.setItem(facilityKey(facility.id, 'holidays'), JSON.stringify(config.holidays));
    localStorage.setItem(facilityKey(facility.id, 'config'), JSON.stringify({
      ruleSet: config.ruleSet,
      taskCategories: config.taskCategories,
      facilityTypes: config.facilityTypes,
      timezoneLabel: config.timezoneLabel,
      regionPresetId: config.regionPresetId,
    }));

    // Departments
    const scopedDepts = depts.map(d => ({ ...d, facilityId: facility.id }));
    if (scopedDepts.length) {
      setDepartments(scopedDepts);
      localStorage.setItem(GLOBAL_KEYS.departments, JSON.stringify(scopedDepts));
    }

    // Staff
    const scopedStaff = staff.map(s => ({ ...s, facilityId: facility.id }));
    setStaffList(scopedStaff);
    localStorage.setItem(facilityKey(facility.id, 'staff_list'), JSON.stringify(scopedStaff));

    // Cloud writes (best effort)
    if (firebaseUser) {
      dbSetDoc('facilities', facility.id, facility).catch(handleGenericError);
      dbSetDoc('workspaceConfigs', facility.id, { id: facility.id, ruleSet: config.ruleSet, taskCategories: config.taskCategories, facilityTypes: config.facilityTypes, timezoneLabel: config.timezoneLabel, regionPresetId: config.regionPresetId }).catch(() => {});
      scopedDepts.forEach(d => dbSetDoc('departments', d.id, d).catch(() => {}));
      scopedStaff.forEach(s => dbSetDoc('staff', s.id, s).catch(() => {}));
    }

    // Activate the new workspace (triggers hydration with the seeded data present)
    setSelectedFacilityId(facility.id);
  };

  const persistState = (key: 'staff_list' | 'active_cycle' | 'task_master' | 'daily_tasks' | 'approvals' | 'extra_hours_log', data: any) => {
    mirrorLegacyFacilityKey(selectedFacilityId, key, data);
    if (selectedFacilityId) {
      localStorage.setItem(facilityKey(selectedFacilityId, key), JSON.stringify(data));
    }

    // --- SECURE REAL-TIME CLOUD PROPAGATION ---
    if (firebaseUser) {
      // Tag every cloud doc with its facility for per-tenant isolation in the rules.
      const withFac = (o: any) => ({ ...o, facilityId: o.facilityId || selectedFacilityId });
      if (key === 'staff_list') {
        const prevStaff = lastStaffListRef.current;
        const toWrite = data.filter((item: StaffMember) => {
          const prev = prevStaff.find(p => p.id === item.id);
          return !prev || JSON.stringify(prev) !== JSON.stringify(item);
        });
        const toDelete = prevStaff.filter(p => p.facilityId === selectedFacilityId && !data.some((item: StaffMember) => item.id === p.id));

        toDelete.forEach((del) => {
          dbDeleteDoc('staff', del.id).catch(err => {
            console.error(`Failed to delete orphaned staff ${del.id} from cloud:`, err);
            handleGenericError(err);
          });
        });

        toWrite.forEach((item: StaffMember) => {
          dbSetDoc('staff', item.id, item).catch(handleGenericError);
        });

        lastStaffListRef.current = data;
      } else if (key === 'active_cycle') {
        dbSetDoc('cycles', data.id || `cycle-${selectedFacilityId}-2026-06-15`, withFac(data)).catch(handleGenericError);
      } else if (key === 'task_master') {
        const prevTasks = lastTaskMasterListRef.current;
        const toWrite = data.filter((item: TaskMaster) => {
          const prev = prevTasks.find(p => p.id === item.id);
          return !prev || JSON.stringify(prev) !== JSON.stringify(item);
        });
        const toDelete = prevTasks.filter(p => !data.some((item: TaskMaster) => item.id === p.id));

        toDelete.forEach((del) => {
          dbDeleteDoc('taskMasters', del.id).catch(handleGenericError);
        });

        toWrite.forEach((item: TaskMaster) => {
          dbSetDoc('taskMasters', item.id, withFac(item)).catch(handleGenericError);
        });

        lastTaskMasterListRef.current = data;
      } else if (key === 'daily_tasks') {
        const prevDaily = lastDailyTasksRef.current;
        const toWrite = data.filter((item: DailyTask) => {
          const prev = prevDaily.find(p => p.id === item.id);
          return !prev || JSON.stringify(prev) !== JSON.stringify(item);
        });
        const toDelete = prevDaily.filter(p => !data.some((item: DailyTask) => item.id === p.id));

        toDelete.forEach((del) => {
          dbDeleteDoc('dailyTasks', del.id).catch(handleGenericError);
        });

        toWrite.forEach((item: DailyTask) => {
          dbSetDoc('dailyTasks', item.id, withFac(item)).catch(handleGenericError);
        });

        lastDailyTasksRef.current = data;
      } else if (key === 'approvals') {
        const prevApprovals = lastApprovalsRef.current;
        const toWrite = data.filter((item: ApprovalRequest) => {
          const prev = prevApprovals.find(p => p.id === item.id);
          return !prev || JSON.stringify(prev) !== JSON.stringify(item);
        });
        const toDelete = prevApprovals.filter(p => !data.some((item: ApprovalRequest) => item.id === p.id));

        toDelete.forEach((del) => {
          dbDeleteDoc('approvals', del.id).catch(handleGenericError);
        });

        toWrite.forEach((item: ApprovalRequest) => {
          dbSetDoc('approvals', item.id, withFac(item)).catch(handleGenericError);
        });

        lastApprovalsRef.current = data;
      } else if (key === 'extra_hours_log') {
        const prevExtra = lastExtraHoursLogRef.current;
        const toWrite = data.filter((item: ExtraHoursEntry) => {
          const prev = prevExtra.find(p => p.id === item.id);
          return !prev || JSON.stringify(prev) !== JSON.stringify(item);
        });
        const toDelete = prevExtra.filter(p => !data.some((item: ExtraHoursEntry) => item.id === p.id));

        toDelete.forEach((del) => {
          dbDeleteDoc('extraHours', del.id).catch(handleGenericError);
        });

        toWrite.forEach((item: ExtraHoursEntry) => {
          dbSetDoc('extraHours', item.id, withFac(item)).catch(handleGenericError);
        });

        lastExtraHoursLogRef.current = data;
      }
    }
  };

  // When a manager clicks a person in the dashboard's workload summary,
  // jump to the Task Board pre-filtered to that person's tasks.
  const [taskBoardFocusStaff, setTaskBoardFocusStaff] = useState<string | null>(null);
  const handleFocusStaffInTasks = (staffName: string) => {
    setTaskBoardFocusStaff(staffName);
    handleNavigation('tasks');
  };

  // When a manager clicks the dashboard's Overdue, Blocked, or Review stat,
  // jump to the Task Board with that tab already selected.
  const [taskBoardJumpTab, setTaskBoardJumpTab] = useState<'OVERDUE' | 'BLOCKED' | 'REVIEW' | null>(null);
  const handleViewOverdueTasks = () => {
    setTaskBoardJumpTab('OVERDUE');
    handleNavigation('tasks');
  };
  const handleViewBlockedTasks = () => {
    setTaskBoardJumpTab('BLOCKED');
    handleNavigation('tasks');
  };
  const handleViewReviewTasks = () => {
    setTaskBoardJumpTab('REVIEW');
    handleNavigation('tasks');
  };

  // Generate Daily chores for a specific selected date
  // Switch tabs cleanly and auto-populate today's board if needed
  const handleNavigation = (tabId: string) => {
    setCurrentTab(tabId);
    if (tabId === 'tasks') {
      const todayStr = new Date().toISOString().split('T')[0];
      const hasTodayTasks = dailyTasks.some(t => t.date === todayStr);
      if (!hasTodayTasks && activeCycle) {
        // generate daily tasks for today (balanced against work already on the board)
        const loadTally = buildLoadTally(dailyTasks);
        const generated = generateDayTasks(todayStr, staffList, activeCycle, taskMasterList, loadTally);
        // keep already stored finished ones
        const combined = [...generated.filter(g => !dailyTasks.some(d => d.id === g.id)), ...dailyTasks];
        setDailyTasks(combined);
        localStorage.setItem(facilityKey(selectedFacilityId, 'daily_tasks'), JSON.stringify(combined));
        mirrorLegacyFacilityKey(selectedFacilityId, 'daily_tasks', combined);
      }
    }
  };

  // Inline grid shift update
  const handleUpdateShift = (staffId: string, dayIdx: number, newShiftCode: string) => {
    if (!activeCycle) return;

    const updatedCycle = { ...activeCycle };
    if (!updatedCycle.shifts[staffId]) {
      updatedCycle.shifts[staffId] = new Array(cycleDates.length).fill('OFF');
    }
    updatedCycle.shifts[staffId][dayIdx] = newShiftCode;

    setActiveCycle(updatedCycle);
    localStorage.setItem(facilityKey(selectedFacilityId, 'active_cycle'), JSON.stringify(updatedCycle));
    persistState('active_cycle', updatedCycle);
  };

  const handleBulkUpdateShifts = (updates: { staffId: string; dayIdx: number; shiftCode: string }[]) => {
    if (!activeCycle) return;

    const updatedCycle = { ...activeCycle };
    updates.forEach(({ staffId, dayIdx, shiftCode }) => {
      if (!updatedCycle.shifts[staffId]) {
        updatedCycle.shifts[staffId] = new Array(cycleDates.length).fill('OFF');
      }
      updatedCycle.shifts[staffId][dayIdx] = shiftCode;
    });

    setActiveCycle(updatedCycle);
    localStorage.setItem(facilityKey(selectedFacilityId, 'active_cycle'), JSON.stringify(updatedCycle));
    persistState('active_cycle', updatedCycle);
  };

  const handleRestoreCycle = (newCycle: RosterCycle) => {
    setActiveCycle(newCycle);
    const newDates = getDatesForCycle(newCycle.startDate);
    setCycleDates(newDates);
    localStorage.setItem(facilityKey(selectedFacilityId, 'cycle_dates'), JSON.stringify(newDates));
    localStorage.setItem(facilityKey(selectedFacilityId, 'active_cycle'), JSON.stringify(newCycle));
    persistState('active_cycle', newCycle);
  };

  const handleUpdateCycleDates = (startDate: string, endDate: string) => {
    if (!activeCycle) return;
    
    // Generate new dates list
    const newDates = getDatesForCycle(startDate, endDate);
    
    // Align current shifts to new dates
    const alignedShifts = alignShiftsToNewDates(activeCycle.shifts, cycleDates, newDates);
    
    const updatedCycle: RosterCycle = {
      ...activeCycle,
      startDate,
      endDate,
      shifts: alignedShifts
    };
    
    setActiveCycle(updatedCycle);
    setCycleDates(newDates);
    
    // Persist to local storage & cloud
    localStorage.setItem(facilityKey(selectedFacilityId, 'cycle_dates'), JSON.stringify(newDates));
    localStorage.setItem(facilityKey(selectedFacilityId, 'active_cycle'), JSON.stringify(updatedCycle));
    persistState('active_cycle', updatedCycle);
  };

  const handleDeepAtomicPurge = async () => {
    try {
      setIsSyncingFirebase(true);

      // 1. Purge LocalStorage keys
      const keysToClear = [
        facilityKey(selectedFacilityId, 'staff_list'),
        facilityKey(selectedFacilityId, 'active_cycle'),
        facilityKey(selectedFacilityId, 'task_master'),
        facilityKey(selectedFacilityId, 'daily_tasks'),
        facilityKey(selectedFacilityId, 'approvals'),
        facilityKey(selectedFacilityId, 'extra_hours_log'),
        facilityKey(selectedFacilityId, 'timesheets_list'),
        facilityKey(selectedFacilityId, 'cycle_dates'),
        facilityKey(selectedFacilityId, 'taxonomy'),
        facilityKey(selectedFacilityId, 'custom_shifts'),
        'kmh_staff_list',
        'kmh_active_cycle',
        'kmh_task_master',
        'kmh_daily_tasks',
        'kmh_approvals',
        'kmh_extra_hours_log',
        GLOBAL_KEYS.facilitiesList,
        GLOBAL_KEYS.departments
      ];
      keysToClear.forEach(key => localStorage.removeItem(key));
      localStorage.setItem(seededFlagKey(selectedFacilityId), 'true');

      // 2. Clear Firestore Database if user context exists
      if (firebaseUser) {
        const collectionsToPurge = [
          'staff',
          'cycles',
          'taskMasters',
          'dailyTasks',
          'approvals',
          'extraHours',
          'timesheets',
          'departments'
        ];
        
        for (const colName of collectionsToPurge) {
          try {
            // Tenant-scoped read: an unscoped collection list here would be
            // rejected by Firestore rules for any non-super user (these
            // collections all require a facilityId-matching query).
            const docs = await dbGetCollectionByFacility<any>(colName, selectedFacilityId);
            for (const d of docs) {
              if (d.id) {
                await dbDeleteDoc(colName, d.id);
              }
            }
          } catch (e) {
            console.warn(`Could not purge cloud collection "${colName}":`, e);
          }
        }
        await dbSetDoc('systemConfig', 'status', { id: 'status', seeded: true });
      }

      // 3. Reset React State
      setStaffList([]);
      setTaskMasterList([]);
      setDailyTasks([]);
      setApprovals([]);
      setExtraHoursLog([]);
      setTimesheets([]);
      setDepartments([]);
      setActiveCycle(null);
      setCycleDates([]);
      
      // 5. Force browser page reload to land the user back into onboarding/portal gateway with full fresh states
      window.location.reload();
    } catch (err) {
      console.error('Deep purge failed:', err);
      toast.error('Data reset partially failed. Please check your cloud permissions or try again.');
    } finally {
      setIsSyncingFirebase(false);
    }
  };

  // Background Auto-scheduler Utility for seamless 3-day shift task rollover
  useEffect(() => {
    if (activeCycle && staffList.length > 0 && taskMasterList.length > 0 && cycleDates.length > 0 && dailyTasks.length > 0) {
      const today = new Date();
      let combined = [...dailyTasks];
      let updated = false;
      // One shared tally across the days we generate so load balances cycle-wide.
      const loadTally = buildLoadTally(dailyTasks);

      for (let i = 0; i < 3; i++) {
        const targetDate = new Date();
        targetDate.setDate(today.getDate() + i);
        const targetDateStr = targetDate.toISOString().split('T')[0];
        
        const dayIdx = cycleDates.indexOf(targetDateStr);
        if (dayIdx === -1) continue;
        
        const alreadyExists = dailyTasks.some(t => t.date === targetDateStr);
        if (!alreadyExists) {
          const dayTasks = generateDayTasks(targetDateStr, staffList, activeCycle, taskMasterList, loadTally);
          if (dayTasks.length > 0) {
            combined = [...dayTasks, ...combined];
            updated = true;
          }
        }
      }
      
      if (updated) {
        setDailyTasks(combined);
        localStorage.setItem(facilityKey(selectedFacilityId, 'daily_tasks'), JSON.stringify(combined));
        persistState('daily_tasks', combined);
      }
    }
  }, [activeCycle, staffList, taskMasterList, cycleDates, dailyTasks.length, selectedFacilityId]);

  const handlePreGenerate7DaysTasks = () => {
    if (!activeCycle) {
      return { success: false, message: 'No active roster cycle loaded.', generatedDates: [], skippedDates: [] };
    }
    
    const today = new Date();
    const generatedDates: string[] = [];
    const skippedDates: string[] = [];
    let totalGeneratedCount = 0;
    let combined = [...dailyTasks];
    // Shared fairness tally across the 7-day generation window.
    const loadTally = buildLoadTally(dailyTasks);

    for (let i = 0; i < 7; i++) {
      const targetDate = new Date();
      targetDate.setDate(today.getDate() + i);
      const targetDateStr = targetDate.toISOString().split('T')[0];
      
      const dayIdx = cycleDates.indexOf(targetDateStr);
      if (dayIdx === -1) {
        skippedDates.push(targetDateStr);
        continue;
      }
      
      const alreadyExists = dailyTasks.some(t => t.date === targetDateStr);
      if (alreadyExists) {
        skippedDates.push(`${targetDateStr} (Has tasks)`);
        continue;
      }
      
      const dayTasks = generateDayTasks(targetDateStr, staffList, activeCycle, taskMasterList, loadTally);
      if (dayTasks.length > 0) {
        combined = [...dayTasks, ...combined];
        totalGeneratedCount += dayTasks.length;
        generatedDates.push(targetDateStr);
      }
    }
    
    if (totalGeneratedCount > 0) {
      setDailyTasks(combined);
      localStorage.setItem(facilityKey(selectedFacilityId, 'daily_tasks'), JSON.stringify(combined));
      persistState('daily_tasks', combined);
      return {
        success: true,
        message: `Successfully generated ${totalGeneratedCount} tasks for ${generatedDates.length} upcoming days.`,
        generatedDates,
        skippedDates
      };
    } else {
      return {
        success: false,
        message: 'No new tasks were generated. Next 7 days are either already generated or fall outside of the active roster cycle.',
        generatedDates,
        skippedDates
      };
    }
  };

  // Trigger setup Optimizer wizard
  const handleRosterGenerate = (absences: AbsenceLog[], scTeamSize: number, dateRange?: { startDate: string; endDate: string }) => {
    if (staffList.length === 0) {
      toast.error('Add at least one team member before building a roster.');
      return;
    }

    // Use the wizard-chosen dates, else the active cycle's, else the default window
    // (so a brand-new workspace can create its first roster here).
    const startDate = dateRange?.startDate || activeCycle?.startDate || '2026-06-15';
    const endDate = dateRange?.endDate || activeCycle?.endDate || '2026-07-14';
    const dates = dateRange
      ? getDatesForCycle(startDate, endDate)
      : ((cycleDates && cycleDates.length > 0) ? cycleDates : getDatesForCycle(startDate));

    // Convert absences to daily fast lookup map
    const mappedAbsences: { [staffId: string]: { [date: string]: string } } = {};
    staffList.forEach(s => {
      mappedAbsences[s.id] = {};
    });

    absences.forEach(log => {
      const sMember = staffList.find(staff => staff.name === log.staffName);
      if (!sMember) return;

      // Span dates between start and end
      const start = new Date(log.startDate);
      const end = new Date(log.endDate);
      const current = new Date(start);

      while (current <= end) {
        const dateStr = current.toISOString().split('T')[0];
        if (dates.includes(dateStr)) {
          mappedAbsences[sMember.id][dateStr] = log.type;
        }
        current.setDate(current.getDate() + 1);
      }
    });

    // Run Optimizer with the workspace ruleset; honor the wizard's stock-count
    // team size by overriding any 'last-day' auto-assignment count.
    const effectiveRuleSet: RosterRuleSet = {
      ...ruleSet,
      autoAssignments: (ruleSet.autoAssignments || []).map(a =>
        a.trigger === 'last-day' ? { ...a, count: scTeamSize } : a
      ),
    };
    const suggestedShifts = runSmartPersonaOptimizer(staffList, dates, holidays, mappedAbsences, effectiveRuleSet);

    const updatedCycle: RosterCycle = {
      id: activeCycle?.id || `cycle-${selectedFacilityId}-${startDate}`,
      startDate,
      endDate,
      shifts: suggestedShifts,
      isLocked: false // draft state
    };

    // Set the date window when creating the first cycle, or when the wizard chose dates.
    if (dateRange || !cycleDates || cycleDates.length === 0) {
      setCycleDates(dates);
      try { localStorage.setItem(facilityKey(selectedFacilityId, 'cycle_dates'), JSON.stringify(dates)); } catch {}
    }
    setActiveCycle(updatedCycle);
    persistState('active_cycle', updatedCycle);
    toast.success('Roster created — staff are spread across your rotation tracks.');
  };

  // Roll over to the next cycle: keep the previous one (archived by its id), roll the
  // dates forward by one period, and continue the rotation under the same rules.
  // Staff, shift definitions, rules and task templates carry over automatically
  // (they're workspace-level); the new period's daily tasks regenerate from them.
  const handleRolloverCycle = () => {
    if (!activeCycle) return;
    const len = cycleDates.length || 30;
    const lastStr = cycleDates[cycleDates.length - 1] || activeCycle.endDate;
    const nextStart = new Date(lastStr + 'T00:00:00');
    nextStart.setDate(nextStart.getDate() + 1);
    const fmt = (d: Date) => d.toISOString().split('T')[0];
    const newStart = fmt(nextStart);
    const nextEnd = new Date(nextStart);
    nextEnd.setDate(nextEnd.getDate() + len - 1);
    const newEnd = fmt(nextEnd);

    const newDates = getDatesForCycle(newStart, newEnd);
    const shifts = runSmartPersonaOptimizer(staffList, newDates, holidays, {}, ruleSet);
    const newCycle: RosterCycle = {
      id: `cycle-${selectedFacilityId}-${newStart}`,
      startDate: newStart,
      endDate: newEnd,
      shifts,
      isLocked: false,
    };

    // Carry any unfinished tasks from the closing cycle onto the new cycle's first day,
    // flagged 'Carried Fwd', so nothing is lost between cycles.
    const UNFINISHED = ['Pending', 'In Progress', 'Pending Review', 'Carried Fwd'];
    const oldDates = new Set(cycleDates);
    const carried = dailyTasks
      .filter(t => oldDates.has(t.date) && UNFINISHED.includes(t.status))
      .map((t, i) => ({ ...t, id: `dt-carry-${Date.now()}-${i}`, date: newStart, status: 'Carried Fwd' as DailyTask['status'] }));

    setCycleDates(newDates);
    try { localStorage.setItem(facilityKey(selectedFacilityId, 'cycle_dates'), JSON.stringify(newDates)); } catch {}
    setActiveCycle(newCycle);
    persistState('active_cycle', newCycle);

    if (carried.length > 0) {
      const merged = [...carried, ...dailyTasks];
      setDailyTasks(merged);
      persistState('daily_tasks', merged);
    }

    toast.success(`Next cycle started (${newStart} → ${newEnd}). Rotation continued; ${carried.length} unfinished task${carried.length === 1 ? '' : 's'} carried over.`);
  };

  const toggleRosterLock = () => {
    if (!activeCycle) return;
    const nextLocked = !activeCycle.isLocked;
    const updated = { ...activeCycle, isLocked: nextLocked };
    setActiveCycle(updated);
    persistState('active_cycle', updated);
    toast.success(nextLocked ? 'Roster locked and published — shifts are live.' : 'Roster unlocked — draft editing is active.');
  };

  // Daily Tasks Sign-offs
  const handleUpdateTaskStatus = (taskId: string, status: DailyTask['status'], counterSign?: string, metadata?: Partial<DailyTask>) => {
    const activeStaff = staffList.find(s => s.id === activeStaffId);
    const operatorName = activeStaff?.name || "System Operator";
    const timestamp = new Date().toISOString().substring(0, 16).replace('T', ' ');

    const updatedTasks = dailyTasks.map(t => {
      if (t.id === taskId) {
        const currentHist = t.history || [];
        let actionStr = `Status updated to ${status}`;
        let detailsStr = "";

        if (status === 'Done') {
          actionStr = t.status === 'Pending Review' ? "Approved by Manager" : "Certified Compliant (Completed)";
          const parts = [];
          if (counterSign) parts.push(`Witness co-sign: ${counterSign}`);
          const mergedMeta = { ...(metadata || {}) };
          if (mergedMeta.fridgeTemp !== undefined) parts.push(`Fridge: ${mergedMeta.fridgeTemp}°C (Room: ${mergedMeta.roomTemp}°C)`);
          if (mergedMeta.sealNumber) parts.push(`Security Seal: ${mergedMeta.sealNumber}`);
          if (mergedMeta.correctiveAction) parts.push(`Corrective Action: ${mergedMeta.correctiveAction}`);
          if (mergedMeta.clinicalComment) parts.push(`Clinical Comment: "${mergedMeta.clinicalComment}"`);
          
          if (mergedMeta.customFieldsData) {
            Object.entries(mergedMeta.customFieldsData).forEach(([fid, val]) => {
              const fdef = t.customFields?.find(f => f.id === fid);
              const label = fdef ? fdef.label : fid;
              parts.push(`${label}: ${val}`);
            });
          }
          if (mergedMeta.customFieldBreachActions) {
            Object.entries(mergedMeta.customFieldBreachActions).forEach(([fid, val]) => {
              if (val) {
                const fdef = t.customFields?.find(f => f.id === fid);
                const label = fdef ? fdef.label : fid;
                parts.push(`Corrective action for ${label} deviation: "${val}"`);
              }
            });
          }
          
          detailsStr = parts.join(" | ") || "Operations certified as compliant.";
        } else if (status === 'Pending Review') {
          actionStr = "Submitted for Manager Review";
          detailsStr = t.trackerTarget
            ? `Progress reached ${t.trackerValue}/${t.trackerTarget}. Submitted for review.`
            : counterSign
              ? `Submitted by ${operatorName}, witness: ${counterSign}.`
              : `Submitted by ${operatorName} for manager approval.`;
        } else if (status === 'Blocked') {
          actionStr = "Marked as Blocked";
          detailsStr = metadata?.blockedReason ? `Reason: "${metadata.blockedReason}"` : undefined;
        } else if (status === 'In Progress' && t.status === 'Blocked') {
          actionStr = "Unblocked";
          detailsStr = `Resumed work after blocker was resolved.`;
        } else if (status === 'In Progress' && t.status === 'Pending Review') {
          actionStr = "Sent Back for Changes";
          detailsStr = metadata?.rejectionReason ? `Reason: "${metadata.rejectionReason}"` : undefined;
        } else if (status === 'Pending' && t.status !== 'Pending') {
          actionStr = "Reset to Pending";
          detailsStr = `Task re-opened and reset to pending operations.`;
        } else {
          actionStr = `Marked as ${status}`;
        }

        const newHistoryEntry: TaskHistoryEntry = {
          id: `hist-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          timestamp,
          action: actionStr,
          staffName: operatorName,
          details: detailsStr || undefined
        };

        return { 
          ...t, 
          status, 
          counterSign,
          ...(metadata || {}),
          history: [...currentHist, newHistoryEntry]
        };
      }
      return t;
    });
    setDailyTasks(updatedTasks as DailyTask[]);
    persistState('daily_tasks', updatedTasks);
  };

  // Continuous Progress logging
  const handleIncrementTracker = (taskId: string, amount: number) => {
    const activeStaff = staffList.find(s => s.id === activeStaffId);
    const operatorName = activeStaff?.name || "System Operator";
    const timestamp = new Date().toISOString().substring(0, 16).replace('T', ' ');

    const updatedTasks = dailyTasks.map(t => {
      if (t.id === taskId) {
        const val = Math.min((t.trackerValue || 0) + amount, t.trackerTarget || 1);
        const currentHist = t.history || [];
        const newHistoryEntry: TaskHistoryEntry = {
          id: `hist-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          timestamp,
          action: "Recorded Progress Log",
          staffName: operatorName,
          details: `Logged +${amount} items. Current progress: ${val}/${t.trackerTarget || 1} completed.`
        };

        return { 
          ...t, 
          trackerValue: val,
          history: [...currentHist, newHistoryEntry]
        };
      }
      return t;
    });
    setDailyTasks(updatedTasks as DailyTask[]);
    persistState('daily_tasks', updatedTasks);

    // Also update structural Task Master if it's there
    const baseId = taskId.split('-')[1];
    if (baseId) {
      const updatedTM = taskMasterList.map(tm => {
        if (tm.id === baseId) {
          const val = Math.min((tm.trackerValue || 0) + amount, tm.trackerTarget || 1);
          return { ...tm, trackerValue: val };
        }
        return tm;
      });
      setTaskMasterList(updatedTM);
      persistState('task_master', updatedTM);
    }
  };

  // Add Task to master directory
  const handleAddTask = (task: TaskMaster) => {
    const updated = [...taskMasterList, task];
    setTaskMasterList(updated);
    persistState('task_master', updated);
  };

  // Delete Task from directory
  const handleDeleteTask = async (id: string) => {
    if (await confirm({ title: 'Delete this task?', message: 'It will be removed from the task register.', danger: true, confirmLabel: 'Delete' })) {
      const updated = taskMasterList.filter(t => t.id !== id);
      setTaskMasterList(updated);
      persistState('task_master', updated);
    }
  };

  // Inline supervisor assign override in Task Register
  const handleUpdateTaskAssignee = (id: string, name: string) => {
    const updated = taskMasterList.map(t => {
      if (t.id === id) {
        return { ...t, managerAssignedName: name || undefined };
      }
      return t;
    });
    setTaskMasterList(updated);
    persistState('task_master', updated);
  };

  // Inline bulk task updates in Task Register
  const handleUpdateTasksBulk = (updatedTasks: TaskMaster[]) => {
    setTaskMasterList(updatedTasks);
    persistState('task_master', updatedTasks);
  };

  // Client approvals queuing (replaces database queue)
  const handleProcessAction = (reqId: string, decision: 'approve' | 'deny') => {
    const freshApprovals = approvals.map(a => {
      if (a.id === reqId) {
        return { ...a, status: decision === 'approve' ? 'Approved' : 'Denied' as any };
      }
      return a;
    });
    setApprovals(freshApprovals);
    persistState('approvals', freshApprovals);

    const req = approvals.find(r => r.id === reqId);
    if (!req || decision !== 'approve') return;

    // Execute approval effect on the live system!
    if (req.type === 'SWAP' && activeCycle) {
      // direct traded swapping
      const parts = req.shiftData?.split('|') || [];
      const dateKey = parts[0];
      const dIdx = cycleDates.indexOf(dateKey);

      const requester = staffList.find(s => s.name === req.requesterName);
      const colleague = staffList.find(s => s.name === req.targetName);

      if (requester && colleague && dIdx !== -1) {
        const reqShiftVal = activeCycle.shifts[requester.id]?.[dIdx] || 'OFF';
        const colShiftVal = activeCycle.shifts[colleague.id]?.[dIdx] || 'OFF';

        const updatedShifts = { ...activeCycle.shifts };
        updatedShifts[requester.id][dIdx] = colShiftVal;
        updatedShifts[colleague.id][dIdx] = reqShiftVal;

        const updatedCycle = { ...activeCycle, shifts: updatedShifts };
        setActiveCycle(updatedCycle);
        persistState('active_cycle', updatedCycle);
      }
    }

    if (req.type === 'EXTRA') {
      // Append approved hours block to extraHoursLog
      const hAmt = parseFloat(req.targetName || '0');
      const newExtra: ExtraHoursEntry = {
        id: `extra-${Date.now()}`,
        timestamp: new Date().toISOString().substring(0, 16).replace('T', ' '),
        staffName: req.requesterName,
        shiftDate: req.shiftData || cycleDates[0],
        shiftCode: 'EXTRA',
        hours: hAmt,
        note: req.details,
        approvedBy: staffList.find(s => s.id === activeStaffId)?.fullName || 'Manager'
      };

      const updatedLog = [...extraHoursLog, newExtra];
      setExtraHoursLog(updatedLog);
      persistState('extra_hours_log', updatedLog);
    }

    if (req.type === 'MONTHLY') {
      // Flag monthly QA submission checked and locked - mark Done on the today's Board!
      const dtId = `dt-${req.details}-${req.requesterName}-${req.shiftData}`; // use notes to save parameters
      const updatedDT = dailyTasks.map(t => {
        if (t.taskName === req.shiftData && t.staffName === req.requesterName) {
          return { ...t, status: 'Done' as const, counterSign: 'QA Inspector approved' };
        }
        return t;
      });
      setDailyTasks(updatedDT);
      persistState('daily_tasks', updatedDT);
    }
  };

  // Submit requests to Manager approval queues
  const handleSubmitApprovalRequest = (req: ApprovalRequest) => {
    const updated = [req, ...approvals];
    setApprovals(updated);
    persistState('approvals', updated);
  };

  const handleUpdateTimesheet = (updated: Timesheet) => {
    const updatedList = timesheets.map(t => t.id === updated.id ? updated : t);
    setTimesheets(updatedList);
    if (selectedFacilityId) {
      localStorage.setItem(facilityKey(selectedFacilityId, 'timesheets_list'), JSON.stringify(updatedList));
    }
    if (firebaseUser) {
      dbSetDoc('timesheets', updated.id, { ...updated, facilityId: (updated as any).facilityId || selectedFacilityId }).catch(handleGenericError);
    }
  };

  // Overtime scheduled hours maps for standard metrics
  const myExtraHoursLogCount: { [name: string]: number } = {};
  (displayedStaffList || [])
    .filter((s): s is StaffMember => s !== null && typeof s === 'object' && typeof s.name === 'string')
    .forEach(s => {
      const staffShifts = (activeCycle?.shifts || {})[s.id] || [];
      let tot = 0;
      staffShifts.forEach(sc => {
        if (shifts[sc]) tot += shifts[sc].hours;
        else if (SHIFTS[sc]) tot += SHIFTS[sc].hours;
      });
      myExtraHoursLogCount[s.name] = tot;
    });

  // First-run: an authorized user with no workspace yet provisions one via the setup wizard.
  const showSetupWizard = isAuthorized && isHydrated && facilities.length === 0;

  // While cloud hydration is still in flight, hold here rather than letting
  // stale (pre-hydration) staffList/facilities briefly render the wrong gate
  // (e.g. a "you need to register" flash for an already-registered user).
  if (isAuthorized && !isHydrated) {
    return <LoadingScreen />;
  }

  if (showSetupWizard && firebaseUser && !confirmedIdentity) {
    return (
      <ConfirmIdentity
        email={firebaseUser.email || ''}
        suggestedName={firebaseUser.displayName || ''}
        onConfirm={(name, role) => setConfirmedIdentity({ name, role })}
        onSignOut={handleSignOut}
      />
    );
  }

  if (showSetupWizard) {
    return (
      <SetupWizard
        onComplete={handleCompleteSetup}
        suggestedManagerName={confirmedIdentity?.name ?? (firebaseUser?.displayName || '')}
        suggestedManagerEmail={firebaseUser?.email || ''}
        suggestedManagerRole={confirmedIdentity?.role ?? 'Manager'}
        onSignOut={handleSignOut}
      />
    );
  }

  if ((!isAuthorized || needsOnboarding)) {
    return (
      <div className="relative">
        {firebaseErrorBanner && (
          <div className="bg-amber-50 border-b border-amber-300 text-amber-800 px-4 py-3 text-center text-sm font-medium flex items-center justify-center gap-2 z-50">
            <span>⚠️</span>
            <span>{firebaseErrorBanner.message}</span>
            {firebaseErrorBanner.link && (
              <a 
                href={firebaseErrorBanner.link} 
                target="_blank" 
                rel="noreferrer" 
                className="underline hover:text-amber-950 ml-1 inline-flex items-center gap-0.5 font-bold"
              >
                Manage Database ↗
              </a>
            )}
          </div>
        )}
        <PortalGateway
          firebaseUser={firebaseUser}
          onGoogleSignIn={handleGoogleSignIn}
          onSignOut={handleSignOut}
          staffList={staffList}
          facilities={facilities}
          departments={departments}
          selectedFacilityId={selectedFacilityId}
          onSelfOnboard={handleSelfOnboard}
          onSelectSandboxBypass={handleSelectSandboxBypass}
          isSandboxBypassActive={isSandboxBypassActive}
          onBypassAsGuestManager={handleBypassAsGuestManager}
          onCreateFacility={handleCreateFacility}
          onCreateDepartment={handleCreateDepartment}
          taxonomy={taxonomy}
        />
      </div>
    );
  }

  return (
    <div className="bg-[#f4f6f9] min-h-screen text-gray-800 font-sans">
      {firebaseErrorBanner && (
        <div className="bg-amber-50 border-b border-amber-300 text-amber-800 px-4 py-3 text-center text-sm font-medium flex items-center justify-center gap-2 relative z-50">
          <span>⚠️</span>
          <span>{firebaseErrorBanner.message}</span>
          {firebaseErrorBanner.link && (
            <a 
              href={firebaseErrorBanner.link} 
              target="_blank" 
              rel="noreferrer" 
              className="underline hover:text-amber-950 ml-1 inline-flex items-center gap-0.5 font-bold"
            >
              Upgrade/Manage Database ↗
            </a>
          )}
        </div>
      )}
      {/* Upper header */}
      <Header
        staffList={displayedStaffList}
        activeStaffId={activeStaffId}
        setActiveStaffId={setActiveStaffId}
        isManagerView={isManagerView}
        setIsManagerView={setIsManagerView}
        accessLevel={access.accessLevel}
        facilities={facilities}
        selectedFacilityId={selectedFacilityId}
        setSelectedFacilityId={setSelectedFacilityId}
        onCreateFacility={handleCreateFacility}
        firebaseUser={firebaseUser}
        onGoogleSignIn={handleGoogleSignIn}
        onSignOut={handleSignOut}
        taxonomy={taxonomy}
      />

      <div className="max-w-7xl mx-auto flex flex-col md:flex-row min-h-[calc(100vh-68px)]">
        {/* Navigation Sidebar */}
        <Navigation
          currentTab={currentTab}
          setCurrentTab={handleNavigation}
          isManagerView={isManagerView || staffList.length === 0}
          accessLevel={access.accessLevel}
          taxonomy={taxonomy}
          timezoneLabel={timezoneLabel}
        />

        {/* Main Panel views */}
        <main className="flex-1 p-6 w-full overflow-hidden">
        <React.Suspense fallback={<div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-indigo-400" /></div>}>
          {/* Home Dashboard */}
          {currentTab === 'home' && (
            <div className="flex flex-col gap-6">
              {/* First-time guided setup checklist (managers only, until complete) */}
              {isManagerView && (() => {
                const setupSteps = {
                  team: displayedStaffList.length > 0,
                  roster: !!activeCycle && Object.values(activeCycle.shifts || {}).some((a: any) => Array.isArray(a) && a.some((c: string) => c && c !== 'OFF')),
                  tasks: taskMasterList.length > 0,
                  golive: displayedDailyTasks.length > 0,
                };
                const complete = setupSteps.team && setupSteps.roster && setupSteps.tasks && setupSteps.golive;
                // The checklist can be dismissed once a roster exists; but never let
                // it stay hidden when there's no roster yet (that would be a dead end).
                if (complete || (setupHidden && !!activeCycle)) return null;
                return (
                  <SetupChecklist
                    steps={setupSteps}
                    onAddTeam={() => handleNavigation('admin')}
                    onPlanRoster={() => activeCycle ? handleNavigation('roster') : setIsWizardOpen(true)}
                    onSetupTasks={() => handleNavigation('register')}
                    onGoLive={() => handleNavigation('tasks')}
                    onDismiss={() => { try { localStorage.setItem(setupHiddenKey(selectedFacilityId), '1'); } catch {} setSetupHidden(true); }}
                    taxonomy={taxonomy}
                  />
                );
              })()}

              {activeCycle ? (
                <DashboardHome
                  activeStaffId={activeStaffId}
                  staffList={displayedStaffList}
                  activeCycle={activeCycle}
                  cycleDates={cycleDates}
                  dailyTasks={displayedDailyTasks}
                  onNavigate={handleNavigation}
                  onIncrementTracker={handleIncrementTracker}
                  onUpdateTask={handleUpdateTaskStatus}
                  selectedFacilityId={selectedFacilityId}
                  facilities={facilities}
                  departments={departments}
                  shifts={shifts}
                  holidays={holidays}
                  ruleSet={ruleSet}
                  taxonomy={taxonomy}
                  onFocusStaff={handleFocusStaffInTasks}
                  onViewOverdue={handleViewOverdueTasks}
                  onViewBlocked={handleViewBlockedTasks}
                  onViewReview={handleViewReviewTasks}
                />
              ) : (!isManagerView && (
                <EmptyState
                  title="Nothing here yet"
                  message="Your manager is still setting up this cycle's roster. Check back soon."
                />
              ))}
            </div>
          )}

          {/* Fallback for cycle-gated tabs when no roster exists yet — never leave a blank screen */}
          {!activeCycle && ['roster', 'tasks', 'timesheets', 'manager', 'analytics'].includes(currentTab) && (
            <EmptyState
              title="No roster yet"
              message="Plan this cycle's roster first — then schedules, the task board, timesheets and reports all appear here."
              actionLabel={isManagerView ? 'Plan roster' : undefined}
              onAction={isManagerView ? () => setIsWizardOpen(true) : undefined}
            />
          )}

          {/* Roster & Coverage Calendar */}
          {currentTab === 'roster' && activeCycle && (
            <RosterGrid
              activeCycle={activeCycle}
              updateShift={handleUpdateShift}
              bulkUpdateShifts={handleBulkUpdateShifts}
              restoreCycle={handleRestoreCycle}
              updateCycleDates={handleUpdateCycleDates}
              staffList={displayedStaffList}
              cycleDates={cycleDates}
              holidays={holidays}
              toggleRosterLock={toggleRosterLock}
              openWizard={() => setIsWizardOpen(true)}
              openOnboarding={() => setIsOnboardingOpen(true)}
              isManagerView={isManagerView}
              shifts={shifts}
              setShifts={setShifts}
              onEditShifts={() => handleNavigation('admin')}
              onRolloverCycle={handleRolloverCycle}
              facilityId={selectedFacilityId}
            />
          )}

          {/* Timesheet logging portal */}
          {currentTab === 'timesheets' && activeCycle && (
            <TimesheetPortal
              timesheets={displayedTimesheets}
              activeStaffId={activeStaffId}
              staffList={displayedStaffList}
              cycleDates={cycleDates}
              holidays={holidays}
              activeCycle={activeCycle}
              onUpdateTimesheet={handleUpdateTimesheet}
              selectedFacilityId={selectedFacilityId}
              facilities={facilities}
              taxonomy={taxonomy}
              shifts={shifts}
            />
          )}

          {/* Daily tasks checklists board */}
          {currentTab === 'tasks' && activeCycle && (
            <div className="flex flex-col gap-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 align-start">
                <div className="lg:col-span-2">
                  <TaskBoard
                    dailyTasks={displayedDailyTasks}
                    onUpdateTask={handleUpdateTaskStatus}
                    onIncrementTracker={handleIncrementTracker}
                    staffList={displayedStaffList}
                    cycleDates={cycleDates}
                    activeStaffId={activeStaffId}
                    taxonomy={taxonomy}
                    taskCategories={taskCategories}
                    focusStaffName={taskBoardFocusStaff}
                    onFocusConsumed={() => setTaskBoardFocusStaff(null)}
                    jumpToTab={taskBoardJumpTab}
                    onJumpConsumed={() => setTaskBoardJumpTab(null)}
                    isManagerView={isManagerView}
                  />
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm self-start">
                  <h3 className="text-sm font-bold text-slate-800 border-b border-gray-100 pb-3 mb-4 flex items-center gap-1.5 font-medium">
                    👤 My details
                  </h3>
                  <StaffPortal
                    activeStaffId={activeStaffId}
                    staffList={displayedStaffList}
                    activeCycle={activeCycle}
                    cycleDates={cycleDates}
                    holidays={holidays}
                    approvals={approvals}
                    onSubmitRequest={handleSubmitApprovalRequest}
                    extraHoursLog={extraHoursLog}
                    dailyTasks={displayedDailyTasks}
                    selectedFacilityId={selectedFacilityId}
                    facilities={facilities}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Task register master database */}
          {currentTab === 'register' && (
            <TaskRegister
              tasks={taskMasterList}
              staffList={displayedStaffList}
              onAddTask={handleAddTask}
              onDeleteTask={handleDeleteTask}
              onUpdateTaskAssignee={handleUpdateTaskAssignee}
              dailyTasksLog={displayedDailyTasks}
              myExtraHoursLogCount={myExtraHoursLogCount}
              onUpdateTasksBulk={handleUpdateTasksBulk}
              onPreGenerate7DaysTasks={handlePreGenerate7DaysTasks}
              taskCategories={taskCategories}
              onAddCategory={(name) => setTaskCategories([...taskCategories, name])}
              shifts={shifts}
            />
          )}

          {/* Manager Action center approvals */}
          {currentTab === 'manager' && activeCycle && (
            <ManagerDashboard
              approvals={approvals}
              onProcessAction={handleProcessAction}
              staffList={displayedStaffList}
              activeCycle={activeCycle}
              cycleDates={cycleDates}
              holidays={holidays}
              extraHoursLog={extraHoursLog}
              dailyTasks={displayedDailyTasks}
              timesheets={displayedTimesheets}
              onUpdateTimesheet={handleUpdateTimesheet}
              approverName={staffList.find(s => s.id === activeStaffId)?.fullName || 'Manager'}
            />
          )}

          {/* Analytics Fairness and Quality Reports */}
          {currentTab === 'analytics' && activeCycle && (
            <Analytics
              staffList={displayedStaffList}
              activeCycle={activeCycle}
              cycleDates={cycleDates}
              holidays={holidays}
              extraHoursLog={extraHoursLog}
              dailyTasksLog={displayedDailyTasks}
            />
          )}

          {/* Enterprise Setup Portal */}
          {currentTab === 'admin' && (
            <EnterpriseAdmin
              facilitiesConfig={{
                facilities,
                onCreateFacility: handleCreateFacility,
                onUpdateFacility: handleUpdateFacility,
                onDeleteFacility: handleDeleteFacility,
                selectedFacilityId,
                setSelectedFacilityId,
                departments,
                setDepartments,
                onCreateDepartment: handleCreateDepartment,
                onDeleteDepartment: handleDeleteDepartment,
              }}
              rosterDataConfig={{
                staffList,
                setStaffList,
                taskMasterList,
                setTaskMasterList: (list) => {
                  setTaskMasterList(list);
                  persistState('task_master', list);
                },
              }}
              currentDeptId={currentDeptId}
              setCurrentDeptId={setCurrentDeptId}
              isSandboxStrictMode={isSandboxStrictMode}
              setIsSandboxStrictMode={setIsSandboxStrictMode}
              openOnboarding={() => setIsOnboardingOpen(true)}
              onFullReset={handleDeepAtomicPurge}
              workspaceConfig={{
                shifts, setShifts,
                taxonomy, setTaxonomy,
                ruleSet, setRuleSet,
                taskCategories, setTaskCategories,
                facilityTypes, setFacilityTypes,
                holidays, setHolidays,
                timezoneLabel, setTimezoneLabel,
                regionPresetId, setRegionPresetId,
              }}
              accessLevel={access.accessLevel}
              onSyncGrantedAccess={handleSyncGrantedAccess}
              platformAdmins={platformAdmins}
              onGrantPlatformAdmin={handleGrantPlatformAdmin}
              onRevokePlatformAdmin={handleRevokePlatformAdmin}
            />
          )}
        </React.Suspense>
        </main>
      </div>

      {/* Guided roster builder */}
      <RosterWizard
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        staffList={staffList}
        onAddStaff={handleOnboardNewStaff}
        shifts={shifts}
        setShifts={setShifts}
        departments={departments}
        selectedFacilityId={selectedFacilityId}
        onGenerate={handleRosterGenerate}
        onOpenRoster={() => handleNavigation('roster')}
        activeCycle={activeCycle}
        cycleDates={cycleDates}
        updateShift={handleUpdateShift}
      />

      {/* New Staff Onboarding Wizard Modal Overlay */}
      <NewStaffOnboardingModal
        isOpen={isOnboardingOpen}
        onClose={() => setIsOnboardingOpen(false)}
        onAddStaff={handleOnboardNewStaff}
        departments={departments}
        selectedFacilityId={selectedFacilityId}
        taxonomy={taxonomy}
      />
    </div>
  );
}
