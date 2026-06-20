import React, { useState, useEffect, useRef } from 'react';
import {
  ShiftDef,
  StaffMember,
  RosterCycle,
  AbsenceLog,
  TaskMaster,
  DailyTask,
  ComplianceEntry,
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
import { SHIFTS, INITIAL_STAFF, INITIAL_TASKS, DEFAULT_FACILITIES, getStaffSeedForFacility, getTasksSeedForFacility, upgradeFacilitiesList, buildDefaultRuleSet, buildDefaultWorkspaceConfig } from './data/initialData';
import { getDatesForCycle, generateSeedShifts, runSmartPersonaOptimizer, isPublicHoliday, alignShiftsToNewDates } from './utils/rosterUtils';
import SetupWizard from './components/SetupWizard';
import SetupChecklist from './components/SetupChecklist';
import EmptyState from './components/EmptyState';
import { useToast } from './components/ui/ToastProvider';
import { useConfirm } from './components/ui/ConfirmProvider';
import { generateDefaultTimesheet } from './utils/timesheetUtils';
import firebaseConfig from '../firebase-applet-config.json';
import Header from './components/Header';
import Navigation from './components/Navigation';
import DashboardHome from './components/DashboardHome';
import RosterGrid from './components/RosterGrid';
import TaskBoard from './components/TaskBoard';
import TimesheetPortal from './components/TimesheetPortal';
import TaskRegister from './components/TaskRegister';
import ManagerDashboard from './components/ManagerDashboard';
import Analytics from './components/Analytics';
import WizardModal from './components/WizardModal';
import NewStaffOnboardingModal from './components/NewStaffOnboardingModal';
import StaffPortal from './components/StaffPortal';
import EnterpriseAdmin from './components/EnterpriseAdmin';
import PortalGateway from './components/PortalGateway';
import { Sparkles, Calendar, ClipboardCheck, Clock } from 'lucide-react';
import {
  auth,
  testConnection,
  signInWithGoogle,
  logoutUser,
  dbGetCollection,
  dbSetDoc,
  dbSaveListAtomic,
  dbDeleteDoc,
  dbGetDoc
} from './firebase';
import { resolveAccess, ResolvedAccess } from './config/access';

const DEFAULT_DEPARTMENTS: Department[] = [];

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

const DEFAULT_TAXONOMY = {
  appName: 'RotaSync',
  workspaceSingular: 'Facility',
  workspacePlural: 'Facilities',
  memberSingular: 'Staff Member',
  memberPlural: 'Staff Members',
  groupSingular: 'Department',
  groupPlural: 'Departments',
  taskSingular: 'Task',
  taskPlural: 'Tasks',
};

export default function App() {
  const toast = useToast();
  const confirm = useConfirm();

  const [firebaseUser, setFirebaseUser] = useState<any>(null);
  const [isFirebaseSyncEnabled, setIsFirebaseSyncEnabled] = useState<boolean>(false);
  // Resolved access tier + scope for the signed-in user (Phase A foundation).
  const [access, setAccess] = useState<ResolvedAccess>({ accessLevel: 'staff', email: '' });
  const [isSyncingFirebase, setIsSyncingFirebase] = useState<boolean>(false);

  // RBAC Sandbox Bypass monitoring
  const [isSandboxBypassActive, setIsSandboxBypassActive] = useState<boolean>(false);

  const [currentTab, setCurrentTab] = useState('home');
  const [isManagerView, setIsManagerView] = useState(false);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [setupHidden, setSetupHidden] = useState(false);

  // Core Database States
  const [facilities, setFacilities] = useState<Facility[]>(DEFAULT_FACILITIES);
  const [selectedFacilityId, setSelectedFacilityId] = useState<string>(() => {
    try { return localStorage.getItem('care_last_facility') || ''; } catch { return ''; }
  });

  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [activeStaffId, setActiveStaffId] = useState('');
  const [activeCycle, setActiveCycle] = useState<RosterCycle | null>(null);
  const [cycleDates, setCycleDates] = useState<string[]>([]);
  const [holidays, setHolidays] = useState<PublicHoliday[]>([]);
  const [taskMasterList, setTaskMasterList] = useState<TaskMaster[]>([]);
  const [dailyTasks, setDailyTasks] = useState<DailyTask[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [extraHoursLog, setExtraHoursLog] = useState<ExtraHoursEntry[]>([]);
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);

  // Connecteam Custom Configurations & Multi-tenant States
  const [shifts, setShifts] = useState<{ [code: string]: ShiftDef }>(SHIFTS);
  const [departments, setDepartments] = useState<Department[]>(DEFAULT_DEPARTMENTS);
  const [currentDeptId, setCurrentDeptId] = useState<string>('');
  const [isSandboxStrictMode, setIsSandboxStrictMode] = useState<boolean>(false);
  const [taxonomy, setTaxonomy] = useState(DEFAULT_TAXONOMY);

  // Configuration-driven workspace settings (per-facility, runtime-defined)
  const [ruleSet, setRuleSet] = useState<RosterRuleSet>(buildDefaultRuleSet());
  const [taskCategories, setTaskCategories] = useState<string[]>(() => buildDefaultWorkspaceConfig().taskCategories);
  const [facilityTypes, setFacilityTypes] = useState<string[]>(() => buildDefaultWorkspaceConfig().facilityTypes);
  const [timezoneLabel, setTimezoneLabel] = useState<string>('');
  const [regionPresetId, setRegionPresetId] = useState<string | undefined>(undefined);

  const [isHydrated, setIsHydrated] = useState<boolean>(false);
  const staffListRef = useRef<StaffMember[] | null>(null);
  
  const lastStaffListRef = useRef<StaffMember[]>([]);
  const lastTaskMasterListRef = useRef<TaskMaster[]>([]);
  const lastDailyTasksRef = useRef<DailyTask[]>([]);
  const lastApprovalsRef = useRef<ApprovalRequest[]>([]);
  const lastExtraHoursLogRef = useRef<ExtraHoursEntry[]>([]);

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

  // --- FIREBASE AUTHENTICATION INITIALIZER WITH COEXISTING CLOUD TOGGLE ---
  useEffect(() => {
    testConnection();
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setFirebaseUser(user);
      setIsFirebaseSyncEnabled(!!user);
    });
    return () => unsubscribe();
  }, []);

  // Resolve the signed-in user's access tier from their email (super-user allowlist
  // → matching staff record), and mirror it into a rules-friendly users/{uid} doc.
  // Phase A: additive only — this does not yet change what the UI shows.
  useEffect(() => {
    if (!firebaseUser) {
      setAccess({ accessLevel: 'staff', email: '' });
      return;
    }
    const resolved = resolveAccess(firebaseUser.email, staffList);
    setAccess(resolved);
    dbSetDoc('users', firebaseUser.uid, {
      id: firebaseUser.uid,
      email: resolved.email,
      accessLevel: resolved.accessLevel,
      facilityId: resolved.facilityId || '',
      departmentId: resolved.departmentId || '',
    }).catch(() => {});
  }, [firebaseUser, staffList]);

  const handleGoogleSignIn = async () => {
    try {
      await signInWithGoogle();
    } catch (err) {
      console.error('Sign-in error:', err);
    }
  };

  const handleSignOut = async () => {
    try {
      await logoutUser();
      setFirebaseUser(null);
      setIsFirebaseSyncEnabled(false);
      setIsSandboxBypassActive(false);
      window.location.reload();
    } catch (err) {
      console.error('Logout error:', err);
    }
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
    localStorage.setItem(`facility_${newStaff.facilityId}_active_staff_id`, newStaff.id);
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
        localStorage.setItem(`facility_${selectedFacilityId}_active_staff_id`, staffMember.id);
      } else {
        // Fallback or guest staff on the fly
        const guestStaff: StaffMember = {
          id: 'guest-staff-silo',
          name: 'Demo Staff',
          email: 'staff@marybegg.demo',
          role: 'Emulated Staff',
          facilityId: selectedFacilityId,
          phone: '+260 970 000 000',
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
        localStorage.setItem(`facility_${selectedFacilityId}_active_staff_id`, guestStaff.id);
      }
    } else {
      setActiveStaffId(staffId);
      const matched = staffList.find(s => s.id === staffId);
      if (matched) {
        setIsManagerView(matched.isManager);
      }
      localStorage.setItem(`facility_${selectedFacilityId}_active_staff_id`, staffId);
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

  // 1. Unified Coordinated Hydration Engine state loader
  useEffect(() => {
    // NOTE: we intentionally do NOT early-return when there is no selected
    // facility — the hydrate() routine handles the first-run/blank-slate case
    // (loading any stored facilities, auto-selecting one, or marking hydration
    // complete so the setup wizard can appear).
    setIsHydrated(false);

    let active = true;

    async function hydrate() {
      setIsSyncingFirebase(true);

      // --- STEP A: Load Local Cache first so UI is immediately responsive ---
      // Load Facilities
      const storedFacilities = localStorage.getItem('care_facilities_list');
      let loadedFacs = DEFAULT_FACILITIES;
      if (storedFacilities) {
        try {
          const parsed = JSON.parse(storedFacilities);
          const { upgraded, changed } = upgradeFacilitiesList(parsed);
          loadedFacs = upgraded;
          if (changed) {
            localStorage.setItem('care_facilities_list', JSON.stringify(upgraded));
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
          setIsSyncingFirebase(false);
          setIsHydrated(true);
        }
        return;
      }

      const isSeededInitially = localStorage.getItem(`seeded_initially_${selectedFacilityId}`) === 'true';

      // Load Departments
      const storedDepts = localStorage.getItem('care_departments');
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
      const storedHolidays = localStorage.getItem(`facility_${selectedFacilityId}_holidays`) || localStorage.getItem('kmh_holidays');
      if (storedHolidays) {
        try {
          loadedHolidays = JSON.parse(storedHolidays);
        } catch (e) {}
      }
      if (active) {
        setHolidays(loadedHolidays);
      }

      // Load custom shifts
      const storedShifts = localStorage.getItem(`facility_${selectedFacilityId}_custom_shifts`);
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
      const storedConfig = localStorage.getItem(`facility_${selectedFacilityId}_config`);
      let loadedRuleSet = buildDefaultRuleSet();
      let loadedCategories = buildDefaultWorkspaceConfig().taskCategories;
      let loadedFacTypes = buildDefaultWorkspaceConfig().facilityTypes;
      let loadedTimezone = '';
      let loadedRegionId: string | undefined = undefined;
      if (storedConfig) {
        try {
          const cfg = JSON.parse(storedConfig) as Partial<WorkspaceConfig>;
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
      const storedStaff = localStorage.getItem(`facility_${selectedFacilityId}_staff_list`);
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
        phone: s.phone || '+260 970 000 000',
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
              isManager: legacyUser.isManager || onboardedUser.isManager || true,
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
      const storedDates = localStorage.getItem(`facility_${selectedFacilityId}_cycle_dates`);
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
      const storedCycle = localStorage.getItem(`facility_${selectedFacilityId}_active_cycle`);
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
      const storedTaskMaster = localStorage.getItem(`facility_${selectedFacilityId}_task_master`);
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
      const storedApprovals = localStorage.getItem(`facility_${selectedFacilityId}_approvals`);
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
      const storedExtra = localStorage.getItem(`facility_${selectedFacilityId}_extra_hours_log`);
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
      const storedDaily = localStorage.getItem(`facility_${selectedFacilityId}_daily_tasks`);
      let loadedDaily: DailyTask[] = [];
      if (storedDaily) {
        try {
          loadedDaily = JSON.parse(storedDaily);
        } catch (e) {}
      }
      if (loadedDaily.length === 0 && loadedCycle) {
        loadedDaily = generateDayTasks('2026-06-18', loadedStaff, loadedCycle, loadedTasks);
      }
      if (active) {
        setDailyTasks(loadedDaily);
        lastDailyTasksRef.current = loadedDaily;
      }

      // Load Timesheets list
      const storedTimesheets = localStorage.getItem(`facility_${selectedFacilityId}_timesheets_list`);
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
      const storedTax = localStorage.getItem(`facility_${selectedFacilityId}_taxonomy`);
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
        localStorage.setItem(`seeded_initially_${selectedFacilityId}`, 'true');
      }

      // --- STEP B: Hydrate from Cloud authority if firebase user is signed in ---
      if (firebaseUser) {
        try {
          const configDoc = await dbGetDoc<{ id: string; seeded: boolean }>('systemConfig', 'status');
          const cloudIsAlreadySeeded = configDoc !== null;

          // 1. Facilities
          let cloudFacs = await dbGetCollection<Facility>('facilities');
          if (cloudFacs.length === 0 && !cloudIsAlreadySeeded && loadedFacs.length > 0) {
            for (const f of loadedFacs) {
              await dbSetDoc('facilities', f.id, f);
            }
            cloudFacs = loadedFacs;
          }
          if (cloudFacs.length > 0) {
            const { upgraded, changed } = upgradeFacilitiesList(cloudFacs);
            cloudFacs = upgraded;
            if (active) setFacilities(cloudFacs);
            localStorage.setItem('care_facilities_list', JSON.stringify(cloudFacs));
          }

          // 2. Departments
          const cloudDepts = await dbGetCollection<Department>('departments');
          if (active) setDepartments(cloudDepts);
          localStorage.setItem('care_departments', JSON.stringify(cloudDepts));

          // 3. Staff List
          let cloudStaff = await dbGetCollection<StaffMember>('staff');
          cloudStaff = cloudStaff.map(s => ({
            id: s.id || `staff-${Math.random().toString(36).substring(2, 11)}`,
            name: s.name || 'Unnamed',
            email: s.email || `${(s.name || 'staff').toLowerCase().replace(/\s+/g, '')}@example.com`,
            role: s.role || 'Staff Member',
            facilityId: s.facilityId || selectedFacilityId,
            phone: s.phone || '+260 970 000 000',
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
                  isManager: legacyUser.isManager || onboardedUser.isManager || true,
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
          localStorage.setItem(`facility_${selectedFacilityId}_staff_list`, JSON.stringify(partitionedCloudStaff));
          loadedStaff = partitionedCloudStaff;

          // 4. Active Cycle
          const cloudCycles = await dbGetCollection<RosterCycle>('cycles');
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
            localStorage.setItem(`facility_${selectedFacilityId}_active_cycle`, JSON.stringify(cloudCycle));
            loadedCycle = cloudCycle;
          } else {
            localStorage.removeItem(`facility_${selectedFacilityId}_active_cycle`);
            loadedCycle = null;
          }

          // 5. Tasks Master
          let cloudTasks = await dbGetCollection<TaskMaster>('taskMasters');
          if (cloudTasks.length === 0 && !cloudIsAlreadySeeded && loadedTasks.length > 0) {
            for (const t of loadedTasks) {
              await dbSetDoc('taskMasters', t.id, t);
            }
            cloudTasks = loadedTasks;
          }
          if (active) {
            setTaskMasterList(cloudTasks);
            lastTaskMasterListRef.current = cloudTasks;
          }
          localStorage.setItem(`facility_${selectedFacilityId}_task_master`, JSON.stringify(cloudTasks));
          loadedTasks = cloudTasks;

          // 6. Daily Tasks
          let cloudDailyTasks = await dbGetCollection<DailyTask>('dailyTasks');
          let partitionedCloudDaily = cloudDailyTasks.filter(t => 
            loadedStaff.some(s => s.name === t.staffName)
          );
          if (partitionedCloudDaily.length === 0 && !cloudIsAlreadySeeded && loadedDaily.length > 0) {
            for (const t of loadedDaily) {
              await dbSetDoc('dailyTasks', t.id, t);
            }
            partitionedCloudDaily = loadedDaily;
          }
          if (active) {
            setDailyTasks(partitionedCloudDaily);
            lastDailyTasksRef.current = partitionedCloudDaily;
          }
          localStorage.setItem(`facility_${selectedFacilityId}_daily_tasks`, JSON.stringify(partitionedCloudDaily));
          loadedDaily = partitionedCloudDaily;

          // 7. Approvals
          let cloudApprovals = await dbGetCollection<ApprovalRequest>('approvals');
          if (cloudApprovals.length === 0 && !cloudIsAlreadySeeded && loadedApprovals.length > 0) {
            for (const a of loadedApprovals) {
              await dbSetDoc('approvals', a.id, a);
            }
            cloudApprovals = loadedApprovals;
          }
          if (active) {
            setApprovals(cloudApprovals);
            lastApprovalsRef.current = cloudApprovals;
          }
          localStorage.setItem(`facility_${selectedFacilityId}_approvals`, JSON.stringify(cloudApprovals));

          // 8. Extra Hours Log
          let cloudExtra = await dbGetCollection<ExtraHoursEntry>('extraHours');
          if (cloudExtra.length === 0 && !cloudIsAlreadySeeded && loadedExtra.length > 0) {
            for (const e of loadedExtra) {
              await dbSetDoc('extraHours', e.id, e);
            }
            cloudExtra = loadedExtra;
          }
          if (active) {
            setExtraHoursLog(cloudExtra);
            lastExtraHoursLogRef.current = cloudExtra;
          }
          localStorage.setItem(`facility_${selectedFacilityId}_extra_hours_log`, JSON.stringify(cloudExtra));

          // 9. Timesheets
          const cloudTimesheets = await dbGetCollection<Timesheet>('timesheets');
          let partitionedCloudTimesheets = cloudTimesheets.filter(t => 
            loadedStaff.some(s => s.id === t.staffId)
          );
          if (partitionedCloudTimesheets.length === 0 && !cloudIsAlreadySeeded && loadedTimesheets.length > 0) {
            for (const t of loadedTimesheets) {
              await dbSetDoc('timesheets', t.id, t);
            }
            partitionedCloudTimesheets = loadedTimesheets;
          }
          if (active) {
            setTimesheets(partitionedCloudTimesheets);
          }
          localStorage.setItem(`facility_${selectedFacilityId}_timesheets_list`, JSON.stringify(partitionedCloudTimesheets));

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
      const storedActiveId = localStorage.getItem(`facility_${selectedFacilityId}_active_staff_id`);
      if (storedActiveId && loadedStaff.some(s => s.id === storedActiveId)) {
        if (active) setActiveStaffId(storedActiveId);
      } else {
        const manager = loadedStaff.find(s => s.isManager) || loadedStaff[0];
        const fallbackId = manager ? manager.id : '';
        if (active) {
          setActiveStaffId(fallbackId);
          localStorage.setItem(`facility_${selectedFacilityId}_active_staff_id`, fallbackId);
        }
      }

      if (active) {
        setIsSyncingFirebase(false);
        setIsHydrated(true);
      }
    }

    hydrate();

    return () => {
      active = false;
    };
  }, [selectedFacilityId, firebaseUser]);

  // Sync custom taxonomy changes to localStorage
  useEffect(() => {
    if (selectedFacilityId) {
      localStorage.setItem(`facility_${selectedFacilityId}_taxonomy`, JSON.stringify(taxonomy));
    }
  }, [taxonomy, selectedFacilityId]);

  // Remember last active facility for next load
  useEffect(() => {
    if (selectedFacilityId) {
      try { localStorage.setItem('care_last_facility', selectedFacilityId); } catch {}
    }
  }, [selectedFacilityId]);

  // Persist workspace configuration bundle (ruleset, categories, facility types, regional)
  useEffect(() => {
    if (!isHydrated || !selectedFacilityId) return;
    const cfg = {
      ruleSet,
      taskCategories,
      facilityTypes,
      timezoneLabel,
      regionPresetId,
    };
    try {
      localStorage.setItem(`facility_${selectedFacilityId}_config`, JSON.stringify(cfg));
    } catch {}
    if (firebaseUser) {
      dbSetDoc('workspaceConfigs', selectedFacilityId, { id: selectedFacilityId, ...cfg }).catch(() => {});
    }
  }, [ruleSet, taskCategories, facilityTypes, timezoneLabel, regionPresetId, selectedFacilityId, isHydrated, firebaseUser]);

  // Keep holidays persisted per-facility (Regional settings)
  useEffect(() => {
    if (!isHydrated || !selectedFacilityId) return;
    try {
      localStorage.setItem(`facility_${selectedFacilityId}_holidays`, JSON.stringify(holidays));
    } catch {}
  }, [holidays, selectedFacilityId, isHydrated]);

  // Synchronously seed and reconcile timesheets whenever staffList or activeCycle changes (Only post-hydration)
  useEffect(() => {
    if (!isHydrated || !selectedFacilityId || !activeCycle || staffList.length === 0) return;
    
    setTimesheets(currentTimesheets => {
      let timesheetChanged = false;
      const updatedTimesheets = [...currentTimesheets];
      
      staffList.forEach(staff => {
        const hasTs = updatedTimesheets.some(t => t.staffId === staff.id && t.cycleId === activeCycle.id);
        if (!hasTs) {
          const defaultTs = generateDefaultTimesheet(staff, activeCycle, cycleDates, holidays);
          updatedTimesheets.push(defaultTs);
          timesheetChanged = true;
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
        localStorage.setItem(`facility_${selectedFacilityId}_timesheets_list`, JSON.stringify(cleanedTimesheets));
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
            dbSetDoc('timesheets', ts.id, ts).catch(err => {
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
      localStorage.setItem(`facility_${selectedFacilityId}_active_staff_id`, activeStaffId);
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
          localStorage.removeItem(`facility_${selectedFacilityId}_active_staff_id`);
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

  // Sync custom departments and shifts to localStorage
  useEffect(() => {
    localStorage.setItem('care_departments', JSON.stringify(departments));
  }, [departments]);

  useEffect(() => {
    if (selectedFacilityId) {
      localStorage.setItem(`facility_${selectedFacilityId}_custom_shifts`, JSON.stringify(shifts));
    }
  }, [shifts, selectedFacilityId]);

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
      setSetupHidden(localStorage.getItem(`setup_hidden_${selectedFacilityId}`) === '1');
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
      if (localStorage.getItem(`welcomed_${selectedFacilityId}`) === '1') return;
      localStorage.setItem(`welcomed_${selectedFacilityId}`, '1');
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

  // Dynamically Provision New Clinical Workspace
  const handleCreateFacility = (newFac: Facility) => {
    const updated = [...facilities, newFac];
    setFacilities(updated);
    localStorage.setItem('care_facilities_list', JSON.stringify(updated));
    setSelectedFacilityId(newFac.id);
    
    if (firebaseUser) {
      dbSetDoc('facilities', newFac.id, newFac).catch(handleGenericError);
    }
  };

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
    localStorage.setItem('care_facilities_list', JSON.stringify(updatedFacs));

    // Workspace config → individual states + persisted bundle
    setShifts(config.shifts);
    setRuleSet(config.ruleSet);
    setTaskCategories(config.taskCategories);
    setFacilityTypes(config.facilityTypes);
    setHolidays(config.holidays);
    setTimezoneLabel(config.timezoneLabel);
    setRegionPresetId(config.regionPresetId);
    setTaxonomy(config.taxonomy);
    localStorage.setItem(`facility_${facility.id}_custom_shifts`, JSON.stringify(config.shifts));
    localStorage.setItem(`facility_${facility.id}_taxonomy`, JSON.stringify(config.taxonomy));
    localStorage.setItem(`facility_${facility.id}_holidays`, JSON.stringify(config.holidays));
    localStorage.setItem(`facility_${facility.id}_config`, JSON.stringify({
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
      localStorage.setItem('care_departments', JSON.stringify(scopedDepts));
    }

    // Staff
    const scopedStaff = staff.map(s => ({ ...s, facilityId: facility.id }));
    setStaffList(scopedStaff);
    localStorage.setItem(`facility_${facility.id}_staff_list`, JSON.stringify(scopedStaff));

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

  const handleUpdateFacility = (updatedFac: Facility) => {
    const updated = facilities.map(f => f.id === updatedFac.id ? updatedFac : f);
    setFacilities(updated);
    localStorage.setItem('care_facilities_list', JSON.stringify(updated));
    
    if (firebaseUser) {
      dbSetDoc('facilities', updatedFac.id, updatedFac).catch(handleGenericError);
    }
  };

  const handleDeleteFacility = async (facilityId: string) => {
    const updated = facilities.filter(f => f.id !== facilityId);
    setFacilities(updated);
    localStorage.setItem('care_facilities_list', JSON.stringify(updated));
    
    if (selectedFacilityId === facilityId) {
      if (updated.length > 0) {
        setSelectedFacilityId(updated[0].id);
      } else {
        setSelectedFacilityId('');
      }
    }
    
    if (firebaseUser) {
      try {
        await dbDeleteDoc('facilities', facilityId);
      } catch (e) {
        console.error('Failed to delete facility from Firestore', e);
        handleGenericError(e);
      }
    }
  };

  const handleCreateDepartment = async (newDept: Department) => {
    const updated = [...departments, newDept];
    setDepartments(updated);
    localStorage.setItem('care_departments', JSON.stringify(updated));
    if (firebaseUser) {
      try {
        await dbSetDoc('departments', newDept.id, newDept);
      } catch (e) {
        console.error('Failed to write department to Firestore', e);
        handleGenericError(e);
      }
    }
  };

  const handleDeleteDepartment = async (deptId: string) => {
    const updated = departments.filter(d => d.id !== deptId);
    setDepartments(updated);
    localStorage.setItem('care_departments', JSON.stringify(updated));
    if (firebaseUser) {
      try {
        await dbDeleteDoc('departments', deptId);
      } catch (e) {
        console.error('Failed to delete department from Firestore', e);
        handleGenericError(e);
      }
    }
  };

  const persistState = (key: 'staff_list' | 'active_cycle' | 'task_master' | 'daily_tasks' | 'approvals' | 'extra_hours_log', data: any) => {
    if (selectedFacilityId === 'kansanshi') {
      const legacyMap: Record<string, string> = {
        staff_list: 'kmh_staff_list',
        active_cycle: 'kmh_active_cycle',
        task_master: 'kmh_task_master',
        daily_tasks: 'kmh_daily_tasks',
        approvals: 'kmh_approvals',
        extra_hours_log: 'kmh_extra_hours_log'
      };
      localStorage.setItem(legacyMap[key], JSON.stringify(data));
    }
    if (selectedFacilityId) {
      localStorage.setItem(`facility_${selectedFacilityId}_${key}`, JSON.stringify(data));
    }

    // --- SECURE REAL-TIME CLOUD PROPAGATION ---
    if (firebaseUser) {
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
        dbSetDoc('cycles', data.id || `cycle-${selectedFacilityId}-2026-06-15`, data).catch(handleGenericError);
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
          dbSetDoc('taskMasters', item.id, item).catch(handleGenericError);
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
          dbSetDoc('dailyTasks', item.id, item).catch(handleGenericError);
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
          dbSetDoc('approvals', item.id, item).catch(handleGenericError);
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
          dbSetDoc('extraHours', item.id, item).catch(handleGenericError);
        });

        lastExtraHoursLogRef.current = data;
      }
    }
  };

  // Generate Daily chores for a specific selected date
  const generateDayTasks = (
    dateStr: string,
    uStaff: StaffMember[],
    uCycle: RosterCycle,
    uTasks: TaskMaster[],
    loadTally?: Record<string, number> // optional: when provided, balances assignment by load and is mutated in place
  ): DailyTask[] => {
    const list: DailyTask[] = [];
    const dow = new Date(dateStr + 'T00:00:00').getDay();
    const dayIdx = cycleDates.length > 0 ? cycleDates.indexOf(dateStr) : -1;
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
    const isPH = isPublicHoliday(dateStr, holidays);
    const dateObj = new Date(dateStr + 'T00:00:00');
    const isLastDOM = dateObj.getDate() === new Date(dateObj.getFullYear(), dateObj.getMonth() + 1, 0).getDate();

    uTasks.forEach(task => {
      if (!task.active) return;

      // Filter daily vs weekly vs monthly
      let isDue = false;
      if (task.frequency === 'Daily') isDue = true;
      else if (task.frequency.includes('Sunday') && dow === 0) isDue = true;
      else if (task.frequency.includes('Last day') && isLastDOM) isDue = true;
      else if (task.frequency.includes('Monthly') && (isLastDOM || dow === 4)) isDue = true; // simplify mock simulation

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
        localStorage.setItem(`facility_${selectedFacilityId}_daily_tasks`, JSON.stringify(combined));
        if (selectedFacilityId === 'kansanshi') {
          localStorage.setItem('kmh_daily_tasks', JSON.stringify(combined));
        }
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
    localStorage.setItem(`facility_${selectedFacilityId}_active_cycle`, JSON.stringify(updatedCycle));
    if (selectedFacilityId === 'kansanshi') {
      localStorage.setItem('kmh_active_cycle', JSON.stringify(updatedCycle));
    }
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
    localStorage.setItem(`facility_${selectedFacilityId}_active_cycle`, JSON.stringify(updatedCycle));
    if (selectedFacilityId === 'kansanshi') {
      localStorage.setItem('kmh_active_cycle', JSON.stringify(updatedCycle));
    }
    persistState('active_cycle', updatedCycle);
  };

  const handleRestoreCycle = (newCycle: RosterCycle) => {
    setActiveCycle(newCycle);
    const newDates = getDatesForCycle(newCycle.startDate);
    setCycleDates(newDates);
    localStorage.setItem(`facility_${selectedFacilityId}_cycle_dates`, JSON.stringify(newDates));
    localStorage.setItem(`facility_${selectedFacilityId}_active_cycle`, JSON.stringify(newCycle));
    if (selectedFacilityId === 'kansanshi') {
      localStorage.setItem('kmh_active_cycle', JSON.stringify(newCycle));
    }
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
    localStorage.setItem(`facility_${selectedFacilityId}_cycle_dates`, JSON.stringify(newDates));
    localStorage.setItem(`facility_${selectedFacilityId}_active_cycle`, JSON.stringify(updatedCycle));
    if (selectedFacilityId === 'kansanshi') {
      localStorage.setItem('kmh_active_cycle', JSON.stringify(updatedCycle));
    }
    persistState('active_cycle', updatedCycle);
  };

  const handleDeepAtomicPurge = async () => {
    try {
      setIsSyncingFirebase(true);

      // 1. Purge LocalStorage keys
      const keysToClear = [
        `facility_${selectedFacilityId}_staff_list`,
        `facility_${selectedFacilityId}_active_cycle`,
        `facility_${selectedFacilityId}_task_master`,
        `facility_${selectedFacilityId}_daily_tasks`,
        `facility_${selectedFacilityId}_approvals`,
        `facility_${selectedFacilityId}_extra_hours_log`,
        `facility_${selectedFacilityId}_timesheets_list`,
        `facility_${selectedFacilityId}_cycle_dates`,
        `facility_${selectedFacilityId}_taxonomy`,
        `facility_${selectedFacilityId}_custom_shifts`,
        'kmh_staff_list',
        'kmh_active_cycle',
        'kmh_task_master',
        'kmh_daily_tasks',
        'kmh_approvals',
        'kmh_extra_hours_log',
        'care_facilities_list',
        'care_departments'
      ];
      keysToClear.forEach(key => localStorage.removeItem(key));
      localStorage.setItem(`seeded_initially_${selectedFacilityId}`, 'true');

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
            const docs = await dbGetCollection<any>(colName);
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
        localStorage.setItem(`facility_${selectedFacilityId}_daily_tasks`, JSON.stringify(combined));
        if (selectedFacilityId === 'kansanshi') {
          localStorage.setItem('kmh_daily_tasks', JSON.stringify(combined));
        }
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
      localStorage.setItem(`facility_${selectedFacilityId}_daily_tasks`, JSON.stringify(combined));
      if (selectedFacilityId === 'kansanshi') {
        localStorage.setItem('kmh_daily_tasks', JSON.stringify(combined));
      }
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
  const handleRosterGenerate = (absences: AbsenceLog[], scTeamSize: number) => {
    if (!activeCycle) return;

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
        if (cycleDates.includes(dateStr)) {
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
    const suggestedShifts = runSmartPersonaOptimizer(staffList, cycleDates, holidays, mappedAbsences, effectiveRuleSet);

    const updatedCycle: RosterCycle = {
      ...activeCycle,
      shifts: suggestedShifts,
      isLocked: false // draft state
    };

    setActiveCycle(updatedCycle);
    persistState('active_cycle', updatedCycle);
    toast.success('Roster created — staff are spread across your configured rotation tracks.');
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
          actionStr = "Certified Compliant (Completed)";
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
          actionStr = "Awaiting Final Verification";
          detailsStr = `Progress reached ${t.trackerValue}/${t.trackerTarget}. Submitted for audit review.`;
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
      localStorage.setItem(`facility_${selectedFacilityId}_timesheets_list`, JSON.stringify(updatedList));
    }
    if (firebaseUser) {
      dbSetDoc('timesheets', updated.id, updated).catch(handleGenericError);
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

  // Gating route enforcement (RBAC)
  const isAuthorized = firebaseUser !== null || isSandboxBypassActive;
  const isRegisteredStaff = staffList.some(s => s.email?.toLowerCase().trim() === firebaseUser?.email?.toLowerCase().trim());
  const needsOnboarding = !!(firebaseUser && !isRegisteredStaff);

  // First-run: an authorized user with no workspace yet provisions one via the setup wizard.
  const showSetupWizard = isAuthorized && isHydrated && facilities.length === 0;

  if (showSetupWizard) {
    return (
      <SetupWizard
        onComplete={handleCompleteSetup}
        suggestedManagerName={firebaseUser?.displayName || ''}
        suggestedManagerEmail={firebaseUser?.email || ''}
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
        />

        {/* Main Panel views */}
        <main className="flex-1 p-6 w-full overflow-hidden">
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
                    onDismiss={() => { try { localStorage.setItem(`setup_hidden_${selectedFacilityId}`, '1'); } catch {} setSetupHidden(true); }}
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
            />
          )}

          {/* Daily tasks checklists board */}
          {currentTab === 'tasks' && activeCycle && (
            <div className="flex flex-col gap-6">
              <div className="flex justify-between items-center bg-white py-3 px-5 border border-slate-100 rounded-xl">
                <span className="text-xs text-gray-500 font-bold uppercase select-none">My tasks</span>
                <span className="text-xs bg-[#f3ebd3]/40 text-[#c55a11] border border-[#cbdff0] px-3 py-1 rounded-full font-bold">
                  🔐 Your space
                </span>
              </div>

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
              facilities={facilities}
              onCreateFacility={handleCreateFacility}
              onUpdateFacility={handleUpdateFacility}
              onDeleteFacility={handleDeleteFacility}
              selectedFacilityId={selectedFacilityId}
              setSelectedFacilityId={setSelectedFacilityId}
              staffList={staffList}
              setStaffList={setStaffList}
              taskMasterList={taskMasterList}
              setTaskMasterList={(list) => {
                setTaskMasterList(list);
                persistState('task_master', list);
              }}
              shifts={shifts}
              setShifts={setShifts}
              departments={departments}
              setDepartments={setDepartments}
              onCreateDepartment={handleCreateDepartment}
              onDeleteDepartment={handleDeleteDepartment}
              currentDeptId={currentDeptId}
              setCurrentDeptId={setCurrentDeptId}
              isSandboxStrictMode={isSandboxStrictMode}
              setIsSandboxStrictMode={setIsSandboxStrictMode}
              openOnboarding={() => setIsOnboardingOpen(true)}
              taxonomy={taxonomy}
              setTaxonomy={setTaxonomy}
              onFullReset={handleDeepAtomicPurge}
              ruleSet={ruleSet}
              setRuleSet={setRuleSet}
              taskCategories={taskCategories}
              setTaskCategories={setTaskCategories}
              facilityTypes={facilityTypes}
              setFacilityTypes={setFacilityTypes}
              holidays={holidays}
              setHolidays={setHolidays}
              timezoneLabel={timezoneLabel}
              setTimezoneLabel={setTimezoneLabel}
              regionPresetId={regionPresetId}
              setRegionPresetId={setRegionPresetId}
              accessLevel={access.accessLevel}
            />
          )}
        </main>
      </div>

      {/* Roster Optimizer setup Wizard modal overlay */}
      <WizardModal
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        staffList={staffList}
        setStaffList={setStaffList}
        taskMasterList={taskMasterList}
        setTaskMasterList={setTaskMasterList}
        departments={departments}
        selectedFacilityId={selectedFacilityId}
        onGenerate={handleRosterGenerate}
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
