import React, { useState } from 'react';
import { StaffMember, TaskMaster, Department, AbsenceLog, TaskFieldDef } from '../types';
import { 
  Sparkles, 
  Trash2, 
  Calendar, 
  ShieldCheck, 
  X, 
  AlertCircle, 
  Users, 
  CheckCircle, 
  UserPlus, 
  ClipboardList, 
  Briefcase, 
  Check, 
  ChevronRight, 
  ChevronLeft,
  Settings,
  Plus
} from 'lucide-react';
import { useToast } from './ui/ToastProvider';

interface WizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  staffList: StaffMember[];
  setStaffList: React.Dispatch<React.SetStateAction<StaffMember[]>>;
  taskMasterList: TaskMaster[];
  setTaskMasterList: React.Dispatch<React.SetStateAction<TaskMaster[]>>;
  departments: Department[];
  selectedFacilityId: string;
  onGenerate: (absences: AbsenceLog[], scTeamSize: number) => void;
}

// Healthy Preset Task Templates for facilities
const TASK_PRESET_TEMPLATES = [
  {
    id: "preset-1",
    taskName: "Start-of-Shift Handover",
    roleRequirement: "All Staff",
    targetHour: "08:30 AM",
    description: "Quick handover at the start of the shift: outstanding tasks, the day's priorities, and anything the next team should know.",
    category: "Communication",
    customFields: [
      {
        id: "briefingNote",
        label: "Handover notes",
        type: "text",
        required: true,
        placeholder: "e.g. Two tasks carried over, delivery expected at noon, all else on track."
      }
    ]
  },
  {
    id: "preset-2",
    taskName: "End-of-Day Reconciliation",
    roleRequirement: "Shift Lead",
    targetHour: "5:00 PM",
    description: "Reconcile cash, stock, or high-value items against the day's records. Sign off when the counts match.",
    category: "Compliance",
    customFields: [
      {
        id: "clinicalComment",
        label: "Reconciliation notes",
        type: "text",
        required: true,
        placeholder: "e.g. Counts match the day's records. Reconciled and signed off."
      }
    ]
  },
  {
    id: "preset-3",
    taskName: "Service Queue & Backlog Review",
    roleRequirement: "Team Member",
    targetHour: "10:00 AM",
    description: "Check the pending queue, clear the backlog where possible, and flag anything that needs escalation.",
    category: "Operations",
    customFields: [
      {
        id: "queueSize",
        label: "Items remaining in queue",
        type: "number",
        required: true,
        placeholder: "0"
      },
      {
        id: "statusCheck",
        label: "Queue status",
        type: "select",
        required: true,
        selectOptions: ["Fully cleared", "Manageable backlog", "Severe delay - needs help"]
      }
    ]
  },
  {
    id: "it-preset-1",
    taskName: "IT Server Core Temperature & Status Logs",
    roleRequirement: "IT Technician",
    targetHour: "10:00 AM",
    description: "Verify server rack ambient climate limits and active cloud storage telemetry. Enter actual temperatures.",
    category: "IT Support",
    customFields: [
      {
        id: "fridgeTemp", // mapped for legacy too
        label: "Active Server Rack Temperature (°C)",
        type: "number",
        required: true,
        minValue: 10.0,
        maxValue: 25.0,
        breachThresholdAction: "PROCEDURE ENFORCED: Trigger extra precision HVAC unit backup and inform IT Director!"
      },
      {
        id: "backupSuccess",
        label: "Local Storage Backup Completed",
        type: "checkbox",
        required: true
      }
    ]
  },
  {
    id: "maint-preset-1",
    taskName: "Backup Generator Diesel Fuel Level Audit",
    roleRequirement: "Facilities Officer",
    targetHour: "11:30 AM",
    description: "Check Backup Power Diesel Levels. Verify physical tie seal is intact on the security reserve vault.",
    category: "Maintenance",
    customFields: [
      {
        id: "dieselLvl",
        label: "Diesel Tank Fuel Volume Level (%)",
        type: "number",
        required: true,
        minValue: 30.0,
        maxValue: 100.0,
        breachThresholdAction: "PROCEDURE ENFORCED: Submit an emergency fuel shipment logistics request form."
      },
      {
        id: "sealNumber", // mapped for legacy too
        label: "Reserve Tank Plastic Tie Seal security index",
        type: "text",
        required: true,
        placeholder: "e.g. SEAL-82410"
      }
    ]
  },
  {
    id: "admin-preset-1",
    taskName: "Weekly Incident Register Supervisor Review",
    roleRequirement: "Administrative Officer",
    targetHour: "04:00 PM",
    description: "Audit weekly incident logs with safety lead on duty to approve formal compliance logs.",
    category: "Administrative Support",
    customFields: [
      {
        id: "clinicalComment", // mapped for legacy too
        label: "Incident Audit Reconciliation Result Comments",
        type: "text",
        required: true,
        placeholder: "e.g., Reviewed logs. Logged 0 safety incidents and approved weekly page signatures."
      },
      {
        id: "auditSign",
        label: "Incident Log Approved & Closed",
        type: "checkbox",
        required: true
      }
    ]
  }
];

export default function WizardModal({ 
  isOpen, 
  onClose, 
  staffList, 
  setStaffList,
  taskMasterList,
  setTaskMasterList,
  departments,
  selectedFacilityId,
  onGenerate 
}: WizardModalProps) {
  const toast = useToast();
  const [activeStep, setActiveStep] = useState<number>(1); // 1: Staff, 2: Tasks, 3: Launch

  // Step 1: Staff Onboarding State
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffRole, setNewStaffRole] = useState('Pharmacist');
  const [newStaffDept, setNewStaffDept] = useState(departments[0]?.id || '');
  const [newStaffWeeklyTarget, setNewStaffWeeklyTarget] = useState(40);
  const [onboardSuccessMsg, setOnboardSuccessMsg] = useState('');

  // Step 2: Task Templates Import State
  const [selectedPresets, setSelectedPresets] = useState<string[]>(
    TASK_PRESET_TEMPLATES.map(p => p.id) // Default import all
  );
  const [templateSuccessMsg, setTemplateSuccessMsg] = useState('');

  // Step 3: Launch & Generate Roster State
  const [absences, setAbsences] = useState<AbsenceLog[]>([]);
  const [selectedStaffForAbsence, setSelectedStaffForAbsence] = useState('');
  const [absenceStartDate, setAbsenceStartDate] = useState('2026-06-15');
  const [absenceEndDate, setAbsenceEndDate] = useState('2026-06-20');
  const [absenceType, setAbsenceType] = useState<'AL' | 'SL' | 'CO' | 'TRN' | 'OS'>('AL');
  const [scTeamSize, setScTeamSize] = useState<number>(3);

  // Initialize selectedStaff on step 3 entry
  React.useEffect(() => {
    if (staffList.length > 0 && !selectedStaffForAbsence) {
      setSelectedStaffForAbsence(staffList[0].name);
    }
  }, [staffList, selectedStaffForAbsence]);

  if (!isOpen) return null;

  // Handle Staff addition
  const handleAddOnboardStaff = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStaffName.trim()) {
      toast.error('Please enter a staff member name.');
      return;
    }

    const matchedDept = departments.find(d => d.id === newStaffDept) || departments[0];

    const newStaff: StaffMember = {
      id: `staff-${Date.now()}`,
      facilityId: selectedFacilityId,
      departmentId: matchedDept?.id || undefined,
      name: newStaffName.trim(),
      fullName: newStaffName.trim(),
      email: `${newStaffName.toLowerCase().replace(/\s+/g, '.')}@${selectedFacilityId || 'workspace'}.local`,
      phone: '',
      role: newStaffRole,
      contractedHours: Number(newStaffWeeklyTarget),
      employeeNo: `MBCH-${Date.now().toString().slice(-6)}`,
      gender: 'M',
      isManager: false
    };

    const updatedStaffList = [...staffList, newStaff];
    setStaffList(updatedStaffList);
    localStorage.setItem(`facility_${selectedFacilityId}_staff_list`, JSON.stringify(updatedStaffList));

    setOnboardSuccessMsg(`Verified & Onboarded ${newStaff.name} to database!`);
    setNewStaffName('');
    setTimeout(() => setOnboardSuccessMsg(''), 3000);
  };

  // Helper for unique staff color palettes
  function getRandomTailwindBadgeColor(role: string): string {
    if (role.includes('Pharmacist')) return 'emerald';
    if (role.includes('Nurse')) return 'sky';
    if (role.includes('Officer')) return 'yellow';
    if (role.includes('Lab')) return 'purple';
    return 'slate';
  }

  // Handle Task Template Imports
  const handleImportSelectedTasks = () => {
    if (selectedPresets.length === 0) {
      toast.error('Please choose at least one task template to import.');
      return;
    }

    const importedTasksArr: TaskMaster[] = [];
    TASK_PRESET_TEMPLATES.forEach(p => {
      if (selectedPresets.includes(p.id)) {
        // Prepare to avoid duplicated names
        const exists = taskMasterList.some(t => t.name.toLowerCase() === p.taskName.toLowerCase());
        if (!exists) {
          importedTasksArr.push({
            id: `task-pres-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            name: p.taskName,
            category: p.category as any,
            pattern: 'Shift-based',
            assignedValue: p.roleRequirement,
            notes: p.description,
            priority: 'Critical',
            frequency: 'Daily',
            compliance: true,
            active: true,
            customFields: p.customFields as TaskFieldDef[]
          });
        }
      }
    });

    if (importedTasksArr.length > 0) {
      const mergedTasks = [...taskMasterList, ...importedTasksArr];
      setTaskMasterList(mergedTasks);
      localStorage.setItem(`facility_${selectedFacilityId}_task_master`, JSON.stringify(mergedTasks));
      setTemplateSuccessMsg(`Successfully imported ${importedTasksArr.length} task templates!`);
    } else {
      setTemplateSuccessMsg('All chosen task configurations already exist in master database.');
    }

    setTimeout(() => setTemplateSuccessMsg(''), 3000);
  };

  // Add absence in third step
  const handleAddAbsence = () => {
    if (!absenceStartDate || !absenceEndDate) {
      toast.error('Please fill in start and end dates.');
      return;
    }
    if (new Date(absenceStartDate) > new Date(absenceEndDate)) {
      toast.error('End date must be on or after the start date.');
      return;
    }

    const nameToRegister = selectedStaffForAbsence || staffList[0]?.name;
    if (!nameToRegister) {
      toast.error('Please select a staff member.');
      return;
    }

    const newAbsence: AbsenceLog = {
      id: `absence-${Date.now()}`,
      staffName: nameToRegister,
      startDate: absenceStartDate,
      endDate: absenceEndDate,
      type: absenceType
    };

    setAbsences([...absences, newAbsence]);
  };

  const handleRemoveAbsence = (id: string) => {
    setAbsences(absences.filter(a => a.id !== id));
  };

  // Final Action: Generate & Boot
  const handleFinishLaunch = () => {
    onGenerate(absences, scTeamSize);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-[fadeIn_0.2s_ease-out]">
      <div className="bg-white rounded-3xl max-w-2xl w-full p-6 md:p-8 shadow-2xl border border-gray-150 relative max-h-[90vh] flex flex-col">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors p-2 hover:bg-slate-50 rounded-xl cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Wizard Header Info */}
        <div className="mb-6 shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-amber-100 p-2.5 rounded-2xl text-amber-800">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h2 className="font-sans font-black text-lg text-slate-900 tracking-tight">Onboarding & Setup Wizard</h2>
              <p className="text-xs text-slate-500 mt-0.5">Set up your team, tasks, and first roster — step by step</p>
            </div>
          </div>

          {/* Stepper Progress Indicator */}
          <div className="grid grid-cols-3 gap-2 mt-6">
            <button 
              onClick={() => setActiveStep(1)}
              className={`py-2 px-3 rounded-xl border text-left cursor-pointer transition-all ${
                activeStep === 1 
                  ? 'border-amber-500 bg-amber-50/50 text-amber-900 font-extrabold shadow-xs' 
                  : 'border-slate-100 bg-slate-50/50 text-slate-400 font-bold hover:bg-slate-100/50'
              }`}
            >
              <div className="text-[10px] uppercase tracking-wider opacity-60">Step 01</div>
              <div className="text-xs flex items-center gap-1.5 mt-0.5">
                <UserPlus className="w-3.5 h-3.5" />
                Staff Onboard
              </div>
            </button>
            <button 
              onClick={() => setActiveStep(2)}
              className={`py-2 px-3 rounded-xl border text-left cursor-pointer transition-all ${
                activeStep === 2 
                  ? 'border-amber-500 bg-amber-50/50 text-amber-900 font-extrabold shadow-xs' 
                  : 'border-slate-100 bg-slate-50/50 text-slate-400 font-bold hover:bg-slate-100/50'
              }`}
            >
              <div className="text-[10px] uppercase tracking-wider opacity-60">Step 02</div>
              <div className="text-xs flex items-center gap-1.5 mt-0.5">
                <ClipboardList className="w-3.5 h-3.5" />
                Task Templates
              </div>
            </button>
            <button 
              onClick={() => setActiveStep(3)}
              className={`py-2 px-3 rounded-xl border text-left cursor-pointer transition-all ${
                activeStep === 3 
                  ? 'border-amber-500 bg-amber-50/50 text-amber-900 font-extrabold shadow-xs' 
                  : 'border-slate-100 bg-slate-50/50 text-slate-400 font-bold hover:bg-slate-100/50'
              }`}
            >
              <div className="text-[10px] uppercase tracking-wider opacity-60">Step 03</div>
              <div className="text-xs flex items-center gap-1.5 mt-0.5">
                <Settings className="w-3.5 h-3.5" />
                Roster Cycle
              </div>
            </button>
          </div>
        </div>

        {/* Dynamic Step Panels Content — only this region scrolls */}
        <div className="flex-1 min-h-0 overflow-y-auto py-1 pr-1">
          
          {/* STEP 1: Staff Onboarding */}
          {activeStep === 1 && (
            <div className="space-y-5 animate-[fadeIn_0.15s_ease-out]">
              <div className="bg-slate-50/60 p-4 border border-slate-100 rounded-2xl flex gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs text-slate-600 leading-relaxed font-semibold">
                  Add the people on this roster. Real staff accounts let the scheduler balance shift coverage and target hours fairly.
                </div>
              </div>

              {/* Add Staff form */}
              <form onSubmit={handleAddOnboardStaff} className="bg-white border border-slate-200/85 p-5 rounded-2xl space-y-4">
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <UserPlus className="w-4 h-4 text-[#7A1230]" /> Add New Facility Staff Member
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">Full Professional Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Alex Banda"
                      value={newStaffName}
                      onChange={(e) => setNewStaffName(e.target.value)}
                      className="w-full text-xs font-bold bg-slate-50/50 border border-slate-200 rounded-xl p-3 focus:bg-white focus:border-[#7A1230] outline-none mt-1.5"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">Role / Designation</label>
                    <select
                      value={newStaffRole}
                      onChange={(e) => setNewStaffRole(e.target.value)}
                      className="w-full text-xs font-extrabold select bg-slate-50/50 border border-slate-200 rounded-xl p-3 focus:bg-white focus:border-[#7A1230] outline-none mt-1.5"
                    >
                      <option value="Pharmacist">Pharmacist</option>
                      <option value="Lead Pharmacist">Lead Pharmacist</option>
                      <option value="Clinical Officer">Clinical Officer</option>
                      <option value="Laboratory Technician">Laboratory Technician</option>
                      <option value="Registered Nurse">Registered Nurse</option>
                      <option value="Assistant Operator">Assistant Operator</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">Assigned Department</label>
                    <select
                      value={newStaffDept}
                      onChange={(e) => setNewStaffDept(e.target.value)}
                      className="w-full text-xs font-extrabold select bg-slate-50/50 border border-slate-200 rounded-xl p-3 focus:bg-white focus:border-[#7A1230] outline-none mt-1.5"
                    >
                      {departments.map(dept => (
                        <option key={dept.id} value={dept.id}>{dept.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">Weekly Target Hours</label>
                    <input
                      type="number"
                      min="20"
                      max="60"
                      value={newStaffWeeklyTarget}
                      onChange={(e) => setNewStaffWeeklyTarget(Number(e.target.value))}
                      className="w-full text-xs font-extrabold bg-slate-50/50 border border-slate-200 rounded-xl p-3 focus:bg-white focus:border-[#7A1230] outline-none mt-1.5"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 bg-[#4C0B1E] hover:bg-[#7A1230] text-white text-xs font-black rounded-xl transition-all shadow-md cursor-pointer text-center flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-4 h-4" /> Add Staff to System
                </button>

                {onboardSuccessMsg && (
                  <div className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-100 p-2.5 rounded-xl font-bold flex items-center gap-1.5">
                    <Check className="w-4 h-4" /> {onboardSuccessMsg}
                  </div>
                )}
              </form>

              {/* Compact current staff list */}
              <div>
                <h4 className="text-[10px] uppercase font-bold tracking-widest text-slate-400 mb-2">Currently Registered Staff ({staffList.length})</h4>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto border border-dashed border-slate-200 p-2.5 rounded-xl">
                  {staffList.map(s => (
                    <span key={s.id} className="text-[10.5px] font-bold bg-[#7A1230]/5 text-[#7A1230] border border-[#7A1230]/15 px-2.5 py-1 rounded-lg">
                      {s.name} <span className="opacity-60">({s.role.split(' ')[0]})</span>
                    </span>
                  ))}
                  {staffList.length === 0 && (
                    <span className="text-xs text-slate-400 italic">No staff registered yet. Please add one above.</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Task Templates Import */}
          {activeStep === 2 && (
            <div className="space-y-5 animate-[fadeIn_0.15s_ease-out]">
              <div className="bg-slate-50/60 p-4 border border-slate-100 rounded-2xl flex gap-3">
                <Briefcase className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs text-slate-600 leading-relaxed font-semibold">
                  Select and import standard peer-reviewed operational procedures and daily safety check lists to initialize Consistent Care workflows. This seeds the daily interactive task board for staff members.
                </div>
              </div>

              {/* Templates Checklist Selection */}
              <div className="bg-white border border-slate-200/85 p-5 rounded-2xl space-y-4">
                <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <ClipboardList className="w-4 h-4 text-[#7A1230]" /> Standard Procedures Preset
                  </h3>
                  <button 
                    onClick={() => {
                      if (selectedPresets.length === TASK_PRESET_TEMPLATES.length) {
                        setSelectedPresets([]);
                      } else {
                        setSelectedPresets(TASK_PRESET_TEMPLATES.map(p => p.id));
                      }
                    }}
                    className="text-[10.5px] font-bold text-[#7A1230] hover:underline cursor-pointer"
                  >
                    Toggle All
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-60 overflow-y-auto pr-1">
                  {TASK_PRESET_TEMPLATES.map(preset => {
                    const isChecked = selectedPresets.includes(preset.id);
                    return (
                      <div 
                        key={preset.id}
                        onClick={() => {
                          if (isChecked) {
                            setSelectedPresets(selectedPresets.filter(id => id !== preset.id));
                          } else {
                            setSelectedPresets([...selectedPresets, preset.id]);
                          }
                        }}
                        className={`p-3 rounded-xl border transition-all cursor-pointer text-left flex items-start gap-3 select-none ${
                          isChecked 
                            ? 'border-amber-200 bg-amber-50/20' 
                            : 'border-slate-150 hover:border-slate-350 bg-white'
                        }`}
                      >
                        <div className={`mt-0.5 w-4.5 h-4.5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                          isChecked ? 'bg-amber-600 border-amber-600 text-white' : 'border-slate-300 bg-white'
                        }`}>
                          {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                        <div className="space-y-1">
                          <span className="text-[11px] font-black text-slate-800 leading-tight block">{preset.taskName}</span>
                          <span className="text-[9.5px] font-bold text-slate-400 bg-slate-100/50 border border-slate-200/50 px-1.5 py-0.5 rounded-md inline-block">
                            {preset.roleRequirement} • {preset.targetHour}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <button
                  onClick={handleImportSelectedTasks}
                  className="w-full py-2.5 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white text-xs font-black rounded-xl transition-all shadow-md cursor-pointer text-center flex items-center justify-center gap-1.5"
                >
                  <Briefcase className="w-4 h-4" /> Import Selected Checklists ({selectedPresets.length})
                </button>

                {templateSuccessMsg && (
                  <div className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-100 p-2.5 rounded-xl font-bold flex items-center gap-1.5">
                    <CheckCircle className="w-4 h-4" /> {templateSuccessMsg}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 3: Roster Setup & Initialization */}
          {activeStep === 3 && (
            <div className="space-y-5 animate-[fadeIn_0.15s_ease-out]">
              <div className="bg-slate-50/60 p-4 border border-slate-100 rounded-2xl flex gap-3">
                <Calendar className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs text-slate-600 leading-relaxed font-semibold">
                  Record planned leaves first to ensure optimized coverage. Decide on-site staffing loading for extreme cycles, then execute the smart simulator.
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Absence logger inside step 3 */}
                <div className="bg-white border border-slate-200/85 p-4.5 rounded-2xl space-y-3">
                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                    Calendar Leaves & Absences
                  </h3>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block block">Staff Member</label>
                    <select
                      value={selectedStaffForAbsence}
                      onChange={(e) => setSelectedStaffForAbsence(e.target.value)}
                      className="w-full text-xs font-bold select bg-slate-50/50 border border-slate-200 rounded-xl p-2.5 focus:border-[#7A1230] outline-none mt-1"
                    >
                      {staffList.map(s => (
                        <option key={s.id} value={s.name}>{s.name} ({s.role.split(' ')[0]})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Type</label>
                    <select
                      value={absenceType}
                      onChange={(e) => setAbsenceType(e.target.value as any)}
                      className="w-full text-xs font-bold select bg-slate-50/50 border border-slate-200 rounded-xl p-2.5 focus:border-[#7A1230] outline-none mt-1"
                    >
                      <option value="AL">Annual Leave (AL)</option>
                      <option value="TRN">Training/Workshop (TRN)</option>
                      <option value="OS">Off-Site Duty (OS)</option>
                      <option value="SL">Sick/Study Leave (SL)</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Start Date</label>
                      <input
                        type="date"
                        value={absenceStartDate}
                        onChange={(e) => setAbsenceStartDate(e.target.value)}
                        className="w-full text-xs font-bold bg-slate-50/50 border border-slate-200 rounded-xl p-2.5 focus:border-[#7A1230] outline-none mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">End Date</label>
                      <input
                        type="date"
                        value={absenceEndDate}
                        onChange={(e) => setAbsenceEndDate(e.target.value)}
                        className="w-full text-xs font-bold bg-slate-50/50 border border-slate-200 rounded-xl p-2.5 focus:border-[#7A1230] outline-none mt-1"
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleAddAbsence}
                    className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-extrabold rounded-lg transition-colors cursor-pointer text-center"
                  >
                    + Register Leave Period
                  </button>
                </div>

                {/* Team Sizes & Current exclusions */}
                <div className="space-y-4">
                  {/* Sizing list */}
                  <div className="bg-slate-50/60 border border-slate-200/50 p-4.5 rounded-2xl space-y-3">
                    <label className="text-xs font-extrabold text-slate-700 flex items-center gap-1.5 select-none">
                      <Users className="w-4 h-4 text-[#7A1230]" /> Required Pharmacists:
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="6"
                      value={scTeamSize}
                      onChange={(e) => setScTeamSize(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-20 text-xs font-black bg-white border border-slate-200 rounded-xl p-2.5 font-mono focus:border-[#7A1230] outline-none text-center text-[#7A1230]"
                    />
                    <p className="text-[10px] text-slate-400 font-semibold leading-relaxed">
                      This represents targeted on-site staff loadings during heavy stock-count shifts.
                    </p>
                  </div>

                  {/* Log outcomes */}
                  {absences.length > 0 && (
                    <div className="border border-amber-200 bg-amber-50/10 rounded-2xl p-3 max-h-24 overflow-y-auto">
                      <h4 className="text-[10px] font-bold text-amber-800 flex items-center gap-1 uppercase">
                         Gaps Added ({absences.length}):
                      </h4>
                      <div className="flex flex-col gap-1 mt-1 text-[10px] font-bold text-slate-600">
                        {absences.map((ab) => (
                          <div key={ab.id} className="flex justify-between items-center bg-white border border-slate-100 px-2 py-1 rounded">
                            <span>{ab.staffName} ({ab.type})</span>
                            <button onClick={() => handleRemoveAbsence(ab.id)} className="text-red-500 font-black hover:text-red-700 cursor-pointer">✕</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Wizard Footer Controls — pinned below the scroll area */}
        <div className="flex justify-between items-center gap-3 border-t border-slate-100 pt-4 mt-4 shrink-0">
          <div>
            <p className="text-[10px] text-slate-400 font-mono">
              ★ Active step {activeStep} of 3
            </p>
          </div>

          <div className="flex gap-2">
            {activeStep > 1 && (
              <button
                onClick={() => setActiveStep(activeStep - 1)}
                className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl flex items-center gap-1 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
            )}

            {activeStep < 3 ? (
              <button
                onClick={() => setActiveStep(activeStep + 1)}
                className="py-2.5 px-4 bg-[#7A1230] hover:bg-[#4C0B1E] text-white font-bold text-xs rounded-xl flex items-center gap-1 cursor-pointer"
              >
                Next Step <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleFinishLaunch}
                className="py-2.5 px-5 bg-gradient-to-r from-[#4C0B1E] via-[#7A1230] to-[#E29E25] text-white font-sans font-black text-xs rounded-xl flex items-center gap-1.5 shadow-md cursor-pointer uppercase tracking-wider"
              >
                <Sparkles className="w-4 h-4 text-amber-200" /> Build roster &amp; finish
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
