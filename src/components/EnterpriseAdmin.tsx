import React, { useState, useEffect } from 'react';
import { StaffMember, Facility, Department, ShiftDef, TaskMaster, RosterRuleSet, PublicHoliday, patternLabel } from '../types';
import { HOLIDAY_PRESETS, getHolidayPreset, buildDefaultRuleSet } from '../data/initialData';
import { useToast } from './ui/ToastProvider';
import { useConfirm } from './ui/ConfirmProvider';
import {
  Sliders,
  Plus,
  Trash2,
  ShieldCheck,
  Building2,
  Users,
  Database,
  Check,
  Info,
  Layout,
  Lock,
  Unlock,
  Eye,
  RefreshCcw,
  Clock,
  Sparkles,
  Layers,
  Pencil,
  Globe,
  Calendar,
  RotateCcw
} from 'lucide-react';

interface EnterpriseAdminProps {
  facilities: Facility[];
  onCreateFacility: (newFac: Facility) => void;
  onUpdateFacility: (fac: Facility) => void;
  onDeleteFacility: (id: string) => void;
  selectedFacilityId: string;
  setSelectedFacilityId: (id: string) => void;
  staffList: StaffMember[];
  setStaffList: (list: StaffMember[]) => void;
  taskMasterList: TaskMaster[];
  setTaskMasterList: (list: TaskMaster[]) => void;
  shifts: { [code: string]: ShiftDef };
  setShifts: (shifts: { [code: string]: ShiftDef }) => void;
  // Multi-tenant controls
  departments: Department[];
  setDepartments: (depts: Department[]) => void;
  onCreateDepartment?: (newDept: Department) => void;
  onDeleteDepartment?: (id: string) => void;
  currentDeptId: string;
  setCurrentDeptId: (id: string) => void;
  isSandboxStrictMode: boolean;
  setIsSandboxStrictMode: (val: boolean) => void;
  openOnboarding?: () => void;
  taxonomy: {
    appName: string;
    workspaceSingular: string;
    workspacePlural: string;
    memberSingular: string;
    memberPlural: string;
    groupSingular: string;
    groupPlural: string;
    taskSingular: string;
    taskPlural: string;
  };
  setTaxonomy: (tax: any) => void;
  onFullReset?: () => Promise<void>;
  // Configuration-driven workspace settings
  ruleSet: RosterRuleSet;
  setRuleSet: (rs: RosterRuleSet) => void;
  taskCategories: string[];
  setTaskCategories: (cats: string[]) => void;
  facilityTypes: string[];
  setFacilityTypes: (types: string[]) => void;
  holidays: PublicHoliday[];
  setHolidays: (h: PublicHoliday[]) => void;
  timezoneLabel: string;
  setTimezoneLabel: (tz: string) => void;
  regionPresetId?: string;
  setRegionPresetId: (id: string | undefined) => void;
  accessLevel?: string; // current user's tier — gates role assignment + facility ops
}

export default function EnterpriseAdmin({
  facilities,
  onCreateFacility,
  onUpdateFacility,
  onDeleteFacility,
  selectedFacilityId,
  setSelectedFacilityId,
  staffList,
  setStaffList,
  taskMasterList,
  setTaskMasterList,
  shifts,
  setShifts,
  departments,
  setDepartments,
  onCreateDepartment,
  onDeleteDepartment,
  currentDeptId,
  setCurrentDeptId,
  isSandboxStrictMode,
  setIsSandboxStrictMode,
  openOnboarding,
  taxonomy,
  setTaxonomy,
  onFullReset,
  ruleSet,
  setRuleSet,
  taskCategories,
  setTaskCategories,
  facilityTypes,
  setFacilityTypes,
  holidays,
  setHolidays,
  timezoneLabel,
  setTimezoneLabel,
  regionPresetId,
  setRegionPresetId,
  accessLevel = 'staff',
}: EnterpriseAdminProps) {
  const toast = useToast();
  const confirm = useConfirm();

  // Which access tiers the current user may grant to others. Super users can
  // appoint facility managers; facility managers and dept heads can appoint
  // department heads (proxies); nobody grants 'superuser' here (allowlist only).
  const ROLE_OPTIONS: { value: string; label: string }[] = [
    { value: 'staff', label: 'Staff' },
    { value: 'dept_head', label: 'Department Head' },
    { value: 'facility_manager', label: 'Facility Manager' },
  ];
  const assignableRoles = accessLevel === 'superuser'
    ? ROLE_OPTIONS
    : accessLevel === 'facility_manager'
      ? ROLE_OPTIONS.filter(r => r.value !== 'facility_manager')
      : accessLevel === 'dept_head'
        ? ROLE_OPTIONS.filter(r => r.value === 'staff' || r.value === 'dept_head')
        : ROLE_OPTIONS.filter(r => r.value === 'staff');
  const canManageFacilities = accessLevel === 'superuser';
  const [activeSubTab, setActiveSubTab] = useState<'silos' | 'shifts' | 'rules' | 'regional' | 'staff' | 'tasks' | 'sandbox' | 'taxonomy' | 'purge'>('silos');

  // Codes referenced by the active ruleset are protected from deletion (they keep
  // the scheduler coherent). Everything else is freely editable/removable.
  const protectedShiftCodes = React.useMemo(() => {
    const codes = new Set<string>();
    const rs = ruleSet;
    if (rs.managerTrack) { codes.add(rs.managerTrack.weekdayShift); codes.add(rs.managerTrack.weekendShift); }
    (rs.autoAssignments || []).forEach(a => codes.add(a.shiftCode));
    if (rs.personalDayOff) codes.add(rs.personalDayOff.shiftCode);
    (rs.rotationTracks || []).forEach(t => { codes.add(t.weekdayShift); codes.add(t.weekendShift); });
    (rs.restConstraints?.nonWorkingCodes || []).forEach(c => codes.add(c));
    return codes;
  }, [ruleSet]);

  // Editing Facility State
  const [editingFacility, setEditingFacility] = useState<Facility | null>(null);
  const [facEditName, setFacEditName] = useState('');
  const [facEditLoc, setFacEditLoc] = useState('');
  const [facEditManager, setFacEditManager] = useState('');
  const [facEditType, setFacEditType] = useState<string>('Primary Care');
  const [facEditSlaTemp, setFacEditSlaTemp] = useState('');
  const [facEditKpi, setFacEditKpi] = useState('');
  const [facEditIp, setFacEditIp] = useState('');

  // Inline create Facility States
  const [showAddFacilityForm, setShowAddFacilityForm] = useState(false);
  const [facNewName, setFacNewName] = useState('');
  const [facNewLoc, setFacNewLoc] = useState('');
  const [facNewManager, setFacNewManager] = useState('');
  const [facNewType, setFacNewType] = useState<string>('Primary Care');
  const [facNewSlaTemp, setFacNewSlaTemp] = useState('2.0 – 8.0°C SLA');
  const [facNewKpi, setFacNewKpi] = useState('Verify dynamic checklist inputs');
  const [facNewIp, setFacNewIp] = useState('192.168.10.15');

  // New Department Form State
  const [newDeptName, setNewDeptName] = useState('');
  const [newDeptDesc, setNewDeptDesc] = useState('');

  // AI Suggestions states
  const [aiSuggesting, setAiSuggesting] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [suggestedObjective, setSuggestedObjective] = useState<string | null>(null);
  const [suggestedCategories, setSuggestedCategories] = useState<string[]>([]);
  const [suggestedTasks, setSuggestedTasks] = useState<{
    name: string;
    category: string;
    pattern: string;
    priority: string;
    frequency: string;
    notes: string;
    assignedValue: string;
    checked: boolean;
  }[]>([]);

  // New Shift Form State
  const [newShiftCode, setNewShiftCode] = useState('');
  const [newShiftName, setNewShiftName] = useState('');
  const [newShiftTime, setNewShiftTime] = useState('08:00 – 17:00');
  const [newShiftHours, setNewShiftHours] = useState(9);
  const [newShiftBg, setNewShiftBg] = useState('#E0F7FA');
  const [newShiftFg, setNewShiftFg] = useState('#006064');

  // New Staff Form State
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffFullName, setNewStaffFullName] = useState('');
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [newStaffPhone, setNewStaffPhone] = useState('');
  const [newStaffRole, setNewStaffRole] = useState('Operator');
  const [newStaffEmpNo, setNewStaffEmpNo] = useState('');
  const [newStaffHoursVal, setNewStaffHoursVal] = useState(168);
  const [newStaffGender, setNewStaffGender] = useState<'F' | 'M' | ''>('M');
  const [newStaffDeptId, setNewStaffDeptId] = useState('');
  const [newStaffIsManager, setNewStaffIsManager] = useState(false);
  const [newStaffSkills, setNewStaffSkills] = useState('');
  const [newStaffAccessLevel, setNewStaffAccessLevel] = useState('staff');

  // Edit Staff Form State
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [editName, setEditName] = useState('');
  const [editFullName, setEditFullName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editRole, setEditRole] = useState('');
  const [editEmpNo, setEditEmpNo] = useState('');
  const [editHoursVal, setEditHoursVal] = useState(168);
  const [editGender, setEditGender] = useState<'F' | 'M' | ''>('M');
  const [editDeptId, setEditDeptId] = useState('');
  const [editIsManager, setEditIsManager] = useState(false);
  const [editSkills, setEditSkills] = useState('');
  const [editAccessLevel, setEditAccessLevel] = useState('staff');

  const handleStartEdit = (staff: StaffMember) => {
    setEditingStaff(staff);
    setEditName(staff.name || '');
    setEditFullName(staff.fullName || '');
    setEditEmail(staff.email || '');
    setEditPhone(staff.phone || '');
    setEditRole(staff.role || 'Operator');
    setEditEmpNo(staff.employeeNo || '');
    setEditHoursVal(staff.contractedHours || 168);
    setEditGender(staff.gender || 'M');
    setEditDeptId(staff.departmentId || '');
    setEditIsManager(!!staff.isManager);
    setEditSkills((staff.skills || []).join(', '));
    setEditAccessLevel(staff.accessLevel || (staff.isManager ? 'facility_manager' : 'staff'));
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStaff) return;
    if (!editName || !editFullName || !editEmpNo) {
      toast.error('Please fill out all required fields.');
      return;
    }

    const updated = staffList.map(s => {
      if (s.id === editingStaff.id) {
        return {
          ...s,
          name: editName,
          fullName: editFullName,
          email: editEmail || `${editName.toLowerCase()}@${selectedFacilityId}workspace.com`,
          phone: editPhone || '',
          role: editRole,
          employeeNo: editEmpNo,
          contractedHours: Number(editHoursVal),
          gender: editGender,
          departmentId: editDeptId || undefined,
          accessLevel: editAccessLevel as StaffMember['accessLevel'],
          // Keep legacy isManager in sync with the access tier for older code paths.
          isManager: editAccessLevel !== 'staff',
          skills: editSkills.split(',').map(x => x.trim()).filter(Boolean),
        };
      }
      return s;
    });

    setStaffList(updated);
    setEditingStaff(null);
  };

  // New Task Form State
  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskCategory, setNewTaskCategory] = useState<string>(taskCategories[0] || 'General');
  const [addingTaskCat, setAddingTaskCat] = useState(false);
  const [newTaskCatInput, setNewTaskCatInput] = useState('');
  const commitNewTaskCat = () => {
    const name = newTaskCatInput.trim();
    if (!name) { setAddingTaskCat(false); return; }
    if (!taskCategories.some(c => c.toLowerCase() === name.toLowerCase())) setTaskCategories([...taskCategories, name]);
    setNewTaskCategory(name);
    setNewTaskCatInput('');
    setAddingTaskCat(false);
  };
  const [newTaskPattern, setNewTaskPattern] = useState<TaskMaster['pattern']>('Shift-based');
  const [newTaskAssignedVal, setNewTaskAssignedVal] = useState('Shift A');
  const [newTaskPriority, setNewTaskPriority] = useState<TaskMaster['priority']>('Standard');
  const [newTaskFreq, setNewTaskFreq] = useState('Daily');
  const [newTaskNotes, setNewTaskNotes] = useState('');
  const [newTaskTarget, setNewTaskTarget] = useState<number | undefined>(undefined);

  const handleEditFacilitySelect = (fac: Facility) => {
    setEditingFacility(fac);
    setFacEditName(fac.name);
    setFacEditLoc(fac.location);
    setFacEditManager(fac.leadManager);
    setFacEditType(fac.facilitiesType);
    setFacEditSlaTemp(fac.fridgeTargetTemp);
    setFacEditKpi(fac.dailyKpiWordCheck);
    setFacEditIp(fac.ipDevice);
  };

  const handleUpdateFacilitySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFacility) return;
    onUpdateFacility({
      ...editingFacility,
      name: facEditName,
      location: facEditLoc,
      leadManager: facEditManager,
      facilitiesType: facEditType,
      fridgeTargetTemp: facEditSlaTemp,
      dailyKpiWordCheck: facEditKpi,
      ipDevice: facEditIp,
    });
    setEditingFacility(null);
  };

  const handleInlineCreateFacility = (e: React.FormEvent) => {
    e.preventDefault();
    if (!facNewName || !facNewLoc || !facNewManager) {
      toast.error('Please fill out all required fields.');
      return;
    }
    const newId = facNewName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const newFac: Facility = {
      id: newId,
      name: facNewName,
      location: facNewLoc,
      leadManager: facNewManager,
      fridgeTargetTemp: facNewSlaTemp,
      dailyKpiWordCheck: facNewKpi,
      ipDevice: facNewIp,
      facilitiesType: facNewType,
    };
    onCreateFacility(newFac);
    
    // Clear
    setFacNewName('');
    setFacNewLoc('');
    setFacNewManager('');
    setFacNewType('Primary Care');
    setFacNewSlaTemp('2.0 – 8.0°C SLA');
    setFacNewKpi('Verify dynamic checklist inputs');
    setFacNewIp('192.168.10.15');
    setShowAddFacilityForm(false);
  };

  // Active facility helper
  const activeFacility = facilities.find(f => f.id === selectedFacilityId) || facilities[0];

  // Load and Filter Departments for Active Facility
  const facilityDepts = departments.filter(d => d.facilityId === selectedFacilityId);

  // Suggested Tasks helper from Gemini AI
  const handleFetchSuggestions = async () => {
    if (!newDeptName.trim()) {
      toast.error('Please enter a department name first.');
      return;
    }

    setAiSuggesting(true);
    setAiError(null);
    setSuggestedObjective(null);
    setSuggestedCategories([]);
    setSuggestedTasks([]);

    try {
      const res = await fetch('/api/suggest-department-tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          departmentName: newDeptName,
          userDescription: newDeptDesc,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Server returned status ${res.status}`);
      }

      const data = await res.json();
      setSuggestedObjective(data.description);
      const aiCategories: string[] = Array.isArray(data.categories)
        ? data.categories.map((c: any) => String(c).trim()).filter(Boolean)
        : [];
      setSuggestedCategories(aiCategories);
      if (Array.isArray(data.tasks)) {
        setSuggestedTasks(
          data.tasks.map((task: any) => ({
            name: task.name || '',
            category: (task.category && String(task.category).trim()) || aiCategories[0] || newDeptName,
            pattern: task.pattern || 'Shift-based',
            priority: task.priority || 'Standard',
            frequency: task.frequency || 'Daily',
            notes: task.notes || 'No description provided.',
            assignedValue: task.assignedValue || 'Shift A',
            checked: true,
          }))
        );
      }
    } catch (err: any) {
      console.error('Failed to fetch AI suggestions:', err);
      setAiError(err.message || 'An unexpected error occurred while getting AI suggestions.');
    } finally {
      setAiSuggesting(false);
    }
  };

  // Create Department
  const handleCreateDept = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeptName) return;

    const deptId = `${selectedFacilityId}-${newDeptName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
    if (departments.some(d => d.id === deptId)) {
      toast.error(`A ${taxonomy.groupSingular.toLowerCase()} with this identifier already exists.`);
      return;
    }

    const newDept: Department = {
      id: deptId,
      facilityId: selectedFacilityId,
      name: newDeptName,
      description: newDeptDesc || 'No custom description provided.'
    };

    if (onCreateDepartment) {
      onCreateDepartment(newDept);
    } else {
      const updated = [...departments, newDept];
      setDepartments(updated);
    }

    // Merge the AI-proposed taxonomy into the workspace categories (case-insensitive dedupe)
    const activeTasks = suggestedTasks.filter(t => t.checked);
    const categoriesFromAi = [
      ...suggestedCategories,
      ...activeTasks.map(t => t.category),
    ].map(c => (c || '').trim()).filter(Boolean);
    if (categoriesFromAi.length > 0) {
      const seen = new Set(taskCategories.map(c => c.toLowerCase()));
      const merged = [...taskCategories];
      categoriesFromAi.forEach(c => {
        if (!seen.has(c.toLowerCase())) {
          seen.add(c.toLowerCase());
          merged.push(c);
        }
      });
      if (merged.length !== taskCategories.length) setTaskCategories(merged);
    }

    // Auto-create suggested checked tasks, each tagged with its AI category
    if (activeTasks.length > 0) {
      const newTasksToAdd: TaskMaster[] = activeTasks.map((t, idx) => ({
        id: `tasks-${deptId}-${idx}-${Date.now()}`,
        name: t.name,
        category: (t.category && t.category.trim()) || newDeptName,
        pattern: t.pattern as any,
        assignedValue: t.assignedValue,
        priority: t.priority as any,
        frequency: t.frequency,
        compliance: false,
        active: true,
        notes: t.notes || 'No operational notes provided.'
      }));
      setTaskMasterList([...taskMasterList, ...newTasksToAdd]);
    }

    // Reset Form & Suggestion states
    setNewDeptName('');
    setNewDeptDesc('');
    setSuggestedObjective(null);
    setSuggestedCategories([]);
    setSuggestedTasks([]);
  };

  // Create Shift
  const handleCreateShift = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newShiftCode || !newShiftName) return;

    const codeUpper = newShiftCode.toUpperCase().trim();
    if (shifts[codeUpper]) {
      toast.error(`Shift code "${codeUpper}" is already in use. Please choose a unique code.`);
      return;
    }

    const newShift: ShiftDef = {
      code: codeUpper,
      name: newShiftName,
      time: newShiftTime,
      hours: Number(newShiftHours),
      bg: newShiftBg,
      fg: newShiftFg,
      active: true
    };

    const updated = { ...shifts, [codeUpper]: newShift };
    setShifts(updated);
    
    // Reset Form
    setNewShiftCode('');
    setNewShiftName('');
    setNewShiftTime('08:00 – 17:00');
    setNewShiftHours(9);
  };

  // Create Staff
  const handleCreateStaff = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStaffName || !newStaffFullName || !newStaffEmpNo) {
      toast.error('Please fill out all required fields.');
      return;
    }

    const generatedId = `custom-staff-${Date.now()}`;
    const newStaff: StaffMember = {
      id: generatedId,
      name: newStaffName,
      fullName: newStaffFullName,
      email: newStaffEmail || `${newStaffName.toLowerCase()}@${selectedFacilityId}.workspace`,
      phone: newStaffPhone || '',
      role: newStaffRole,
      contractedHours: Number(newStaffHoursVal),
      gender: newStaffGender,
      employeeNo: newStaffEmpNo,
      accessLevel: newStaffAccessLevel as StaffMember['accessLevel'],
      // Keep legacy isManager in sync with the access tier for older code paths.
      isManager: newStaffAccessLevel !== 'staff',
      facilityId: selectedFacilityId,
      departmentId: newStaffDeptId || undefined,
      skills: newStaffSkills.split(',').map(x => x.trim()).filter(Boolean),
    };

    const updated = [...staffList, newStaff];
    setStaffList(updated);

    // Reset Form
    setNewStaffName('');
    setNewStaffFullName('');
    setNewStaffEmail('');
    setNewStaffPhone('');
    setNewStaffRole('Operator');
    setNewStaffEmpNo('');
    setNewStaffIsManager(false);
    setNewStaffSkills('');
    setNewStaffAccessLevel('staff');
  };

  // Create Task Workflow
  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskName) return;

    const generatedId = `custom-task-${Date.now()}`;
    const newTask: TaskMaster = {
      id: generatedId,
      name: newTaskName,
      category: newTaskCategory,
      pattern: newTaskPattern,
      assignedValue: newTaskAssignedVal,
      priority: newTaskPriority,
      frequency: newTaskFreq,
      notes: newTaskNotes || `Self-configured task utilizing the ${newTaskPattern} allocation workflow.`,
      compliance: false,
      active: true,
      trackerTarget: newTaskTarget
    };

    const updated = [...taskMasterList, newTask];
    setTaskMasterList(updated);

    // Reset Form
    setNewTaskName('');
    setNewTaskNotes('');
    setNewTaskTarget(undefined);
  };

  const deleteDepartment = async (id: string) => {
    if (await confirm({ title: `Retire this ${taxonomy.groupSingular.toLowerCase()}?`, message: `Members assigned here will have their mappings removed.`, danger: true, confirmLabel: 'Retire' })) {
      if (onDeleteDepartment) {
        onDeleteDepartment(id);
      } else {
        setDepartments(departments.filter(d => d.id !== id));
      }
      if (currentDeptId === id) {
        setCurrentDeptId('');
      }
    }
  };

  const deleteShift = async (code: string) => {
    if (protectedShiftCodes.has(code)) {
      toast.error('This shift is referenced by your roster rules and cannot be deleted. Update Roster Rules first to free it up.');
      return;
    }
    if (await confirm({ title: `Remove shift "${code}"?`, danger: true, confirmLabel: 'Remove' })) {
      const updated = { ...shifts };
      delete updated[code];
      setShifts(updated);
    }
  };

  const deleteStaff = async (id: string) => {
    if (await confirm({ title: `Remove this ${taxonomy.memberSingular.toLowerCase()}?`, message: 'They will be permanently removed from this workspace.', danger: true, confirmLabel: 'Remove' })) {
      setStaffList(staffList.filter(s => s.id !== id));
    }
  };

  const wipeAllStaff = async () => {
    if (await confirm({ title: `Remove ALL ${taxonomy.memberPlural.toLowerCase()}?`, message: 'This empties the directory and cannot be undone.', danger: true, confirmLabel: 'Remove all' })) {
      setStaffList([]);
    }
  };

  return (
    <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 flex flex-col gap-6" id="enterprise-setup-root">
      
      {/* Title & Description */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-gray-100 pb-5">
        <div>
          <span className="text-[11px] bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-full font-semibold">
            {taxonomy.appName} settings
          </span>
          <h2 className="text-xl font-black text-slate-800 mt-1 flex items-center gap-2">
            <Sliders className="w-5 h-5 text-indigo-600" /> Settings
          </h2>
          <p className="text-xs text-slate-500 font-sans mt-0.5">
            Set up shifts, {taxonomy.groupPlural.toLowerCase()}, staff, tasks, and roster rules — and control who can see what.
          </p>
        </div>

        {/* Sandbox Strictness Control Box */}
        <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 flex items-center gap-3 w-full md:w-auto">
          {isSandboxStrictMode ? (
            <Lock className="w-5 h-5 text-indigo-600 animate-[bounce_2s_infinite]" />
          ) : (
            <Unlock className="w-5 h-5 text-amber-500" />
          )}
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-slate-700">Show one {taxonomy.groupSingular.toLowerCase()} at a time</span>
              <button 
                onClick={() => setIsSandboxStrictMode(!isSandboxStrictMode)}
                className={`text-[9px] px-2 py-0.5 rounded font-bold ${
                  isSandboxStrictMode ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-800'
                }`}
              >
                {isSandboxStrictMode ? 'On' : 'Off (show all)'}
              </button>
            </div>
            <p className="text-[9.5px] text-slate-500 mt-0.5">
              Restricts access strictly based on dynamic {taxonomy.groupSingular.toLowerCase()} membership.
            </p>
          </div>
        </div>
      </div>

      {/* Sub Navigation Tabs */}
      <div className="flex flex-wrap gap-1.5 border-b border-gray-100 pb-2">
        <button
          onClick={() => setActiveSubTab('silos')}
          className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-colors cursor-pointer ${
            activeSubTab === 'silos' ? 'bg-indigo-950 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Building2 className="w-4 h-4" /> {taxonomy.workspacePlural} & {taxonomy.groupPlural}
        </button>
        <button
          onClick={() => setActiveSubTab('shifts')}
          className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-colors cursor-pointer ${
            activeSubTab === 'shifts' ? 'bg-indigo-950 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Clock className="w-4 h-4" /> Shift Planner
        </button>
        <button
          onClick={() => setActiveSubTab('rules')}
          className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-colors cursor-pointer ${
            activeSubTab === 'rules' ? 'bg-indigo-950 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Layers className="w-4 h-4" /> Roster Rules
        </button>
        <button
          onClick={() => setActiveSubTab('regional')}
          className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-colors cursor-pointer ${
            activeSubTab === 'regional' ? 'bg-indigo-950 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Globe className="w-4 h-4" /> Regional
        </button>
        <button
          onClick={() => setActiveSubTab('staff')}
          className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-colors cursor-pointer ${
            activeSubTab === 'staff' ? 'bg-indigo-950 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Users className="w-4 h-4" /> {taxonomy.memberPlural} directory
        </button>
        <button
          onClick={() => setActiveSubTab('tasks')}
          className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-colors cursor-pointer ${
            activeSubTab === 'tasks' ? 'bg-indigo-950 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Database className="w-4 h-4" /> Customized {taxonomy.taskPlural}
        </button>
        <button
          onClick={() => setActiveSubTab('sandbox')}
          className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-colors cursor-pointer ${
            activeSubTab === 'sandbox' ? 'bg-indigo-950 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <ShieldCheck className="w-4 h-4 text-emerald-500" /> Department View
        </button>
        <button
          onClick={() => setActiveSubTab('taxonomy')}
          className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-colors cursor-pointer ${
            activeSubTab === 'taxonomy' ? 'bg-indigo-950 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Sliders className="w-4 h-4 text-sky-500" /> Terminology & Labels
        </button>
        <button
          onClick={() => setActiveSubTab('purge')}
          className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-colors cursor-pointer ${
            activeSubTab === 'purge' ? 'bg-rose-955 bg-rose-900 text-white shadow-xs' : 'text-rose-600 hover:bg-rose-50'
          }`}
        >
          <Trash2 className="w-4 h-4 text-rose-500" /> Factory Reset
        </button>
      </div>

      {/* SUB-TAB 1: Clinics & Departments */}
      {activeSubTab === 'silos' && (
        <div className="space-y-8 animate-[fadeIn_0.15s_ease-out]">
          {/* SECTION A: WORKSPACE MANAGEMENT */}
          <div className="bg-slate-50/50 p-6 rounded-3xl border border-slate-100 text-left">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
              <div>
                <h3 className="text-sm font-black text-slate-800 mb-0.5 flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-indigo-650" /> Configure & Manage {taxonomy.workspacePlural}
                </h3>
                <p className="text-xs text-slate-500 font-sans leading-relaxed">
                  Dynamically provision, edit, select, or delete custom {taxonomy.workspacePlural.toLowerCase()} in real-time.
                </p>
              </div>
              {canManageFacilities && (
                <button
                  type="button"
                  onClick={() => setShowAddFacilityForm(!showAddFacilityForm)}
                  className="px-4 py-2 bg-indigo-950 hover:bg-slate-900 text-white font-extrabold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer w-full md:w-auto self-start"
                >
                  <Plus className="w-4 h-4" /> Add custom {taxonomy.workspaceSingular}
                </button>
              )}
            </div>

            {/* Fac New Inline Form */}
            {showAddFacilityForm && (
              <form onSubmit={handleInlineCreateFacility} className="bg-white p-5 rounded-2xl border border-slate-200 mb-6 space-y-4 animate-[fadeIn_0.15s_ease-out] shadow-sm">
                <h4 className="text-xs font-black uppercase text-indigo-950">Add New {taxonomy.workspaceSingular}</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[9px] font-black text-slate-400 font-mono">Workspace Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Lusaka Health Center"
                      value={facNewName}
                      onChange={(e) => setFacNewName(e.target.value)}
                      className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-600 focus:bg-white mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-slate-400 font-mono">Location / Region *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Lusaka Central, Zambia"
                      value={facNewLoc}
                      onChange={(e) => setFacNewLoc(e.target.value)}
                      className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-600 focus:bg-white mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-slate-400 font-mono">Lead Operations Manager *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Dr. Arthur Tembo"
                      value={facNewManager}
                      onChange={(e) => setFacNewManager(e.target.value)}
                      className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-600 focus:bg-white mt-1"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <label className="text-[9px] font-black text-slate-400 font-mono">Workspace Classification</label>
                    <select
                      value={facNewType}
                      onChange={(e) => setFacNewType(e.target.value)}
                      className="w-full text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-600 focus:bg-white mt-1"
                    >
                      {facilityTypes.map(ft => <option key={ft} value={ft}>{ft}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-slate-400 font-mono">Fridge SLA Temp Range</label>
                    <input
                      type="text"
                      placeholder="e.g. 2.0°C – 8.0°C SLA"
                      value={facNewSlaTemp}
                      onChange={(e) => setFacNewSlaTemp(e.target.value)}
                      className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-600 focus:bg-white mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-slate-400 font-mono">KPI Audit Phrase</label>
                    <input
                      type="text"
                      placeholder="e.g. System Backup completed"
                      value={facNewKpi}
                      onChange={(e) => setFacNewKpi(e.target.value)}
                      className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-600 focus:bg-white mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-slate-400 font-mono">Compliance Gateway IP</label>
                    <input
                      type="text"
                      placeholder="e.g. 192.168.10.15"
                      value={facNewIp}
                      onChange={(e) => setFacNewIp(e.target.value)}
                      className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-600 focus:bg-white mt-1"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowAddFacilityForm(false)}
                    className="px-4 py-2 bg-slate-200 hover:bg-slate-350 text-slate-750 font-bold text-xs rounded-xl cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-indigo-950 hover:bg-slate-900 text-white font-bold text-xs rounded-xl cursor-pointer flex items-center gap-1"
                  >
                    <Check className="w-4 h-4" /> Save {taxonomy.workspaceSingular}
                  </button>
                </div>
              </form>
            )}

            {/* Facility Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-2">
              {facilities.map((fac) => {
                const isActive = fac.id === selectedFacilityId;
                return (
                  <div
                    key={fac.id}
                    className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${
                      isActive
                        ? 'bg-white border-indigo-200 ring-2 ring-indigo-650/15 shadow-md'
                        : 'bg-white border-slate-200 hover:border-slate-350'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex justify-between items-start gap-1">
                        <div>
                          <span className="text-[9px] bg-indigo-50 text-indigo-750 px-2 py-0.5 rounded-full font-mono font-black block w-max">
                            {fac.facilitiesType || 'Custom Site'}
                          </span>
                          <h4 className="text-xs font-black text-slate-850 mt-1 leading-snug">{fac.name}</h4>
                        </div>
                        <div className={`flex items-center gap-0.5 shrink-0 ${canManageFacilities ? '' : 'hidden'}`}>
                          <button
                            type="button"
                            onClick={() => handleEditFacilitySelect(fac)}
                            className="p-1 hover:text-indigo-600 text-slate-400 rounded-lg hover:bg-slate-50 transition-colors"
                            title="Edit details"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              if (facilities.length <= 1) {
                                toast.error(`Can't remove the last ${taxonomy.workspaceSingular.toLowerCase()} — at least one must exist.`);
                                return;
                              }
                              if (await confirm({ title: `Remove this ${taxonomy.workspaceSingular.toLowerCase()}?`, message: 'Its details will be lost.', danger: true, confirmLabel: 'Remove' })) {
                                onDeleteFacility(fac.id);
                              }
                            }}
                            className="p-1 hover:text-rose-600 text-slate-400 rounded-lg hover:bg-slate-50 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <p className="text-[10px] text-slate-600 font-semibold">
                        📍 {fac.location}
                      </p>
                      <p className="text-[10px] text-slate-500 font-semibold truncate" title={fac.leadManager}>
                        👤 Supervisor: {fac.leadManager}
                      </p>

                      <div className="text-[9px] bg-slate-50 p-2 rounded-xl border border-slate-100 space-y-1 font-mono text-slate-600">
                        <div className="truncate">🌡️ Temp SLA: {fac.fridgeTargetTemp}</div>
                        <div className="truncate">🔌 Gateway IP: {fac.ipDevice}</div>
                        <div className="truncate" title={fac.dailyKpiWordCheck}>📋 KPI: {fac.dailyKpiWordCheck}</div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedFacilityId(fac.id)}
                      className={`w-full mt-4 py-2 rounded-xl text-[10px] font-black transition-all uppercase flex items-center justify-center gap-1.5 cursor-pointer ${
                        isActive
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 cursor-default shadow-xs font-extrabold'
                          : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-950 border border-indigo-100'
                      }`}
                      disabled={isActive}
                    >
                      {isActive ? (
                        <>
                          <Check className="w-3.5 h-3.5" strokeWidth={3} />
                          Active Context
                        </>
                      ) : (
                        'Activate Site'
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* SECTION B: SUB-TEAMS DEPARTMENTS */}
          <div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1 bg-slate-50/70 p-5 rounded-3xl border border-slate-100 text-left">
                <h3 className="text-xs font-black text-slate-805 mb-2">Add custom {taxonomy.groupSingular}</h3>
                <p className="text-[11px] text-slate-500 mb-4">
                  Partition the <strong className="text-slate-750">{activeFacility.name}</strong> workspace into dynamic sub-teams for discrete roster scheduling.
                </p>

                <form onSubmit={handleCreateDept} className="space-y-3">
                  <div>
                    <label className="text-[9.5px] font-black text-slate-400 font-mono">{(taxonomy.groupSingular)} name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Pharmacy, Core Services, Technical Hub"
                      value={newDeptName}
                      onChange={(e) => setNewDeptName(e.target.value)}
                      className="w-full text-xs font-semibold bg-white border border-slate-200 rounded-xl p-3 outline-none focus:border-indigo-600 mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-[9.5px] font-black text-slate-400 font-mono">Description / Objectives</label>
                    <textarea
                      placeholder="Define the primary operational objectives..."
                      value={newDeptDesc}
                      onChange={(e) => setNewDeptDesc(e.target.value)}
                      rows={2}
                      className="w-full text-xs font-semibold bg-white border border-slate-200 rounded-xl p-3 outline-none focus:border-indigo-600 mt-1"
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleFetchSuggestions}
                      disabled={aiSuggesting || !newDeptName.trim()}
                      className="flex-1 py-2 px-3 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200/60 font-extrabold text-[11px] rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
                      {aiSuggesting ? 'Analyzing...' : '✨ Suggest AI Tasks'}
                    </button>
                  </div>

                  {aiSuggesting && (
                    <div className="p-4 bg-amber-50/40 rounded-xl border border-amber-100/60 flex flex-col items-center justify-center text-center space-y-2 mt-2">
                      <div className="w-5 h-5 border-2 border-amber-600 border-t-transparent rounded-full animate-spin"></div>
                      <p className="text-[10px] text-amber-800 font-bold tracking-tight">
                        Gemini is designing custom procedures for "{newDeptName}"...
                      </p>
                    </div>
                  )}

                  {aiError && (
                    <div className="p-3 bg-rose-50 rounded-xl border border-rose-100 text-[10px] text-rose-600 font-semibold mt-2">
                      ⚠️ {aiError}
                    </div>
                  )}

                  {suggestedObjective && (
                    <div className="bg-indigo-50/40 border border-indigo-100 p-4 rounded-xl text-xs space-y-3.5 mt-4">
                      <div className="flex items-center gap-1.5 font-bold text-indigo-950">
                        <Sparkles className="w-3.5 h-3.5 text-indigo-600 animate-pulse" />
                        <span>AI Operations Suggestions</span>
                      </div>
                      
                      <div className="space-y-1">
                        <div className="text-[10px] text-slate-400 font-mono font-bold">Suggested Description:</div>
                        <p className="text-slate-700 italic font-medium leading-relaxed">"{suggestedObjective}"</p>
                        <button
                          type="button"
                          onClick={() => setNewDeptDesc(suggestedObjective)}
                          className="text-[10px] font-bold text-indigo-700 bg-white hover:bg-indigo-50 px-2 py-1 rounded border border-indigo-200 transition-all cursor-pointer mt-1"
                        >
                          ✓ Auto-Fill Description
                        </button>
                      </div>

                      {suggestedCategories.length > 0 && (
                        <div className="space-y-1 pt-2 border-t border-indigo-100/50">
                          <div className="text-[10px] text-slate-400 font-mono font-bold mb-1">
                            Proposed Categories <span className="text-slate-300">(added to this workspace on create)</span>:
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {suggestedCategories.map((c) => (
                              <span key={c} className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full border ${
                                taskCategories.some(tc => tc.toLowerCase() === c.toLowerCase())
                                  ? 'bg-slate-100 text-slate-400 border-slate-200'
                                  : 'bg-indigo-100 text-indigo-700 border-indigo-200'
                              }`}>
                                {c}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {suggestedTasks && suggestedTasks.length > 0 && (
                        <div className="space-y-2 pt-2 border-t border-indigo-100/50">
                          <div className="text-[10px] text-slate-400 font-mono font-bold mb-1.5">
                            Suggested Core Roster Tasks:
                          </div>
                          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                            {suggestedTasks.map((t, idx) => (
                              <div 
                                key={idx} 
                                className={`p-2.5 rounded-lg border text-[11px] transition-all cursor-pointer flex items-start gap-2 ${
                                  t.checked 
                                    ? 'bg-white border-indigo-300 shadow-xs' 
                                    : 'bg-slate-50/50 border-slate-100 opacity-60'
                                }`}
                                onClick={() => {
                                  setSuggestedTasks(
                                    suggestedTasks.map((st, sIdx) => sIdx === idx ? { ...st, checked: !st.checked } : st)
                                  );
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={t.checked}
                                  onChange={() => {}} // click handles it
                                  className="mt-0.5 accent-indigo-600"
                                />
                                <div className="flex-1 space-y-1">
                                  <div className="flex items-center justify-between gap-1 flex-wrap">
                                    <span className="font-extrabold text-slate-800 leading-tight">{t.name}</span>
                                    <div className="flex gap-1 shrink-0">
                                      {t.category && (
                                        <span className="bg-indigo-50 text-indigo-600 font-extrabold text-[8px] px-1 py-0.5 rounded uppercase font-mono">
                                          {t.category}
                                        </span>
                                      )}
                                      <span className="bg-slate-100 text-slate-500 font-extrabold text-[8px] px-1 py-0.5 rounded uppercase font-mono">
                                        {patternLabel(t.pattern)}
                                      </span>
                                      <span className={`font-mono text-[8px] px-1 py-0.5 rounded font-extrabold uppercase ${
                                        t.priority === 'Critical' ? 'bg-red-50 text-red-600' :
                                        t.priority === 'High' ? 'bg-amber-50 text-amber-600' :
                                        t.priority === 'Standard' ? 'bg-slate-100 text-slate-600' :
                                        'bg-slate-100 text-slate-400'
                                      }`}>
                                        {t.priority}
                                      </span>
                                    </div>
                                  </div>
                                  <p className="text-[10px] text-slate-500 font-medium leading-relaxed">{t.notes}</p>
                                  <div className="text-[9px] text-slate-400 font-semibold font-mono">
                                    Freq: {t.frequency} | Assignee: {t.assignedValue}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                          <p className="text-[9px] text-slate-400 italic font-medium">
                            Constructed tasks will automatically register under category "{newDeptName}" once department is created.
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  <button
                    type="submit"
                    className="w-full py-2.5 bg-indigo-950 hover:bg-slate-900 text-white font-extrabold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer mt-1"
                  >
                    <Plus className="w-4 h-4" /> Save {taxonomy.groupSingular}
                    {suggestedTasks.filter(t => t.checked).length > 0 && ` & Register ${suggestedTasks.filter(t => t.checked).length} Tasks`}
                  </button>
                </form>
              </div>

              <div className="lg:col-span-2 space-y-4 text-left">
                <div className="flex justify-between items-center bg-indigo-50/50 px-4 py-2.5 rounded-xl border border-indigo-100">
                  <span className="text-xs text-indigo-950 font-bold">Workspace context: {activeFacility.name}</span>
                  <span className="text-[10px] text-slate-500">{facilityDepts.length} Registered {taxonomy.groupPlural}</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {facilityDepts.length === 0 ? (
                    <div className="col-span-2 text-center p-8 bg-slate-50 rounded-2xl border border-slate-100 border-dashed text-slate-400 font-semibold text-xs">
                      <Layers className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                      <p>No custom {taxonomy.groupPlural.toLowerCase()} declared yet.</p>
                      <p className="text-[10px] mt-1 font-medium text-slate-400">Add dynamic sub-teams to establish sandboxed rosters & tasks.</p>
                    </div>
                  ) : (
                    facilityDepts.map((dept) => {
                      const deptStaffCount = staffList.filter(s => s.departmentId === dept.id).length;
                      const isDeptCurrent = currentDeptId === dept.id;
                      return (
                        <div 
                          key={dept.id} 
                          className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${
                            isDeptCurrent 
                              ? 'bg-indigo-50/20 border-indigo-200 ring-1 ring-indigo-200/50 shadow-xs' 
                              : 'bg-white border-slate-100 hover:border-slate-200'
                          }`}
                        >
                          <div>
                            <div className="flex justify-between items-start">
                              <span className="text-xs font-black text-slate-800">{dept.name}</span>
                              <button
                                type="button"
                                onClick={() => deleteDepartment(dept.id)}
                                className="p-1 hover:text-rose-600 text-slate-400 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <p className="text-[10.5px] text-slate-500 mt-1.5 leading-relaxed font-semibold">{dept.description}</p>
                          </div>

                          <div className="border-t border-slate-50 mt-4 pt-3 flex justify-between items-center text-[10px]">
                            <span className="font-mono text-slate-500">{deptStaffCount} allocated colleagues</span>
                            <button
                              type="button"
                              onClick={() => {
                                setCurrentDeptId(isDeptCurrent ? '' : dept.id);
                              }}
                              className={`px-2.5 py-1 rounded-md font-bold transition-all uppercase flex items-center gap-1 cursor-pointer ${
                                isDeptCurrent 
                                  ? 'bg-emerald-105 bg-emerald-100 text-emerald-800' 
                                  : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-850'
                              }`}
                            >
                              {isDeptCurrent ? <Check className="w-3 h-3" strokeWidth={3} /> : null}
                              {isDeptCurrent ? 'Active' : 'Switch to this'}
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: Custom Shift Builder */}
      {activeSubTab === 'shifts' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 bg-slate-50/70 p-5 rounded-2xl border border-slate-100">
            <h3 className="text-xs font-black text-slate-850 mb-2">Design Shift Block</h3>
            <p className="text-[11px] text-slate-500 mb-4 font-semibold">
              Establish clock ranges, identifiers, and customized visual presets for the roster map.
            </p>

            <form onSubmit={handleCreateShift} className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-1">
                  <label className="text-[9px] font-black text-slate-400 font-mono">CODE *</label>
                  <input
                    type="text"
                    required
                    maxLength={3}
                    placeholder="E.g. S1"
                    value={newShiftCode}
                    onChange={(e) => setNewShiftCode(e.target.value)}
                    className="w-full text-xs font-black bg-white border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-650 text-center uppercase"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-[9px] font-black text-slate-400 font-mono">Shift Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Early Morning Duty"
                    value={newShiftName}
                    onChange={(e) => setNewShiftName(e.target.value)}
                    className="w-full text-xs font-semibold bg-white border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-650"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[9px] font-black text-slate-400 font-mono">Time hours range</label>
                  <input
                    type="text"
                    placeholder="07:00 – 16:00"
                    value={newShiftTime}
                    onChange={(e) => setNewShiftTime(e.target.value)}
                    className="w-full text-xs font-semibold bg-white border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-650"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-400 font-mono">Paid hours count</label>
                  <input
                    type="number"
                    min={0}
                    max={24}
                    value={newShiftHours}
                    onChange={(e) => setNewShiftHours(Number(e.target.value))}
                    className="w-full text-xs font-bold bg-white border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-650 text-center"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[9px] font-black text-slate-400 font-mono">Theme BG</label>
                  <div className="flex gap-2 items-center mt-1">
                    <input
                      type="color"
                      value={newShiftBg}
                      onChange={(e) => setNewShiftBg(e.target.value)}
                      className="w-8 h-8 rounded border border-slate-200 cursor-pointer"
                    />
                    <span className="text-[10px] font-mono select-all text-slate-600">{newShiftBg}</span>
                  </div>
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-400 font-mono">Theme Text</label>
                  <div className="flex gap-2 items-center mt-1">
                    <input
                      type="color"
                      value={newShiftFg}
                      onChange={(e) => setNewShiftFg(e.target.value)}
                      className="w-8 h-8 rounded border border-slate-200 cursor-pointer"
                    />
                    <span className="text-[10px] font-mono select-all text-slate-600">{newShiftFg}</span>
                  </div>
                </div>
              </div>

              {/* Preview Chip */}
              <div className="bg-white p-3 rounded-xl border border-slate-100 flex items-center justify-between text-xs font-mono">
                <span className="text-slate-400 text-[10px] uppercase font-bold">Preview Label:</span>
                <span 
                  className="px-2.5 py-1 rounded font-black text-[10px]"
                  style={{ backgroundColor: newShiftBg, color: newShiftFg }}
                >
                  {newShiftCode || 'CHIP'}
                </span>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-indigo-950 hover:bg-slate-900 text-white font-extrabold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Save Shift Template
              </button>
            </form>
          </div>

          <div className="lg:col-span-2 space-y-4">
            <h3 className="text-xs font-black text-slate-600">Active Shift Patterns</h3>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(shifts).map(([code, sDef]) => {
                const isSystem = protectedShiftCodes.has(code);
                return (
                  <div 
                    key={code} 
                    className="p-3.5 rounded-2xl border border-slate-100 bg-slate-50/40 hover:bg-slate-50 transition-colors flex flex-col justify-between h-32"
                  >
                    <div className="flex justify-between items-start">
                      <span 
                        className="px-1.5 py-0.5 rounded font-black text-[9.5px]"
                        style={{ backgroundColor: sDef.bg, color: sDef.fg }}
                      >
                        {code}
                      </span>
                      {!isSystem && (
                        <button
                          onClick={() => deleteShift(code)}
                          className="text-slate-400 hover:text-rose-600 p-0.5 rounded-md hover:bg-white"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="mt-2 text-left">
                      <h4 className="text-[11px] font-extrabold text-slate-800 tracking-tight truncate">{sDef.name}</h4>
                      <p className="text-[9px] text-slate-500 font-mono mt-0.5">{sDef.time}</p>
                    </div>

                    <div className="border-t border-slate-100/70 mt-2.5 pt-2 flex justify-between items-center text-[9px] text-slate-400">
                      <span>{sDef.hours} Net Hrs</span>
                      {isSystem ? (
                        <span className="text-[8px] bg-slate-100 text-slate-400 px-1 py-0.5 rounded font-mono">Standard</span>
                      ) : (
                        <span className="text-[8px] bg-emerald-50 text-emerald-600 px-1 py-0.5 rounded font-mono font-bold">Custom</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB: Roster Rules */}
      {activeSubTab === 'rules' && (
        <div className="space-y-6 animate-[fadeIn_0.15s_ease-out] text-left">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                <Layers className="w-5 h-5 text-indigo-650" /> Roster Generation Rules
              </h3>
              <p className="text-xs text-slate-500">Define how the auto-scheduler builds rosters. Every rule is org-specific and applies the next time you generate a roster.</p>
            </div>
            <button
              onClick={async () => { if (await confirm({ title: 'Reset roster rules?', message: 'All rules return to the standard preset.', confirmLabel: 'Reset' })) setRuleSet(buildDefaultRuleSet()); }}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] rounded-xl flex items-center gap-1.5 self-start"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset to standard
            </button>
          </div>

          {/* Manager track + rest constraints */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-slate-50/70 p-5 rounded-2xl border border-slate-100">
              <h4 className="text-xs font-black text-slate-700 uppercase tracking-wide mb-3">Manager standard track</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9.5px] font-black text-slate-400">Weekday shift</label>
                  <select value={ruleSet.managerTrack?.weekdayShift || ''} onChange={e => setRuleSet({ ...ruleSet, managerTrack: { weekdayShift: e.target.value, weekendShift: ruleSet.managerTrack?.weekendShift || 'OFF' } })} className="w-full text-xs font-bold bg-white border border-slate-200 rounded-xl p-2.5 mt-1">
                    {Object.keys(shifts).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[9.5px] font-black text-slate-400">Weekend / holiday</label>
                  <select value={ruleSet.managerTrack?.weekendShift || ''} onChange={e => setRuleSet({ ...ruleSet, managerTrack: { weekdayShift: ruleSet.managerTrack?.weekdayShift || 'A', weekendShift: e.target.value } })} className="w-full text-xs font-bold bg-white border border-slate-200 rounded-xl p-2.5 mt-1">
                    {Object.keys(shifts).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div className="bg-slate-50/70 p-5 rounded-2xl border border-slate-100">
              <h4 className="text-xs font-black text-slate-700 uppercase tracking-wide mb-3">Rest constraints</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9.5px] font-black text-slate-400">Max consecutive work days</label>
                  <input type="number" min={0} max={14} value={ruleSet.restConstraints.maxConsecutiveWorkDays} onChange={e => setRuleSet({ ...ruleSet, restConstraints: { ...ruleSet.restConstraints, maxConsecutiveWorkDays: Number(e.target.value) } })} className="w-full text-xs font-bold bg-white border border-slate-200 rounded-xl p-2.5 mt-1" />
                </div>
                <div></div>
                <div className="col-span-2">
                  <label className="text-[9.5px] font-black text-slate-400">Late shifts (no early shift next day)</label>
                  <input value={ruleSet.restConstraints.lateShifts.join(', ')} onChange={e => setRuleSet({ ...ruleSet, restConstraints: { ...ruleSet.restConstraints, lateShifts: e.target.value.split(',').map(s => s.trim()).filter(Boolean) } })} className="w-full text-xs font-mono font-semibold bg-white border border-slate-200 rounded-xl p-2.5 mt-1" placeholder="D, SC, N, E" />
                </div>
                <div className="col-span-2">
                  <label className="text-[9.5px] font-black text-slate-400">Early shifts (blocked after a late shift)</label>
                  <input value={ruleSet.restConstraints.earlyShifts.join(', ')} onChange={e => setRuleSet({ ...ruleSet, restConstraints: { ...ruleSet.restConstraints, earlyShifts: e.target.value.split(',').map(s => s.trim()).filter(Boolean) } })} className="w-full text-xs font-mono font-semibold bg-white border border-slate-200 rounded-xl p-2.5 mt-1" placeholder="A, A+, B" />
                </div>
                <div className="col-span-2">
                  <label className="text-[9.5px] font-black text-slate-400">Non-working codes</label>
                  <input value={ruleSet.restConstraints.nonWorkingCodes.join(', ')} onChange={e => setRuleSet({ ...ruleSet, restConstraints: { ...ruleSet.restConstraints, nonWorkingCodes: e.target.value.split(',').map(s => s.trim()).filter(Boolean) } })} className="w-full text-xs font-mono font-semibold bg-white border border-slate-200 rounded-xl p-2.5 mt-1" placeholder="OFF, AL, SL, CO, MD" />
                </div>
                <div className="col-span-2">
                  <label className="text-[9.5px] font-black text-slate-400">Paid leave codes</label>
                  <input value={ruleSet.restConstraints.leaveCodes.join(', ')} onChange={e => setRuleSet({ ...ruleSet, restConstraints: { ...ruleSet.restConstraints, leaveCodes: e.target.value.split(',').map(s => s.trim()).filter(Boolean) } })} className="w-full text-xs font-mono font-semibold bg-white border border-slate-200 rounded-xl p-2.5 mt-1" placeholder="AL, SL, CO" />
                </div>
              </div>
            </div>
          </div>

          {/* Personal day off */}
          <div className="bg-slate-50/70 p-5 rounded-2xl border border-slate-100">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-black text-slate-700 uppercase tracking-wide">Optional personal day off</h4>
              <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600">
                Enabled
                <input type="checkbox" checked={!!ruleSet.personalDayOff?.enabled} onChange={e => setRuleSet({ ...ruleSet, personalDayOff: { enabled: e.target.checked, eligibility: ruleSet.personalDayOff?.eligibility || { field: 'all' }, window: ruleSet.personalDayOff?.window || { startDay: 7, endDay: 7, allowedDows: [2, 3, 4] }, shiftCode: ruleSet.personalDayOff?.shiftCode || 'MD' } })} className="w-5 h-5 accent-indigo-600" />
              </label>
            </div>
            {ruleSet.personalDayOff?.enabled && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[9.5px] font-black text-slate-400">Eligibility</label>
                  <select value={ruleSet.personalDayOff.eligibility.field} onChange={e => setRuleSet({ ...ruleSet, personalDayOff: { ...ruleSet.personalDayOff!, eligibility: { field: e.target.value as any, value: e.target.value === 'all' ? undefined : (ruleSet.personalDayOff!.eligibility.value || '') } } })} className="w-full text-xs font-bold bg-white border border-slate-200 rounded-xl p-2.5 mt-1">
                    <option value="all">Everyone</option>
                    <option value="gender">By gender</option>
                    <option value="role">By role</option>
                  </select>
                </div>
                {ruleSet.personalDayOff.eligibility.field !== 'all' && (
                  <div>
                    <label className="text-[9.5px] font-black text-slate-400">Match value</label>
                    <input value={ruleSet.personalDayOff.eligibility.value || ''} onChange={e => setRuleSet({ ...ruleSet, personalDayOff: { ...ruleSet.personalDayOff!, eligibility: { ...ruleSet.personalDayOff!.eligibility, value: e.target.value } } })} className="w-full text-xs font-semibold bg-white border border-slate-200 rounded-xl p-2.5 mt-1" placeholder={ruleSet.personalDayOff.eligibility.field === 'gender' ? 'F or M' : 'role name'} />
                  </div>
                )}
                <div>
                  <label className="text-[9.5px] font-black text-slate-400">Day-off shift code</label>
                  <select value={ruleSet.personalDayOff.shiftCode} onChange={e => setRuleSet({ ...ruleSet, personalDayOff: { ...ruleSet.personalDayOff!, shiftCode: e.target.value } })} className="w-full text-xs font-bold bg-white border border-slate-200 rounded-xl p-2.5 mt-1">
                    {Object.keys(shifts).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Rotation tracks */}
          <div className="bg-slate-50/70 p-5 rounded-2xl border border-slate-100">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-black text-slate-700 uppercase tracking-wide">Rotation tracks</h4>
              <button onClick={() => setRuleSet({ ...ruleSet, rotationTracks: [...ruleSet.rotationTracks, { id: `track-${Date.now()}`, label: 'New track', weekdayShift: Object.keys(shifts)[0] || 'A', weekendShift: 'OFF' }] })} className="text-[11px] font-bold text-indigo-600 flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Add track</button>
            </div>
            <div className="space-y-2">
              {ruleSet.rotationTracks.map((t, i) => (
                <div key={t.id} className="grid grid-cols-12 gap-2 items-center bg-white border border-slate-100 rounded-xl p-2">
                  <input value={t.label} onChange={e => setRuleSet({ ...ruleSet, rotationTracks: ruleSet.rotationTracks.map((x, xi) => xi === i ? { ...x, label: e.target.value } : x) })} className="col-span-5 text-xs font-bold bg-slate-50 border border-slate-200 rounded-lg p-2" placeholder="Track name" />
                  <select value={t.weekdayShift} onChange={e => setRuleSet({ ...ruleSet, rotationTracks: ruleSet.rotationTracks.map((x, xi) => xi === i ? { ...x, weekdayShift: e.target.value } : x) })} className="col-span-3 text-xs font-bold bg-slate-50 border border-slate-200 rounded-lg p-2">
                    {Object.keys(shifts).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select value={t.weekendShift} onChange={e => setRuleSet({ ...ruleSet, rotationTracks: ruleSet.rotationTracks.map((x, xi) => xi === i ? { ...x, weekendShift: e.target.value } : x) })} className="col-span-3 text-xs font-bold bg-slate-50 border border-slate-200 rounded-lg p-2">
                    {Object.keys(shifts).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <button onClick={() => setRuleSet({ ...ruleSet, rotationTracks: ruleSet.rotationTracks.filter((_, xi) => xi !== i) })} className="col-span-1 text-slate-400 hover:text-rose-600 flex justify-center"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
              <p className="text-[9.5px] text-slate-400 font-mono">Columns: track name · weekday shift · weekend/holiday shift. Staff are distributed across tracks round-robin per week.</p>
            </div>
          </div>

          {/* Auto-assignments */}
          <div className="bg-slate-50/70 p-5 rounded-2xl border border-slate-100">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-black text-slate-700 uppercase tracking-wide">Auto-assignments</h4>
              <button onClick={() => setRuleSet({ ...ruleSet, autoAssignments: [...ruleSet.autoAssignments, { id: `auto-${Date.now()}`, shiftCode: Object.keys(shifts)[0] || 'A', trigger: 'last-day', count: 1 }] })} className="text-[11px] font-bold text-indigo-600 flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Add rule</button>
            </div>
            <div className="space-y-2">
              {ruleSet.autoAssignments.map((a, i) => (
                <div key={a.id} className="grid grid-cols-12 gap-2 items-center bg-white border border-slate-100 rounded-xl p-2">
                  <select value={a.shiftCode} onChange={e => setRuleSet({ ...ruleSet, autoAssignments: ruleSet.autoAssignments.map((x, xi) => xi === i ? { ...x, shiftCode: e.target.value } : x) })} className="col-span-4 text-xs font-bold bg-slate-50 border border-slate-200 rounded-lg p-2">
                    {Object.keys(shifts).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select value={a.trigger} onChange={e => setRuleSet({ ...ruleSet, autoAssignments: ruleSet.autoAssignments.map((x, xi) => xi === i ? { ...x, trigger: e.target.value as any } : x) })} className="col-span-5 text-xs font-bold bg-slate-50 border border-slate-200 rounded-lg p-2">
                    <option value="last-day">On last day of cycle</option>
                    <option value="weekly-dow">Weekly (by weekday)</option>
                  </select>
                  <input type="number" min={1} value={a.count ?? 1} onChange={e => setRuleSet({ ...ruleSet, autoAssignments: ruleSet.autoAssignments.map((x, xi) => xi === i ? { ...x, count: Number(e.target.value) } : x) })} className="col-span-2 text-xs font-bold bg-slate-50 border border-slate-200 rounded-lg p-2 text-center" />
                  <button onClick={() => setRuleSet({ ...ruleSet, autoAssignments: ruleSet.autoAssignments.filter((_, xi) => xi !== i) })} className="col-span-1 text-slate-400 hover:text-rose-600 flex justify-center"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
              <p className="text-[9.5px] text-slate-400 font-mono">Columns: shift code · trigger · number of people to assign.</p>
            </div>
          </div>

          {/* Workspace vocabulary lists */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-slate-50/70 p-5 rounded-2xl border border-slate-100">
              <h4 className="text-xs font-black text-slate-700 uppercase tracking-wide mb-2">{taxonomy.taskSingular} categories</h4>
              <input value={taskCategories.join(', ')} onChange={e => setTaskCategories(e.target.value.split(',').map(s => s.trim()).filter(Boolean))} className="w-full text-xs font-semibold bg-white border border-slate-200 rounded-xl p-2.5" placeholder="General, Compliance, Inventory" />
              <p className="text-[9.5px] text-slate-400 mt-1">Comma-separated. Used when creating {taxonomy.taskPlural.toLowerCase()}.</p>
            </div>
            <div className="bg-slate-50/70 p-5 rounded-2xl border border-slate-100">
              <h4 className="text-xs font-black text-slate-700 uppercase tracking-wide mb-2">{taxonomy.workspaceSingular} classifications</h4>
              <input value={facilityTypes.join(', ')} onChange={e => setFacilityTypes(e.target.value.split(',').map(s => s.trim()).filter(Boolean))} className="w-full text-xs font-semibold bg-white border border-slate-200 rounded-xl p-2.5" placeholder="Branch, Warehouse, Office" />
              <p className="text-[9.5px] text-slate-400 mt-1">Comma-separated. Used when classifying {taxonomy.workspacePlural.toLowerCase()}.</p>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB: Regional */}
      {activeSubTab === 'regional' && (
        <div className="space-y-6 animate-[fadeIn_0.15s_ease-out] text-left">
          <div>
            <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
              <Globe className="w-5 h-5 text-indigo-650" /> Regional Settings
            </h3>
            <p className="text-xs text-slate-500">Public holidays affect overtime, Sunday/holiday pay, and rest rules. Load a preset to start, then edit freely.</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-slate-50/70 p-5 rounded-2xl border border-slate-100">
              <label className="text-[9.5px] font-black text-slate-400">Holiday preset</label>
              <div className="flex gap-2 mt-1">
                <select value={regionPresetId || 'none'} onChange={e => setRegionPresetId(e.target.value === 'none' ? undefined : e.target.value)} className="flex-1 text-xs font-bold bg-white border border-slate-200 rounded-xl p-2.5">
                  {HOLIDAY_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
                <button
                  onClick={() => {
                    const preset = getHolidayPreset(regionPresetId || 'none');
                    if (preset) setHolidays(preset.build(new Date().getFullYear()));
                  }}
                  className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] rounded-xl whitespace-nowrap"
                >
                  Load preset
                </button>
              </div>
            </div>
            <div className="bg-slate-50/70 p-5 rounded-2xl border border-slate-100">
              <label className="text-[9.5px] font-black text-slate-400">Timezone label (display only)</label>
              <input value={timezoneLabel} onChange={e => setTimezoneLabel(e.target.value)} className="w-full text-xs font-semibold bg-white border border-slate-200 rounded-xl p-2.5 mt-1" placeholder="e.g. Zambia (CAT)" />
            </div>
          </div>

          <div className="bg-slate-50/70 p-5 rounded-2xl border border-slate-100">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-black text-slate-700 uppercase tracking-wide flex items-center gap-1.5"><Calendar className="w-4 h-4 text-indigo-600" /> Public holidays ({holidays.length})</h4>
              <button onClick={() => setHolidays([...holidays, { date: '', name: '' }])} className="text-[11px] font-bold text-indigo-600 flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Add holiday</button>
            </div>
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {holidays.length === 0 ? (
                <p className="text-center text-xs text-slate-400 py-6">No holidays defined. Load a preset above or add your own.</p>
              ) : holidays.map((h, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center bg-white border border-slate-100 rounded-xl p-2">
                  <input type="date" value={h.date} onChange={e => setHolidays(holidays.map((x, xi) => xi === i ? { ...x, date: e.target.value } : x))} className="col-span-4 text-xs font-mono font-semibold bg-slate-50 border border-slate-200 rounded-lg p-2" />
                  <input value={h.name} onChange={e => setHolidays(holidays.map((x, xi) => xi === i ? { ...x, name: e.target.value } : x))} className="col-span-7 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg p-2" placeholder="Holiday name" />
                  <button onClick={() => setHolidays(holidays.filter((_, xi) => xi !== i))} className="col-span-1 text-slate-400 hover:text-rose-600 flex justify-center"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 3: Staff Directory */}
      {activeSubTab === 'staff' && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1 bg-slate-50/70 p-5 rounded-2xl border border-slate-100 h-fit">
            <h3 className="text-xs font-black text-slate-800 mb-2">Register Live {taxonomy.memberSingular}</h3>
            <p className="text-[11px] text-slate-500 mb-4 font-semibold">
              Add new credentials to specific workspaces and dynamic sub-team isolation groups.
            </p>

            <form onSubmit={handleCreateStaff} className="space-y-3 text-left">
              <div>
                <label className="text-[9.5px] font-black text-slate-400 font-mono">First Name Mnemonic *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Kasoka"
                  value={newStaffName}
                  onChange={(e) => setNewStaffName(e.target.value)}
                  className="w-full text-xs font-semibold bg-white border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-650"
                />
              </div>

              <div>
                <label className="text-[9.5px] font-black text-slate-400 font-mono">Full Official Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Kasoka Mwansa"
                  value={newStaffFullName}
                  onChange={(e) => setNewStaffFullName(e.target.value)}
                  className="w-full text-xs font-semibold bg-white border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-650"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[9.2px] font-black text-slate-400 font-mono">colleague ID *</label>
                  <input
                    type="text"
                    required
                    placeholder="EMP-40"
                    value={newStaffEmpNo}
                    onChange={(e) => setNewStaffEmpNo(e.target.value)}
                    className="w-full text-xs font-mono font-black bg-white border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-650"
                  />
                </div>
                <div>
                  <label className="text-[9.2px] font-black text-slate-400 font-mono">Contract Hrs</label>
                  <input
                    type="number"
                    placeholder="168"
                    value={newStaffHoursVal}
                    onChange={(e) => setNewStaffHoursVal(Number(e.target.value))}
                    className="w-full text-xs font-bold bg-white border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-650 text-center"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[9.2px] font-black text-slate-400 font-mono">Gender</label>
                  <select
                    value={newStaffGender}
                    onChange={(e) => setNewStaffGender(e.target.value as any)}
                    className="w-full text-xs font-bold bg-white border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-650"
                  >
                    <option value="M">Male (M)</option>
                    <option value="F">Female (F)</option>
                    <option value="">N/A</option>
                  </select>
                </div>
                <div>
                  <label className="text-[9.2px] font-black text-slate-400 font-mono">{taxonomy.groupSingular} Assign</label>
                  <select
                    value={newStaffDeptId}
                    onChange={(e) => setNewStaffDeptId(e.target.value)}
                    className="w-full text-xs font-bold bg-white border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-650"
                  >
                    <option value="">All {taxonomy.groupPlural.toLowerCase()}</option>
                    {facilityDepts.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[9.5px] font-black text-slate-400 font-mono">Corporate Email</label>
                <input
                  type="email"
                  placeholder="name@tenant.com"
                  value={newStaffEmail}
                  onChange={(e) => setNewStaffEmail(e.target.value)}
                  className="w-full text-xs font-semibold bg-white border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-650"
                />
              </div>

              <div>
                <label className="text-[9.5px] font-black text-slate-400 font-mono">Phone Contact</label>
                <input
                  type="text"
                  placeholder="+260 971 000 000"
                  value={newStaffPhone}
                  onChange={(e) => setNewStaffPhone(e.target.value)}
                  className="w-full text-xs font-semibold bg-white border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-650"
                />
              </div>

              <div>
                <label className="text-[9.5px] font-black text-slate-400 font-mono">Skills / Competencies</label>
                <input
                  type="text"
                  placeholder="comma-separated, e.g. First Aid, Forklift License"
                  value={newStaffSkills}
                  onChange={(e) => setNewStaffSkills(e.target.value)}
                  className="w-full text-xs font-semibold bg-white border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-650"
                />
                <p className="text-[9px] text-slate-400 mt-1">Used by smart auto-assign & skill-gated tasks.</p>
              </div>

              <div>
                <label className="text-[9.5px] font-black text-slate-400 font-mono">Access Level</label>
                <select
                  value={newStaffAccessLevel}
                  onChange={(e) => setNewStaffAccessLevel(e.target.value)}
                  className="w-full text-xs font-semibold bg-white border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-650"
                >
                  {assignableRoles.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                <p className="text-[9px] text-slate-400 mt-1">Governs what this person sees and does. Resolved from their login email.</p>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-indigo-950 hover:bg-slate-900 text-white font-extrabold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Add Team {taxonomy.memberSingular}
              </button>
            </form>
          </div>

          <div className="lg:col-span-3 space-y-4 text-left">
            <div className="flex justify-between items-center bg-white flex-wrap gap-2">
              <h3 className="text-xs font-black text-slate-600">Operational {taxonomy.memberPlural} directory</h3>
              <div className="flex items-center gap-2">
                {openOnboarding && (
                  <button
                    type="button"
                    onClick={openOnboarding}
                    className="px-3 py-1.5 bg-indigo-50 hover:bg-slate-50 text-[#7A1230] font-black text-[10.5px] rounded-lg tracking-wider uppercase flex items-center gap-1.5 transition-colors border border-indigo-200/40 cursor-pointer"
                    title="Launch the beautiful, guided wizard to onboard clinical personnel step-by-step"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-[#E29E25]" /> Onboard Staff Wizard
                  </button>
                )}
                {staffList.length > 0 && (
                  <button
                    type="button"
                    onClick={wipeAllStaff}
                    className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 font-extrabold text-[10px] rounded-lg tracking-wider uppercase flex items-center gap-1.5 transition-colors border border-rose-200/50 cursor-pointer"
                    title="Remove all staff members and empty databases"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Wipe All Staff
                  </button>
                )}
              </div>
            </div>
            
            <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 flex items-center gap-2.5">
              <Info className="text-indigo-900 w-4.5 h-4.5 shrink-0" />
              <p className="text-[10px] text-slate-500 leading-relaxed font-semibold">
                Under isolated sandboxed routing, team {taxonomy.memberPlural.toLowerCase()} can ONLY view tasks, logs, checklists and roster mappings corresponding to their assigned {taxonomy.groupSingular.toLowerCase()} silo. Global operators/managers bypass isolation parameters.
              </p>
            </div>

            <div className="overflow-x-auto border border-slate-100 rounded-2xl shadow-xs">
              <table className="w-full text-left text-xs bg-white">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-150 text-[10px] uppercase font-bold text-slate-400">
                    <th className="py-3 px-4">{taxonomy.memberSingular}</th>
                    <th className="py-3 px-3">Role / Title</th>
                    <th className="py-3 px-3">Employee No.</th>
                    <th className="py-3 px-3">{taxonomy.groupSingular}</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {staffList.map((s) => {
                    const deptName = departments.find(d => d.id === s.departmentId)?.name || 'Ecosystem Global';
                    return (
                      <tr key={s.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-extrabold text-slate-800">{s.fullName}</div>
                          <div className="text-[9.5px] text-slate-400 font-mono mt-0.5">{s.email}</div>
                        </td>
                        <td className="py-3 px-3 font-semibold text-slate-600 truncate max-w-[140px]">{s.role}</td>
                        <td className="py-3 px-3 font-mono font-bold text-slate-700">{s.employeeNo}</td>
                        <td className="py-3 px-3">
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                            s.departmentId ? 'bg-indigo-50 border border-indigo-100/50 text-indigo-900' : 'bg-slate-100 text-slate-500'
                          }`}>
                            {deptName}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          {s.isManager ? (
                            <span className="text-[8px] px-2 py-0.5 bg-indigo-950 font-black text-white rounded uppercase">Admin/Mgr</span>
                          ) : (
                            <span className="text-[8px] px-2 py-0.5 bg-slate-100 font-extrabold text-slate-500 rounded uppercase">Staff</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => handleStartEdit(s)}
                              className="p-1 text-slate-400 hover:text-indigo-900 hover:bg-slate-100 rounded transition-colors"
                              title="Edit Member"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => deleteStaff(s.id)}
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded transition-colors"
                              title="Delete Member"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 4: Custom Tasks & Bespoke Workflows */}
      {activeSubTab === 'tasks' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 bg-slate-50/70 p-5 rounded-2xl border border-slate-100 text-left">
            <h3 className="text-xs font-black text-slate-805 mb-2">Bespoke {taxonomy.taskSingular} Rules</h3>
            <p className="text-[11px] text-slate-500 mb-4 font-semibold">
              Establish core procedural audits and verify rule bindings.
            </p>

            <form onSubmit={handleCreateTask} className="space-y-3">
              <div>
                <label className="text-[9.5px] font-black text-slate-400 font-mono">{taxonomy.taskSingular} Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Conduct High-Value Material Audit"
                  value={newTaskName}
                  onChange={(e) => setNewTaskName(e.target.value)}
                  className="w-full text-xs font-semibold bg-white border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-650"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[9.2px] font-black text-slate-400 font-mono">Category</label>
                  {addingTaskCat ? (
                    <div className="flex gap-1.5">
                      <input
                        autoFocus
                        value={newTaskCatInput}
                        onChange={(e) => setNewTaskCatInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitNewTaskCat(); } }}
                        placeholder="New category"
                        className="flex-1 text-xs font-bold bg-white border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-650"
                      />
                      <button type="button" onClick={commitNewTaskCat} className="text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-2.5 rounded-xl cursor-pointer">Add</button>
                      <button type="button" onClick={() => { setAddingTaskCat(false); setNewTaskCatInput(''); }} className="text-xs font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 px-2.5 rounded-xl cursor-pointer">✕</button>
                    </div>
                  ) : (
                    <select
                      value={newTaskCategory}
                      onChange={(e) => { if (e.target.value === '__add__') setAddingTaskCat(true); else setNewTaskCategory(e.target.value); }}
                      className="w-full text-xs font-bold bg-white border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-650"
                    >
                      {taskCategories.map(c => <option key={c} value={c}>{c}</option>)}
                      {newTaskCategory && !taskCategories.includes(newTaskCategory) && <option value={newTaskCategory}>{newTaskCategory}</option>}
                      <option value="__add__">➕ Add new category…</option>
                    </select>
                  )}
                </div>
                <div>
                  <label className="text-[9.2px] font-black text-slate-400 font-mono">Priority</label>
                  <select
                    value={newTaskPriority}
                    onChange={(e) => setNewTaskPriority(e.target.value as any)}
                    className="w-full text-xs font-bold bg-white border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-650"
                  >
                    <option value="Critical">🚨 Critical</option>
                    <option value="High">⚠️ High</option>
                    <option value="Standard">Standard</option>
                    <option value="Routine">Routine</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[9.5px] font-black text-indigo-950 block font-mono">Assignment Processing Workflow Pattern *</label>
                <select
                  value={newTaskPattern}
                  onChange={(e) => {
                    setNewTaskPattern(e.target.value as any);
                    if (e.target.value === 'Shift-based') setNewTaskAssignedVal('Shift A');
                    else if (e.target.value === 'Dispensing-rotate') setNewTaskAssignedVal('0');
                    else if (e.target.value === 'Person-specific') setNewTaskAssignedVal('Kasoka');
                    else setNewTaskAssignedVal('');
                  }}
                  className="w-full text-xs font-extrabold bg-indigo-50/50 border border-indigo-150 rounded-xl p-3 focus:ring-1 focus:ring-indigo-600 outline-none mt-1"
                >
                  <option value="Auto">Smart auto-assign (skills + availability + fairness)</option>
                  <option value="Shift-based">Shift-matched (Auto-assigns rostered member)</option>
                  <option value="Dispensing-rotate">Round-robin (rotates across available staff)</option>
                  <option value="Person-specific">Named Anchor specific</option>
                  <option value="Collab">Collaboration / Open Pool</option>
                </select>
                <p className="text-[9px] text-indigo-900 font-semibold leading-normal mt-1 bg-indigo-50/45 p-2 rounded-lg">
                  {newTaskPattern === 'Auto' && '💡 Picks one qualified person who is on shift today and has the lightest workload — the smartest default.'}
                  {newTaskPattern === 'Shift-based' && '💡 System evaluates live schedules, matching today\'s duty roster to this check.'}
                  {newTaskPattern === 'Dispensing-rotate' && '💡 Rotates day-by-day to the least-loaded staffer on shift, skipping anyone off or on leave.'}
                  {newTaskPattern === 'Person-specific' && '💡 Permanent assignment locked specifically to a designated team member.'}
                  {newTaskPattern === 'Collab' && '💡 Open pool. Any authorized operator can lock compliance.'}
                </p>
              </div>

              <div>
                <label className="text-[9.5px] font-black text-slate-400 font-mono">Frequency Bounds</label>
                <select
                  value={newTaskFreq}
                  onChange={(e) => setNewTaskFreq(e.target.value)}
                  className="w-full text-xs font-bold bg-white border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-650"
                >
                  <option value="Daily">Daily Handover Logs</option>
                  <option value="Weekly (Sunday)">Weekly Sunday Audit</option>
                  <option value="Monthly (Continuous)">Continuous Target Process Tracking</option>
                </select>
              </div>

              {newTaskFreq.includes('Continuous') && (
                <div>
                  <label className="text-[9.5px] font-black text-slate-400 font-mono">Continuous Target Units Target</label>
                  <input
                    type="number"
                    placeholder="10"
                    value={newTaskTarget || ''}
                    onChange={(e) => setNewTaskTarget(e.target.value ? Number(e.target.value) : undefined)}
                    className="w-full text-xs font-bold bg-white border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-650 text-center"
                  />
                </div>
              )}

              <div>
                <label className="text-[9.5px] font-black text-slate-400 font-mono">Specific SOP Instruction Notes</label>
                <textarea
                  placeholder="e.g. Ensure physical logs align strictly with digital counts before verifying compliance..."
                  value={newTaskNotes}
                  onChange={(e) => setNewTaskNotes(e.target.value)}
                  rows={2}
                  className="w-full text-xs font-semibold bg-white border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-655"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-indigo-950 hover:bg-slate-900 text-white font-extrabold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Save Bespoke task
              </button>
            </form>
          </div>

          <div className="lg:col-span-2 space-y-4 text-left">
            <h3 className="text-xs font-black text-slate-600">Dynamic Task Rules Library</h3>

            <div className="flex bg-indigo-50 p-3.5 rounded-xl border border-indigo-150 gap-2.5 items-start">
              <Info className="text-indigo-950 w-4.5 h-4.5 shrink-0 mt-0.5 animate-pulse" />
              <p className="text-[10px] text-slate-650 leading-normal font-semibold">
                Allocation algorithms automatically map assignments according to shift occurrences. To edit existing pre-assigned lists, navigate directly to the <strong className="underline">Task Sheet Register</strong> board.
              </p>
            </div>

            <div className="max-h-[600px] overflow-y-auto space-y-3.5 pr-1">
              {taskMasterList.map((task) => (
                <div key={task.id} className="p-4 rounded-2xl border border-slate-100 bg-white hover:shadow-xs transition-shadow flex justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-extrabold text-slate-800 text-xs">{task.name}</span>
                      <span className="text-[8.5px] bg-slate-100 font-bold text-slate-500 px-1.5 py-0.5 rounded uppercase">
                        {task.category}
                      </span>
                    </div>

                    <p className="text-[10.5px] text-slate-500 leading-relaxed font-sans">{task.notes}</p>
                    
                    <div className="flex items-center gap-4 mt-2.5 text-[9.5px] font-mono font-bold text-slate-400">
                      <span>Frequency: <strong className="text-slate-605">{task.frequency}</strong></span>
                      <span>·</span>
                      <span>Workflow: <strong className="text-indigo-950 uppercase">{patternLabel(task.pattern)}</strong></span>
                      {task.trackerTarget && <span>· Target: <strong className="text-emerald-600">{task.trackerTarget} units</strong></span>}
                    </div>
                  </div>

                  <button
                    onClick={async () => {
                      if (await confirm({ title: `Remove this ${taxonomy.taskSingular.toLowerCase()}?`, message: 'It will be removed from the register.', danger: true, confirmLabel: 'Remove' })) {
                        setTaskMasterList(taskMasterList.filter(t => t.id !== task.id));
                      }
                    }}
                    className="self-center p-2 text-slate-350 hover:text-rose-600 rounded-lg hover:bg-slate-50 shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 5: Multi-Tenant Sandbox Isolator */}
      {activeSubTab === 'sandbox' && (
        <div className="space-y-6 text-left">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50/50 p-6 rounded-3xl border border-slate-100">
            <div>
              <h3 className="text-sm font-black text-slate-800 uppercase flex items-center gap-1.5">
                <ShieldCheck className="text-emerald-500 w-5 h-5" /> How department separation works
              </h3>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed font-semibold">
                Each person belongs to a {taxonomy.groupSingular.toLowerCase()} within a {taxonomy.workspaceSingular.toLowerCase()}. When separation is on, they only see their own {taxonomy.groupSingular.toLowerCase()}'s schedules, tasks, and check-offs — not other {taxonomy.groupPlural.toLowerCase()}.
              </p>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                Turn it on to preview exactly what each person sees. The table below shows everyone's current view.
              </p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-150 flex flex-col justify-between">
              <div>
                <span className="text-[9.5px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-mono font-bold uppercase">
                  Workspace summary
                </span>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-[9.5px] uppercase font-mono text-slate-400 font-bold block">{taxonomy.workspacePlural}</span>
                    <strong className="text-base text-slate-800 mt-0.5 block">{facilities.length} Live Sites</strong>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-[9.5px] uppercase font-mono text-slate-400 font-bold block">{taxonomy.groupPlural}</span>
                    <strong className="text-base text-slate-800 mt-0.5 block">{departments.length} Registered</strong>
                  </div>
                </div>
                <div className="mt-4 p-3 bg-rose-50 rounded-xl border border-rose-100/60">
                  <div className="flex justify-between items-center text-xs">
                    <div className="text-left">
                      <span className="text-[9.5px] uppercase font-mono text-rose-500 font-extrabold block">Admin Utilities</span>
                      <p className="text-[10px] text-rose-600 mt-0.5">Wipe all cached personnel, custom shifts, and tasks from database.</p>
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      if (await confirm({ title: 'Wipe all local data?', message: 'All cached rosters, staff, and tasks will be cleared. This cannot be undone.', danger: true, confirmLabel: 'Wipe everything' })) {
                        if (onFullReset) {
                          await onFullReset();
                        } else {
                          localStorage.clear();
                          localStorage.setItem(`seeded_initially_${selectedFacilityId}`, 'true');
                          setStaffList([]);
                          setTaskMasterList([]);
                          setDepartments([]);
                          toast.success('Storage cleared. Reloading for a clean start…');
                          window.location.reload();
                        }
                      }
                    }}
                    className="mt-3.5 w-full bg-red-650 hover:bg-red-700 text-white font-black text-xs py-2 rounded-xl cursor-pointer text-center block transition-all shadow-md"
                  >
                    Wipe Persistent Storage & Reset
                  </button>
                </div>
              </div>

              <div className="flex justify-between items-center bg-indigo-50 p-2.5 rounded-xl border border-indigo-100 mt-4 text-[10.5px]">
                <span className="font-semibold text-indigo-900">Viewing {taxonomy.groupSingular.toLowerCase()}:</span>
                <select
                  value={currentDeptId}
                  onChange={(e) => setCurrentDeptId(e.target.value)}
                  className="bg-transparent font-extrabold text-indigo-950 focus:outline-none border-none py-0 cursor-pointer text-center"
                >
                  <option value="">Global View (Everything)</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name} ({facilities.find(f => f.id === d.facilityId)?.name.split(' ')[0]})</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="text-xs font-black text-slate-800 uppercase flex items-center gap-1.5">
              <Eye className="w-4 h-4 text-slate-400" /> Who can see what
            </h4>

            <div className="overflow-x-auto border border-slate-100 rounded-2xl">
              <table className="w-full text-left text-xs bg-white">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-150 text-[10px] uppercase font-bold text-slate-400">
                    <th className="py-2.5 px-4">{taxonomy.memberSingular}</th>
                    <th className="py-2.5 px-3">Role</th>
                    <th className="py-2.5 px-3">{taxonomy.groupSingular}</th>
                    <th className="py-2.5 px-3">Can see</th>
                    <th className="py-2.5 px-3">Preview</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[11px]">
                  {staffList.map((s) => {
                    const mappedDept = departments.find(d => d.id === s.departmentId);
                    const behavesAsAdmin = s.isManager;
                    return (
                      <tr key={s.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-3 px-4 font-extrabold text-slate-800">{s.fullName}</td>
                        <td className="py-3 px-3">
                          {s.isManager ? (
                            <span className="text-[8px] bg-indigo-950 text-white px-1.5 py-0.5 rounded font-black uppercase">Super Admin</span>
                          ) : (
                            <span className="text-[8px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-extrabold uppercase">Tenant Staff</span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <span className={`text-[9.5px] font-bold px-2 py-0.5 rounded-full ${
                            mappedDept ? 'bg-indigo-50 border border-indigo-100/45 text-indigo-900' : 'bg-slate-100 text-slate-400'
                          }`}>
                            {mappedDept ? mappedDept.name : 'Not bound (Default Global)'}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-mono text-[10px]">
                          {behavesAsAdmin ? (
                            <span className="text-emerald-600 font-extrabold">✓ Authorized to view all silos</span>
                          ) : mappedDept ? (
                            <span className="text-rose-600 font-extrabold">🔒 STRICTLY isolated to "{mappedDept.name}" only</span>
                          ) : (
                            <span className="text-slate-500 font-bold">Unauthenticated user (Fallback global default)</span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <button
                            onClick={() => {
                              setSelectedFacilityId(s.facilityId || 'kansanshi');
                              if (s.departmentId) {
                                setCurrentDeptId(s.departmentId);
                                setIsSandboxStrictMode(true);
                              } else {
                                setCurrentDeptId('');
                                setIsSandboxStrictMode(false);
                              }
                              // Switch active user
                              const matches = document.querySelector('header select') as HTMLSelectElement;
                              if (matches) {
                                matches.value = s.id;
                                matches.dispatchEvent(new Event('change', { bubbles: true }));
                              }
                              toast.info(`Now viewing as ${s.name}. Roster and tasks are filtered to their view.`);
                            }}
                            className="bg-slate-150 hover:bg-indigo-900 hover:text-white px-2.5 py-1 rounded font-extrabold text-[9px] uppercase transition-all"
                          >
                            Impersonate & Lock
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 5: Taxonomy configuration */}
      {activeSubTab === 'taxonomy' && (
        <div className="bg-slate-50/50 p-6 rounded-3xl border border-slate-100 space-y-6 text-left">
          <div>
            <h3 className="text-sm font-black text-slate-800 mb-1 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-indigo-600" /> Customize Platform Terminology & Nomenclature
            </h3>
            <p className="text-xs text-slate-500 font-sans leading-relaxed">
              Tailor this workspace by renaming core roles, organizational divisions, task concepts, and display entities in real-time. Changes instantly adapt across the calendar roster, charts, and custom compliance checklists.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white p-6 rounded-2xl border border-slate-100 shadow-xs">
            <div>
              <label className="text-[10px] font-black text-slate-400 font-mono">
                Platform Brand Name
              </label>
              <input
                type="text"
                placeholder="e.g. RotaSync"
                value={taxonomy.appName || ''}
                onChange={(e) => setTaxonomy({ ...taxonomy, appName: e.target.value })}
                className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:border-indigo-600 focus:bg-white mt-1.5"
              />
              <p className="text-[10px] text-slate-400 mt-1 font-semibold">Sets the application brand displayed on headers and onboarding panels.</p>
            </div>

            <div>
              <label className="text-[10px] font-black text-slate-400 font-mono">
                Workspace (Singular / Plural)
              </label>
              <div className="grid grid-cols-2 gap-2 mt-1.5">
                <input
                  type="text"
                  placeholder="Singular (e.g. Workspace)"
                  value={taxonomy.workspaceSingular || ''}
                  onChange={(e) => setTaxonomy({ ...taxonomy, workspaceSingular: e.target.value })}
                  className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:border-indigo-600 focus:bg-white"
                />
                <input
                  type="text"
                  placeholder="Plural (e.g. Workspaces)"
                  value={taxonomy.workspacePlural || ''}
                  onChange={(e) => setTaxonomy({ ...taxonomy, workspacePlural: e.target.value })}
                  className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:border-indigo-600 focus:bg-white"
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-1 font-semibold">Term for primary multi-tenant physical sites or organization centers.</p>
            </div>

            <div>
              <label className="text-[10px] font-black text-slate-400 font-mono">
                Team Member (Singular / Plural)
              </label>
              <div className="grid grid-cols-2 gap-2 mt-1.5">
                <input
                  type="text"
                  placeholder="Singular (e.g. Staff Member)"
                  value={taxonomy.memberSingular || ''}
                  onChange={(e) => setTaxonomy({ ...taxonomy, memberSingular: e.target.value })}
                  className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:border-indigo-600 focus:bg-white"
                />
                <input
                  type="text"
                  placeholder="Plural (e.g. Staff Members)"
                  value={taxonomy.memberPlural || ''}
                  onChange={(e) => setTaxonomy({ ...taxonomy, memberPlural: e.target.value })}
                  className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:border-indigo-600 focus:bg-white"
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-1 font-semibold">Nomenclature for rostered colleagues, personnel, or members.</p>
            </div>

            <div>
              <label className="text-[10px] font-black text-slate-400 font-mono">
                Dynamic Sub-Team (Singular / Plural)
              </label>
              <div className="grid grid-cols-2 gap-2 mt-1.5">
                <input
                  type="text"
                  placeholder="Singular (e.g. Department)"
                  value={taxonomy.groupSingular || ''}
                  onChange={(e) => setTaxonomy({ ...taxonomy, groupSingular: e.target.value })}
                  className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:border-indigo-600 focus:bg-white"
                />
                <input
                  type="text"
                  placeholder="Plural (e.g. Departments)"
                  value={taxonomy.groupPlural || ''}
                  onChange={(e) => setTaxonomy({ ...taxonomy, groupPlural: e.target.value })}
                  className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:border-indigo-600 focus:bg-white"
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-1 font-semibold">Label for scheduling squads, departments, wings or isolation silos.</p>
            </div>

            <div className="md:col-span-2">
              <label className="text-[10px] font-black text-slate-400 font-mono">
                Task / Auditable Chore (Singular / Plural)
              </label>
              <div className="grid grid-cols-2 gap-2 mt-1.5">
                <input
                  type="text"
                  placeholder="Singular (e.g. Task)"
                  value={taxonomy.taskSingular || ''}
                  onChange={(e) => setTaxonomy({ ...taxonomy, taskSingular: e.target.value })}
                  className="w-full text-xs font-semibold bg-white border border-slate-200 rounded-xl p-3 outline-none focus:border-indigo-600"
                />
                <input
                  type="text"
                  placeholder="Plural (e.g. Tasks)"
                  value={taxonomy.taskPlural || ''}
                  onChange={(e) => setTaxonomy({ ...taxonomy, taskPlural: e.target.value })}
                  className="w-full text-xs font-semibold bg-white border border-slate-200 rounded-xl p-3 outline-none focus:border-indigo-605"
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-1 font-semibold">Terms representing actions, compliance logs, or operational routines.</p>
            </div>
          </div>

          <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-150 flex items-center gap-3">
            <Info className="text-indigo-900 w-5 h-5 shrink-0" />
            <p className="text-[11px] text-indigo-950 font-semibold leading-relaxed">
              Tip: Label updates take effect instantly across all tabs, filters, and reports, reflecting a truly adaptable domain-agnostic ecosystem.
            </p>
          </div>
        </div>
      )}

      {/* SUB-TAB 6: Factory Reset & Purge */}
      {activeSubTab === 'purge' && (
        <div className="bg-rose-50/20 p-6 rounded-3xl border border-rose-100/60 text-left space-y-6 animate-[fadeIn_0.15s_ease-out]">
          <div>
            <h3 className="text-sm font-black text-rose-850 mb-1 flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-rose-650" /> System Factory Reset
            </h3>
            <p className="text-xs text-slate-500 font-sans leading-relaxed">
              This will perform an absolute, irreversible data reset on this application and its workspace. Clears local caching parameters and scrubs all Firestore collections.
            </p>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-rose-105 shadow-xs space-y-4 max-w-xl">
            <div className="bg-rose-50/80 p-4 rounded-xl border border-rose-100 flex items-start gap-3">
              <span className="text-rose-600 font-black text-sm shrink-0">⚠️ CRITICAL:</span>
              <div className="text-[11.5px] text-rose-950 font-semibold space-y-1">
                <p>The following data elements will be completely purged and destroyed:</p>
                <ul className="list-disc pl-4 space-y-0.5">
                  <li><strong>All registered {taxonomy.memberPlural.toLowerCase()} records</strong></li>
                  <li><strong>Active scheduling roster cycles & historically archived shifts</strong></li>
                  <li><strong>All custom auditable {taxonomy.taskPlural.toLowerCase()} configurations</strong></li>
                  <li><strong>Full daily task compliance history logs</strong></li>
                  <li><strong>Timesheet submissions, approvals, and overtime logs</strong></li>
                  <li><strong>All customized sub-teams, departments, and custom shifts</strong></li>
                </ul>
              </div>
            </div>

            <p className="text-xs text-slate-650 font-sans leading-relaxed font-semibold">
              To proceed and completely initialize a blank slate setup, please enter the confirmation keyword <strong className="text-rose-600 font-mono text-[13px] bg-rose-50 px-1.5 py-0.5 rounded border border-rose-100 select-all">RESET</strong> in the validator field below:
            </p>

            <div className="space-y-3">
              <input
                type="text"
                placeholder="Type RESET here to confirm..."
                id="reset-validator-input"
                className="w-full text-xs font-black uppercase text-center bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:border-rose-500 focus:bg-white focus:ring-2 focus:ring-rose-200/50"
              />

              <button
                type="button"
                onClick={async () => {
                  const inputVal = (document.getElementById('reset-validator-input') as HTMLInputElement)?.value;
                  if (inputVal !== 'RESET') {
                    toast.error('Type exactly "RESET" to confirm.');
                    return;
                  }

                  if (await confirm({ title: 'Purge all records?', message: 'This permanently erases everything and resets to a blank slate. It cannot be undone.', danger: true, confirmLabel: 'Purge everything' })) {
                    if (onFullReset) {
                      await onFullReset();
                    }
                  }
                }}
                className="w-full py-3 bg-rose-900 hover:bg-rose-950 text-white font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" /> Purge Workspace Data & Reset to Blank Slate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Facility Modal Overlay */}
      {editingFacility && (
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-[fadeIn_0.15s_ease-out]">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden text-left flex flex-col max-h-[90vh]">
            <div className="bg-indigo-950 text-white p-5 flex justify-between items-center">
              <div>
                <h3 className="text-sm font-black">Modify {taxonomy.workspaceSingular}</h3>
                <p className="text-[10px] text-sky-100 mt-0.5 font-semibold">
                  Updating Settings for {editingFacility.name}
                </p>
              </div>
              <button 
                onClick={() => setEditingFacility(null)} 
                className="text-white hover:text-rose-250 transition-colors bg-white/10 hover:bg-white/20 p-1.5 rounded-full cursor-pointer"
              >
                <span className="text-sm font-black block w-3.5 h-3.5 text-center leading-3.5">✕</span>
              </button>
            </div>
            
            <form onSubmit={handleUpdateFacilitySubmit} className="p-5 space-y-4 overflow-y-auto">
              <div>
                <label className="text-[9.5px] font-black text-slate-400 block mb-1">Name *</label>
                <input
                  type="text"
                  required
                  value={facEditName}
                  onChange={(e) => setFacEditName(e.target.value)}
                  className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:border-indigo-650 focus:bg-white mt-1"
                />
              </div>

              <div>
                <label className="text-[9.5px] font-black text-slate-400 block mb-1">Location *</label>
                <input
                  type="text"
                  required
                  value={facEditLoc}
                  onChange={(e) => setFacEditLoc(e.target.value)}
                  className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:border-indigo-650 focus:bg-white mt-1"
                />
              </div>

              <div>
                <label className="text-[9.5px] font-black text-slate-400 block mb-1">Supervisor / Lead Manager *</label>
                <input
                  type="text"
                  required
                  value={facEditManager}
                  onChange={(e) => setFacEditManager(e.target.value)}
                  className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:border-indigo-650 focus:bg-white mt-1"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9.5px] font-black text-slate-400 block mb-1">SLA Target Temperature</label>
                  <input
                    type="text"
                    value={facEditSlaTemp}
                    onChange={(e) => setFacEditSlaTemp(e.target.value)}
                    className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:border-indigo-650 mt-1"
                  />
                </div>
                <div>
                  <label className="text-[9.5px] font-black text-slate-400 block mb-1">Compliance IP Target</label>
                  <input
                    type="text"
                    value={facEditIp}
                    onChange={(e) => setFacEditIp(e.target.value)}
                    className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:border-indigo-650 mt-1"
                  />
                </div>
              </div>

              <div>
                <label className="text-[9.5px] font-black text-slate-400 block mb-1">Daily KPI Audit Check Phrase</label>
                <input
                  type="text"
                  value={facEditKpi}
                  onChange={(e) => setFacEditKpi(e.target.value)}
                  className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:border-indigo-650 mt-1"
                />
              </div>

              <div>
                <label className="text-[9.5px] font-black text-slate-400 block mb-1">Classification Type</label>
                <select
                  value={facEditType}
                  onChange={(e) => setFacEditType(e.target.value)}
                  className="w-full text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:border-indigo-650 focus:bg-white mt-1"
                >
                  {[...new Set([facEditType, ...facilityTypes])].filter(Boolean).map(ft => <option key={ft} value={ft}>{ft}</option>)}
                </select>
              </div>

              <div className="flex gap-2 pt-4 border-t border-slate-100 justify-end">
                <button
                  type="button"
                  onClick={() => setEditingFacility(null)}
                  className="px-4 py-2 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-755 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold bg-indigo-950 text-white rounded-xl shadow-xs hover:bg-slate-900 cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Staff Modal Overlay */}
      {editingStaff && (
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-[fadeIn_0.15s_ease-out]">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden text-left flex flex-col max-h-[95vh]">
            <div className="bg-indigo-955 bg-indigo-950 text-white p-5 flex justify-between items-center">
              <div>
                <h3 className="text-sm font-black">Edit Personnel Details</h3>
                <p className="text-[10px] text-sky-100 mt-0.5 font-semibold">
                  Modifying {editingStaff.fullName || editingStaff.name}
                </p>
              </div>
              <button 
                onClick={() => setEditingStaff(null)} 
                className="text-white hover:text-rose-250 transition-colors bg-white/10 hover:bg-white/20 p-1.5 rounded-full cursor-pointer"
              >
                <span className="text-sm font-black block w-3.5 h-3.5 text-center leading-3.5">✕</span>
              </button>
            </div>
            
            <form onSubmit={handleSaveEdit} className="p-5 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9.5px] font-black text-slate-400 block mb-1">First Name Mnemonic *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Kasoka"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full text-xs font-semibold bg-white border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-650"
                  />
                </div>
                <div>
                  <label className="text-[9.5px] font-black text-slate-400 block mb-1">colleague ID *</label>
                  <input
                    type="text"
                    required
                    placeholder="EMP-40"
                    value={editEmpNo}
                    onChange={(e) => setEditEmpNo(e.target.value)}
                    className="w-full text-xs font-mono font-black bg-white border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-650"
                  />
                </div>
              </div>

              <div>
                <label className="text-[9.5px] font-black text-slate-400 block mb-1">Full Official Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Kasoka Mwansa"
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  className="w-full text-xs font-semibold bg-white border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-650"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9.5px] font-black text-slate-400 block mb-1">Role / Designation *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Operator"
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value)}
                    className="w-full text-xs font-semibold bg-white border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-650"
                  />
                </div>
                <div>
                  <label className="text-[9.2px] font-black text-slate-400 block mb-1">Contract Hrs</label>
                  <input
                    type="number"
                    placeholder="168"
                    value={editHoursVal}
                    onChange={(e) => setEditHoursVal(Number(e.target.value))}
                    className="w-full text-xs font-bold bg-white border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-650"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9.2px] font-black text-slate-400 block mb-1">Gender</label>
                  <select
                    value={editGender}
                    onChange={(e) => setEditGender(e.target.value as any)}
                    className="w-full text-xs font-bold bg-white border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-650"
                  >
                    <option value="M">Male (M)</option>
                    <option value="F">Female (F)</option>
                    <option value="">N/A</option>
                  </select>
                </div>
                <div>
                  <label className="text-[9.2px] font-black text-slate-400 block mb-1">{taxonomy.groupSingular} Assign</label>
                  <select
                    value={editDeptId}
                    onChange={(e) => setEditDeptId(e.target.value)}
                    className="w-full text-xs font-bold bg-white border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-650"
                  >
                    <option value="">All {taxonomy.groupPlural.toLowerCase()}</option>
                    {facilityDepts.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[9.5px] font-black text-slate-400 block mb-1">Corporate Email</label>
                <input
                  type="email"
                  placeholder="name@tenant.com"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full text-xs font-semibold bg-white border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-650"
                />
              </div>

              <div>
                <label className="text-[9.5px] font-black text-slate-400 block mb-1">Phone Contact</label>
                <input
                  type="text"
                  placeholder="+260 971 000 000"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full text-xs font-semibold bg-white border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-650"
                />
              </div>

              <div>
                <label className="text-[9.5px] font-black text-slate-400 block mb-1">Skills / Competencies</label>
                <input
                  type="text"
                  placeholder="comma-separated, e.g. First Aid, Forklift License"
                  value={editSkills}
                  onChange={(e) => setEditSkills(e.target.value)}
                  className="w-full text-xs font-semibold bg-white border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-650"
                />
              </div>

              <div>
                <label className="text-[9.5px] font-black text-slate-400 block mb-1">Access Level</label>
                <select
                  value={editAccessLevel}
                  onChange={(e) => setEditAccessLevel(e.target.value)}
                  className="w-full text-xs font-semibold bg-white border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-650"
                >
                  {/* Always show the member's current level even if above what we can assign,
                      so we never silently downgrade; only assignable ones are selectable. */}
                  {(assignableRoles.some(r => r.value === editAccessLevel)
                    ? assignableRoles
                    : [...assignableRoles, ROLE_OPTIONS.find(r => r.value === editAccessLevel)!]
                  ).map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                <p className="text-[9px] text-slate-400 mt-1">Governs what this person sees and does. Resolved from their login email.</p>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingStaff(null)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs rounded-xl shadow-xs transition-colors cursor-pointer text-center"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-indigo-950 hover:bg-slate-900 text-white font-extrabold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-4 h-4" /> Save Details
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
