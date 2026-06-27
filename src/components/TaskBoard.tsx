import React, { useState, useEffect } from 'react';
import { DailyTask, StaffMember, TaskFieldDef } from '../types';
import { 
  Clipboard, 
  ShieldAlert, 
  Award, 
  ChevronRight, 
  ChevronDown, 
  Check, 
  Save, 
  AlertCircle,
  TrendingUp,
  RotateCcw,
  Sparkles,
  Info,
  Thermometer,
  Lock,
  Tag,
  AlertOctagon,
  FileCheck,
  History,
  X,
  User,
  Clock,
  Printer,
  ShieldCheck,
  Layers
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useToast } from './ui/ToastProvider';

interface TaskBoardProps {
  dailyTasks: DailyTask[];
  onUpdateTask: (
    taskId: string, 
    status: DailyTask['status'], 
    counterSign?: string, 
    metadata?: Partial<DailyTask>
  ) => void;
  onIncrementTracker: (taskId: string, amount: number) => void;
  staffList: StaffMember[];
  cycleDates: string[];
  activeStaffId: string;
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
  taskCategories?: string[];
  focusStaffName?: string | null;
  onFocusConsumed?: () => void;
  jumpToTab?: 'OVERDUE' | 'BLOCKED' | null;
  onJumpConsumed?: () => void;
}

export default function TaskBoard({
  dailyTasks,
  onUpdateTask,
  onIncrementTracker,
  staffList,
  cycleDates,
  activeStaffId,
  taxonomy,
  taskCategories = [],
  focusStaffName,
  onFocusConsumed,
  jumpToTab,
  onJumpConsumed,
}: TaskBoardProps) {
  const toast = useToast();
  const [dateScope, setDateScope] = useState<'today' | 'all'>('today');
  const [showGuide, setShowGuide] = useState(false);
  const [showCounterSignModal, setShowCounterSignModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<DailyTask | null>(null);
  const [historyDrawerTask, setHistoryDrawerTask] = useState<DailyTask | null>(null);
  
  // Supervisor witness co-signature
  const [supervisorName, setSupervisorName] = useState('');
  
  // Rich environmental indicator states
  const [fridgeTempVal, setFridgeTempVal] = useState('4.5');
  const [roomTempVal, setRoomTempVal] = useState('22.0');
  const [correctiveActionText, setCorrectiveActionText] = useState('');
  const [sealNumberVal, setSealNumberVal] = useState('');
  const [clinicalCommentText, setClinicalCommentText] = useState('');

  const [showTrackerInput, setShowTrackerInput] = useState<{ [id: string]: boolean }>({});
  const [trackerVal, setTrackerVal] = useState<{ [id: string]: number }>({});
  const [showCompletedFolder, setShowCompletedFolder] = useState(false);

  // Inline "mark blocked" reason capture — same lightweight pattern as the
  // tracker increment form, so we don't need a new modal for one short field.
  const [showBlockForm, setShowBlockForm] = useState<{ [id: string]: boolean }>({});
  const [blockReasonInput, setBlockReasonInput] = useState<{ [id: string]: string }>({});
  
  // Dynamic fields state for custom checklist forms
  const [customFieldsData, setCustomFieldsData] = useState<{ [fieldId: string]: any }>({});
  const [customFieldBreachActions, setCustomFieldBreachActions] = useState<{ [fieldId: string]: string }>({});

  const getResolvedTaskFields = (task: DailyTask | null): TaskFieldDef[] => {
    if (!task) return [];
    if (task.customFields && task.customFields.length > 0) {
      return task.customFields;
    }
    
    // Auto-resolve schema on-the-fly for legacy backward compatibility (cleans up hardcoding)
    const lowerName = task.taskName.toLowerCase();
    const resolved: TaskFieldDef[] = [];
    
    if (lowerName.includes('temperature') || lowerName.includes('fridge') || lowerName.includes('cold')) {
      resolved.push({
        id: 'fridgeTemp',
        label: 'Storage Unit / Fridge Temp (°C)',
        type: 'number',
        required: true,
        placeholder: '4.5',
        minValue: 2.0,
        maxValue: 8.0,
        breachThresholdAction: 'PROCEDURE ENFORCED: Relocate asset stock to validated alternate storage and notify safety director.'
      });
      resolved.push({
        id: 'roomTemp',
        label: 'Room Ambient Temp (°C)',
        type: 'number',
        required: true,
        placeholder: '22.0',
        maxValue: 25.0,
        breachThresholdAction: 'PROCEDURE ENFORCED: Engaged active backup HVAC conditioning.'
      });
    } else if (lowerName.includes('trolley') || lowerName.includes('locker') || lowerName.includes('seal') || lowerName.includes('security check')) {
      resolved.push({
        id: 'sealNumber',
        label: 'Verify Lock Tag ID / Plastic Tie Seal Code',
        type: 'text',
        required: true,
        placeholder: 'e.g., SEAL-92408'
      });
    } else if (lowerName.includes('dda') || lowerName.includes('controlled') || lowerName.includes('restrict') || lowerName.includes('stock count') || lowerName.includes('audit')) {
      resolved.push({
        id: 'clinicalComment',
        label: 'Asset Audit Register Reconciliation Comments',
        type: 'text',
        required: true,
        placeholder: 'e.g., Physical drug/asset count matches systemic balance ledger sheet. Page reconciled.'
      });
    } else {
      // General fall-back field for any normal task
      resolved.push({
        id: 'clinicalComment',
        label: 'Operational observations / Audit Remarks',
        type: 'text',
        required: false,
        placeholder: 'e.g., Visually inspected, all structures aligned with SLA.'
      });
    }
    
    return resolved;
  };
  
  // Urgency & Assignment Tabs
  const [activeUrgencyTab, setActiveUrgencyTab] = useState<'MY_TASKS' | 'CRITICAL' | 'STANDARD' | 'ROUTINE' | 'OVERDUE' | 'BLOCKED'>('MY_TASKS');

  // Category Filter Tabs — driven by this workspace's actual configured
  // categories, not a fixed list, so it works for any kind of business.
  const [activeCategoryTab, setActiveCategoryTab] = useState<string>('ALL');

  // Drill-down from the dashboard's workload summary: shows just one
  // person's tasks regardless of the urgency tab, until cleared.
  const [focusPersonName, setFocusPersonName] = useState<string | null>(null);
  useEffect(() => {
    if (focusStaffName) {
      setFocusPersonName(focusStaffName);
      onFocusConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusStaffName]);

  // Deep-link from the dashboard's Overdue stat — jump straight to that tab.
  useEffect(() => {
    if (jumpToTab) {
      setActiveUrgencyTab(jumpToTab);
      setFocusPersonName(null);
      onJumpConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpToTab]);

  const activeStaff = staffList.find(s => s.id === activeStaffId);

  const getTaskHistory = (task: DailyTask) => {
    const list = [...(task.history || [])];
    if (list.length === 0) {
      list.push({
        id: `seed-1-${task.id}`,
        timestamp: `${task.date} 08:00`,
        action: "Task Initialized",
        staffName: "System Automated Scheduler",
        details: `Task automatically generated for Shift Post ${task.shiftCode} under ${task.category}. Assigned to ${task.staffName}.`
      });
      
      if (task.status === 'Done') {
        list.push({
          id: `seed-2-${task.id}`,
          timestamp: `${task.date} 16:30`,
          action: "Certified Compliant (Completed)",
          staffName: task.staffName,
          details: task.counterSign 
            ? `Verified by co-signer ${task.counterSign}. Audit logs locked to immutable ledger records.`
            : `Completed directly by assignee under active credentials authentication.`
        });
      }
    }
    return list;
  };

  // Date scope — default to today's tasks, with a toggle to show the whole cycle.
  const todayStr = new Date().toISOString().split('T')[0];
  const scopedSource = dateScope === 'today' ? dailyTasks.filter(t => t.date === todayStr) : dailyTasks;

  // Group task states
  const pendingTasks = scopedSource.filter(t => t.status !== 'Done');
  const completedTasks = scopedSource.filter(t => t.status === 'Done');

  // Overdue tasks are unfinished work left over from a previous day. They're
  // computed independently of dateScope/pendingTasks — under the default
  // "Today" scope, an overdue task's date never equals today, so it would
  // otherwise be filtered out before any tab even runs and a manager would
  // never see it without manually switching to "Whole cycle".
  const overdueTasks = dailyTasks.filter(t => t.date < todayStr && t.status !== 'Done');

  // Blocked tasks are a "needs attention" signal like overdue ones — a
  // blocker doesn't stop mattering just because dateScope is set to "Today"
  // and the task happens to be from yesterday, so this also bypasses scope.
  const blockedTasks = dailyTasks.filter(t => t.status === 'Blocked');

  const isTaskInCategory = (task: DailyTask, catTab: typeof activeCategoryTab) => {
    if (catTab === 'ALL') return true;
    return task.category.toLowerCase() === catTab.toLowerCase();
  };

  // Both sides are plain "YYYY-MM-DD" strings parsed the same way, so the
  // day difference is correct regardless of the viewer's timezone offset.
  const daysOverdue = (task: DailyTask) => {
    const ms = new Date(todayStr).getTime() - new Date(task.date).getTime();
    return Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24)));
  };

  // Filter tasks based on current tab selection and category tab
  const getFilteredTasks = () => {
    if (focusPersonName) {
      return pendingTasks
        .filter(t => t.staffName === focusPersonName)
        .filter(t => isTaskInCategory(t, activeCategoryTab));
    }
    let baseTasks = pendingTasks;
    switch (activeUrgencyTab) {
      case 'MY_TASKS':
        baseTasks = pendingTasks.filter(t => t.staffName === activeStaff?.name);
        break;
      case 'CRITICAL':
        baseTasks = pendingTasks.filter(t => t.priority === 'Critical' || t.priority === 'High');
        break;
      case 'STANDARD':
        baseTasks = pendingTasks.filter(t => t.priority === 'Standard');
        break;
      case 'ROUTINE':
        baseTasks = pendingTasks.filter(t => t.priority === 'Routine');
        break;
      case 'OVERDUE':
        // Independent of pendingTasks/dateScope — see overdueTasks above.
        baseTasks = overdueTasks;
        break;
      case 'BLOCKED':
        baseTasks = blockedTasks;
        break;
    }
    return baseTasks.filter(t => isTaskInCategory(t, activeCategoryTab));
  };

  const currentTasks = getFilteredTasks();

  const handleCheckboxChange = (task: DailyTask, isChecked: boolean) => {
    if (isChecked) {
      setSelectedTask(task);
      setShowCounterSignModal(true);
      
      setSupervisorName('');
      setFridgeTempVal('4.5');
      setRoomTempVal('22.0');
      setCorrectiveActionText('');
      setSealNumberVal('');
      setClinicalCommentText('');

      const fields = getResolvedTaskFields(task);
      const initialData: { [id: string]: any } = {};
      const initialBreaches: { [id: string]: string } = {};
      fields.forEach(f => {
        initialData[f.id] = f.placeholder || '';
        initialBreaches[f.id] = '';
      });
      setCustomFieldsData(initialData);
      setCustomFieldBreachActions(initialBreaches);
    } else {
      onUpdateTask(task.id, 'Pending');
    }
  };

  const handleCounterSignSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTask) return;

    const fields = getResolvedTaskFields(selectedTask);
    const metadata: Partial<DailyTask> = {
      customFieldsData: {},
      customFieldBreachActions: {}
    };

    // Validate and build metadata
    for (const field of fields) {
      const val = customFieldsData[field.id];
      
      // Preserve legacy field formats backported for other references
      if (field.id === 'fridgeTemp') {
        const numVal = parseFloat(val) || 4.5;
        metadata.fridgeTemp = numVal;
        if (numVal < (field.minValue ?? 2.0) || numVal > (field.maxValue ?? 8.0)) {
          const breachAct = customFieldBreachActions[field.id];
          if (!breachAct?.trim()) {
            toast.error(`Please specify corrective action — ${field.label} is outside the allowed range.`);
            return;
          }
          metadata.correctiveAction = breachAct;
        }
      }
      if (field.id === 'roomTemp') {
        metadata.roomTemp = parseFloat(val) || 22.0;
      }
      if (field.id === 'sealNumber') {
        if (field.required && (!val || !String(val).trim())) {
          toast.error(`Please specify the ${field.label}.`);
          return;
        }
        metadata.sealNumber = String(val);
      }
      if (field.id === 'clinicalComment') {
        metadata.clinicalComment = String(val);
      }

      // Check validations
      if (field.required && (val === undefined || val === '')) {
        toast.error(`"${field.label}" is required.`);
        return;
      }

      // Check validations on custom number telemetry
      if (field.type === 'number' && val !== '') {
        const numVal = parseFloat(val);
        const breached = (field.minValue !== undefined && numVal < field.minValue) || (field.maxValue !== undefined && numVal > field.maxValue);
        if (breached && field.breachThresholdAction) {
          const actionText = customFieldBreachActions[field.id];
          if (!actionText?.trim()) {
            toast.error(`Threshold breach — provide corrective actions for "${field.label}".`);
            return;
          }
          if (metadata.customFieldBreachActions) {
            metadata.customFieldBreachActions[field.id] = actionText;
          }
        }
      }

      if (metadata.customFieldsData) {
        metadata.customFieldsData[field.id] = val;
      }
    }

    metadata.customFields = fields;

    onUpdateTask(selectedTask.id, 'Done', supervisorName || undefined, metadata);
    setShowCounterSignModal(false);
    setSelectedTask(null);
  };

  const toggleTrackerForm = (id: string) => {
    setShowTrackerInput(prev => ({ ...prev, [id]: !prev[id] }));
    setTrackerVal(prev => ({ ...prev, [id]: 1 }));
  };

  const handleSaveProgress = (task: DailyTask) => {
    const val = trackerVal[task.id] || 1;
    onIncrementTracker(task.id, val);
    setShowTrackerInput(prev => ({ ...prev, [task.id]: false }));
  };

  const handleConfirmBlocked = (task: DailyTask) => {
    const reason = (blockReasonInput[task.id] || '').trim();
    if (!reason) {
      toast.error('Add a short reason so the manager knows what to unblock.');
      return;
    }
    onUpdateTask(task.id, 'Blocked', undefined, { blockedReason: reason });
    setShowBlockForm(prev => ({ ...prev, [task.id]: false }));
    setBlockReasonInput(prev => ({ ...prev, [task.id]: '' }));
  };

  const handleUnblock = (task: DailyTask) => {
    onUpdateTask(task.id, 'In Progress', undefined, { blockedReason: undefined });
  };

  return (
    <div className="flex flex-col gap-6">
      
      {/* Dynamic Floor Workspace Header */}
      <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-indigo-50/40 to-transparent opacity-40 pointer-events-none"></div>
        <div>
          <span className="text-[10px] text-gray-400 font-extrabold font-mono select-none">{taxonomy.appName} Operations Console</span>
          <h2 className="text-slate-900 text-xl font-black font-sans flex items-center gap-1.5 leading-tight select-none">
            {taxonomy.workspaceSingular} Action Board & Checklist
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Log metrics, inspect security seals, track continuous visit targets, and sign off compliant duties.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setShowGuide(!showGuide)}
            className={`px-3 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all outline-none cursor-pointer border ${
              showGuide 
                ? 'bg-[#7A1230] text-white border-[#7A1230] shadow-md' 
                : 'bg-amber-50 text-amber-800 border-amber-250 hover:bg-amber-100'
            }`}
          >
            <Info className="w-4 h-4 shrink-0" />
            <span>{showGuide ? 'Close Guide' : 'How To Use Board'}</span>
            <span className="bg-amber-500 text-white font-mono text-[10px] font-black tracking-widest uppercase px-1 rounded">Tour</span>
          </button>

          <div className="bg-indigo-50/80 border border-indigo-150 px-4 py-2.5 rounded-xl text-xs text-slate-700 font-mono flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Verified Session: <strong className="text-slate-900">{activeStaff?.name || 'Staff Member'}</strong></span>
          </div>
        </div>
      </div>

      {/* Interactive Quick Guide Center */}
      <AnimatePresence>
        {showGuide && (
          <motion.div
            initial={{ opacity: 0, y: -15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="bg-indigo-950 text-white rounded-3xl p-6 border border-indigo-900 shadow-xl relative overflow-hidden flex flex-col gap-4"
          >
            <div className="w-full flex justify-between items-center border-b border-indigo-900/60 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-400 animate-pulse" />
                <h4 className="font-extrabold text-sm tracking-tight">Interactive User Onboarding & Operations Guide</h4>
              </div>
              <button 
                type="button" 
                onClick={() => setShowGuide(false)} 
                className="text-white/60 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-indigo-200 leading-relaxed max-w-3xl">
              Welcome to your digital work dashboard. This guide explains how to complete your assigned checklists and metrics efficiently. This system has been tailored to accommodate both <strong>clinical</strong> and <strong>non-clinical/general operations</strong> departments dynamically.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-2">
              <div className="bg-indigo-900/40 border border-indigo-800/50 rounded-2xl p-4 flex flex-col gap-2">
                <div className="flex items-center gap-2 text-amber-400 font-black">
                  <span className="font-mono text-xs">01</span>
                  <span className="text-[11px]">Log Metrics</span>
                </div>
                <h5 className="text-xs font-bold text-white leading-snug">Environmental Conditions</h5>
                <p className="text-[11px] text-indigo-200/80 leading-relaxed">
                  Tasks involving storage (like cold chains, IT server rooms, or kitchen larders) prompt room or freezer temperatures. Entering values beyond limits will ask for corrective measures before submitting!
                </p>
              </div>

              <div className="bg-indigo-900/40 border border-indigo-800/50 rounded-2xl p-4 flex flex-col gap-2">
                <div className="flex items-center gap-2 text-emerald-400 font-black">
                  <span className="font-mono text-xs">02</span>
                  <span className="text-[11px]">Security Tagging</span>
                </div>
                <h5 className="text-xs font-bold text-white leading-snug">Asset & Tag Validation</h5>
                <p className="text-[11px] text-indigo-200/80 leading-relaxed">
                  For physical asset safety check-outs (such as equipment carts, server racks, or document vaults), enter active plastic security tie seal or asset tag codes to prove strict custody.
                </p>
              </div>

              <div className="bg-indigo-900/40 border border-indigo-800/50 rounded-2xl p-4 flex flex-col gap-2">
                <div className="flex items-center gap-2 text-sky-400 font-black">
                  <span className="font-mono text-xs">03</span>
                  <span className="text-[11px]">Dual Witnessing</span>
                </div>
                <h5 className="text-xs font-bold text-white leading-snug">Supervisor Co-Sign</h5>
                <p className="text-[11px] text-indigo-200/80 leading-relaxed">
                  High-accountability tasks (e.g. inventory audit checks or controlled registers) require select supervisor co-signatures. The picker lets you select any duty partner as a dual witness.
                </p>
              </div>

              <div className="bg-indigo-900/40 border border-indigo-800/50 rounded-2xl p-4 flex flex-col gap-2">
                <div className="flex items-center gap-2 text-violet-400 font-black">
                  <span className="font-mono text-xs">04</span>
                  <span className="text-[11px]">Role Adapting</span>
                </div>
                <h5 className="text-xs font-bold text-white leading-snug">Flexible Departments</h5>
                <p className="text-[11px] text-indigo-200/80 leading-relaxed">
                  The dashboard automatically filters tasks by active department (Clinical, IT, Maintenance, Administrative). You see only what is relevant to your shift rotation, simplifying the overall interface.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between text-[10px] text-indigo-300 border-t border-indigo-900/60 pt-3 mt-1">
              <span>Need assistant support? Contact your lead manager directly in the system.</span>
              <button 
                type="button" 
                onClick={() => setShowGuide(false)} 
                className="hover:underline font-bold text-indigo-200 cursor-pointer"
              >
                Okay, I understand!
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filters: area + urgency, grouped in one card */}
      <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-[10px] text-gray-400 font-extrabold font-mono select-none flex items-center gap-1">
            <Layers className="w-3.5 h-3.5 text-indigo-900" /> Filter by area
          </span>
          <div className="flex items-center bg-slate-100 rounded-xl p-0.5 text-[11px] font-bold">
            <button
              onClick={() => setDateScope('today')}
              className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${dateScope === 'today' ? 'bg-white text-indigo-900 shadow-sm' : 'text-slate-500'}`}
            >
              Today
            </button>
            <button
              onClick={() => setDateScope('all')}
              className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${dateScope === 'all' ? 'bg-white text-indigo-900 shadow-sm' : 'text-slate-500'}`}
            >
              Whole cycle
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'ALL', label: 'All Tasks' },
            ...taskCategories.map(c => ({ id: c, label: c })),
          ].map(tab => {
            const isActive = activeCategoryTab === tab.id;
            const count = tab.id === 'ALL' ? pendingTasks.length : pendingTasks.filter(t => isTaskInCategory(t, tab.id)).length;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveCategoryTab(tab.id)}
                className={`flex items-center gap-2 py-2 px-3.5 rounded-xl text-xs font-black border transition-all cursor-pointer ${
                  isActive ? 'bg-indigo-950 border-indigo-950 text-white shadow-sm' : 'hover:bg-slate-100 text-slate-700 bg-slate-50 border-slate-200'
                }`}
              >
                <Tag className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                  isActive ? 'bg-white/25 text-white' : 'bg-slate-200 text-slate-700'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {focusPersonName ? (
          <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100">
            <span className="text-xs font-bold text-slate-700">
              👁️ Viewing <strong className="text-indigo-900">{focusPersonName}</strong>'s tasks
            </span>
            <button
              type="button"
              onClick={() => setFocusPersonName(null)}
              className="text-[11px] font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer"
            >
              <X className="w-3 h-3" /> Clear, show tabs
            </button>
          </div>
        ) : (
        <div className="flex flex-col gap-1.5 pt-3 border-t border-slate-100 select-none">
        <span className="text-[10px] text-slate-400 font-bold">👤 Assigned to Me = just your tasks · the rest = the whole team's</span>
        <div className="flex flex-wrap items-stretch gap-1">
        <button
          onClick={() => setActiveUrgencyTab('MY_TASKS')}
          className={`flex-1 min-w-[100px] text-center py-2.5 px-3 rounded-xl text-xs font-black transition-all cursor-pointer ${
            activeUrgencyTab === 'MY_TASKS'
              ? 'bg-indigo-950 text-white shadow-md'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          👤 Assigned to Me ({pendingTasks.filter(t => t.staffName === activeStaff?.name && isTaskInCategory(t, activeCategoryTab)).length})
        </button>

        <div className="w-px bg-slate-200 my-1 hidden sm:block" />

        <div className="flex flex-1 flex-wrap gap-1">
        <button
          onClick={() => setActiveUrgencyTab('CRITICAL')}
          className={`flex-1 min-w-[100px] text-center py-2.5 px-3 rounded-xl text-xs font-black transition-all cursor-pointer ${
            activeUrgencyTab === 'CRITICAL'
              ? 'bg-rose-600 text-white shadow-md'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          🚨 Urgent Audits ({pendingTasks.filter(t => (t.priority === 'Critical' || t.priority === 'High') && isTaskInCategory(t, activeCategoryTab)).length})
        </button>

        <button
          onClick={() => setActiveUrgencyTab('STANDARD')}
          className={`flex-1 min-w-[100px] text-center py-2.5 px-3 rounded-xl text-xs font-black transition-all cursor-pointer ${
            activeUrgencyTab === 'STANDARD'
              ? 'bg-amber-500 text-slate-950 shadow-md'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          ⚡ Standard Duty ({pendingTasks.filter(t => t.priority === 'Standard' && isTaskInCategory(t, activeCategoryTab)).length})
        </button>

        <button
          onClick={() => setActiveUrgencyTab('ROUTINE')}
          className={`flex-1 min-w-[100px] text-center py-2.5 px-3 rounded-xl text-xs font-black transition-all cursor-pointer ${
            activeUrgencyTab === 'ROUTINE'
              ? 'bg-slate-800 text-white shadow-md'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          ⚙️ Routine Actions ({pendingTasks.filter(t => t.priority === 'Routine' && isTaskInCategory(t, activeCategoryTab)).length})
        </button>

        <button
          onClick={() => setActiveUrgencyTab('OVERDUE')}
          className={`flex-1 min-w-[100px] text-center py-2.5 px-3 rounded-xl text-xs font-black transition-all cursor-pointer ${
            activeUrgencyTab === 'OVERDUE'
              ? 'bg-rose-700 text-white shadow-md'
              : overdueTasks.length > 0
              ? 'text-rose-700 hover:bg-rose-50'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          ⏰ Overdue ({overdueTasks.filter(t => isTaskInCategory(t, activeCategoryTab)).length})
        </button>

        <button
          onClick={() => setActiveUrgencyTab('BLOCKED')}
          className={`flex-1 min-w-[100px] text-center py-2.5 px-3 rounded-xl text-xs font-black transition-all cursor-pointer ${
            activeUrgencyTab === 'BLOCKED'
              ? 'bg-amber-600 text-white shadow-md'
              : blockedTasks.length > 0
              ? 'text-amber-700 hover:bg-amber-50'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          🚧 Blocked ({blockedTasks.filter(t => isTaskInCategory(t, activeCategoryTab)).length})
        </button>
        </div>
        </div>
        </div>
        )}
      </div>

      {/* Main Task List */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-md p-6">
        
        {currentTasks.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-400 mb-4 text-xl">
              ✨
            </div>
            <h3 className="text-sm font-bold text-slate-800">All caught up</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto leading-relaxed">
              No tasks here right now. Great job! Try another tab above, or check completed tasks below.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {currentTasks.map(task => {
              const hasTracker = task.trackerTarget !== undefined;
              const hasRichLog = task.taskName.toLowerCase().includes('temperature') || task.taskName.toLowerCase().includes('trolley') || task.taskName.toLowerCase().includes('dda') || task.taskName.toLowerCase().includes('controlled') || task.taskName.toLowerCase().includes('stock count');
              const isMine = task.staffName === activeStaff?.name;
              
              return (
                <div key={task.id} className="py-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition-all">
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-mono font-black border px-2 py-0.5 rounded-full ${
                        task.priority === 'Critical' || task.priority === 'High'
                          ? 'bg-rose-50 border-rose-200 text-rose-700'
                          : task.priority === 'Standard'
                          ? 'bg-amber-50 border-amber-200 text-amber-700'
                          : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}>
                        {task.priority} Priority
                      </span>
                      {task.date < todayStr && task.status !== 'Done' && (
                        <span className="text-[10px] font-mono font-black border px-2 py-0.5 rounded-full bg-rose-600 border-rose-700 text-white">
                          ⏰ {daysOverdue(task)} day{daysOverdue(task) === 1 ? '' : 's'} overdue
                        </span>
                      )}
                      {task.status === 'In Progress' && (
                        <span className="text-[10px] font-mono font-black border px-2 py-0.5 rounded-full bg-sky-50 border-sky-200 text-sky-700">
                          🔵 In progress
                        </span>
                      )}
                      {task.status === 'Blocked' && (
                        <span className="text-[10px] font-mono font-black border px-2 py-0.5 rounded-full bg-amber-100 border-amber-300 text-amber-800">
                          🚧 Blocked
                        </span>
                      )}
                      <span className="text-[11px] bg-slate-100 text-slate-500 font-bold px-2 py-0.5 rounded-md uppercase tracking-tight">
                        Shift {task.shiftCode} · {task.category}
                      </span>
                      {task.compliance && (
                        <span className="text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full font-black flex items-center gap-1 animate-pulse">
                          <ShieldCheck className="w-2.5 h-2.5" /> Dual Signature
                        </span>
                      )}
                    </div>

                    <h3 className="text-sm font-black text-slate-900 leading-snug mt-2 flex items-center gap-1.5 flex-wrap">
                      {task.taskName}
                    </h3>
                    
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed max-w-xl">
                      Owner: <strong className="text-slate-800">{task.staffName}</strong> · Standard Procedure requires double audits mapped before closeout.
                    </p>

                    {task.status === 'Blocked' && task.blockedReason && (
                      <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mt-2 max-w-xl leading-relaxed">
                        🚧 <strong>Blocked:</strong> {task.blockedReason}
                      </p>
                    )}

                    {/* Progress slider bar if a target is active */}
                    {hasTracker && (
                      <div className="mt-3.5 max-w-md bg-slate-50 p-3 rounded-xl border border-slate-100">
                        <div className="flex justify-between text-[10px] font-mono font-bold text-slate-600 mb-1.5">
                          <span>PROGRESS VALUE CODES</span>
                          <span>{task.trackerValue || 0} / {task.trackerTarget} Checked</span>
                        </div>
                        <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                          <div 
                            className="bg-indigo-600 h-full rounded-full transition-all duration-300"
                            style={{ width: `${Math.min(((task.trackerValue || 0) / (task.trackerTarget || 1)) * 100, 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-3 shrink-0 self-end md:self-auto">
                    {hasTracker && (
                      <div className="relative">
                        {showTrackerInput[task.id] ? (
                          <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
                            <input
                              type="number"
                              min="1"
                              max="10"
                              value={trackerVal[task.id] || 1}
                              onChange={(e) => setTrackerVal({ ...trackerVal, [task.id]: parseInt(e.target.value) || 1 })}
                              className="w-12 text-xs font-mono font-black text-center bg-white border border-slate-200 rounded-lg p-1"
                            />
                            <button
                              onClick={() => handleSaveProgress(task)}
                              className="p-1 px-2.5 bg-indigo-650 hover:bg-indigo-600 text-white font-bold text-xs rounded-lg cursor-pointer"
                            >
                              Add
                            </button>
                            <button
                              onClick={() => toggleTrackerForm(task.id)}
                              className="p-1 text-slate-400 hover:text-slate-600 text-xs"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => toggleTrackerForm(task.id)}
                            className="py-2 px-3.5 bg-slate-50 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-black rounded-xl border border-indigo-150 transition-colors cursor-pointer text-xs"
                          >
                            + Increment Logs
                          </button>
                        )}
                      </div>
                    )}

                    {showBlockForm[task.id] ? (
                      <div className="flex items-center gap-2 bg-amber-50 p-1.5 rounded-xl border border-amber-200 animate-in fade-in zoom-in-95 duration-150">
                        <input
                          type="text"
                          autoFocus
                          value={blockReasonInput[task.id] || ''}
                          onChange={(e) => setBlockReasonInput(prev => ({ ...prev, [task.id]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleConfirmBlocked(task); } }}
                          placeholder="What's blocking this?"
                          className="text-xs font-semibold bg-white border border-amber-200 rounded-lg p-1.5 w-48 outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleConfirmBlocked(task)}
                          className="p-1 px-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-lg cursor-pointer"
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowBlockForm(prev => ({ ...prev, [task.id]: false }))}
                          className="p-1 text-slate-400 hover:text-slate-600 text-xs"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <>
                        {task.status === 'Pending' && (
                          <button
                            type="button"
                            onClick={() => onUpdateTask(task.id, 'In Progress')}
                            className="py-2.5 px-4 bg-sky-50 hover:bg-sky-100 text-sky-700 text-xs font-black rounded-xl border border-sky-150 transition-colors cursor-pointer uppercase tracking-tight"
                          >
                            ▶ Start working
                          </button>
                        )}
                        {task.status === 'In Progress' && (
                          <button
                            type="button"
                            onClick={() => onUpdateTask(task.id, 'Pending')}
                            className="py-2.5 px-4 bg-white hover:bg-slate-50 text-slate-500 text-xs font-bold rounded-xl border border-slate-200 transition-colors cursor-pointer"
                            title="Move back to pending"
                          >
                            ↺ Not started yet
                          </button>
                        )}
                        {(task.status === 'Pending' || task.status === 'In Progress') && (
                          <button
                            type="button"
                            onClick={() => setShowBlockForm(prev => ({ ...prev, [task.id]: true }))}
                            className="py-2.5 px-4 bg-white hover:bg-amber-50 text-amber-700 text-xs font-black rounded-xl border border-amber-200 transition-colors cursor-pointer"
                          >
                            🚧 Blocked
                          </button>
                        )}
                        {task.status === 'Blocked' && (
                          <button
                            type="button"
                            onClick={() => handleUnblock(task)}
                            className="py-2.5 px-4 bg-amber-600 hover:bg-amber-700 text-white text-xs font-black rounded-xl border border-amber-700 transition-colors cursor-pointer uppercase tracking-tight"
                          >
                            ↺ Unblock
                          </button>
                        )}
                      </>
                    )}

                    <label className="flex items-center gap-2.5 cursor-pointer bg-slate-50 hover:bg-indigo-50/40 p-2.5 px-4 rounded-xl border border-slate-150/60 shadow-3xs transition-all select-none group">
                      <input
                        type="checkbox"
                        checked={task.status === 'Done'}
                        onChange={(e) => handleCheckboxChange(task, e.target.checked)}
                        className="w-5 h-5 rounded border-slate-300 text-indigo-650 focus:ring-0 accent-indigo-600 cursor-pointer"
                      />
                      <span className="text-xs font-black text-slate-700 group-hover:text-indigo-950 uppercase tracking-tight">Certify Done</span>
                    </label>
                  </div>

                </div>
              );
            })}
          </div>
        )}

      </div>

      {/* Accordion Historical Logs folder */}
      <div className="bg-slate-900 text-white rounded-3xl border border-slate-800 shadow-md">
        
        <button 
          onClick={() => setShowCompletedFolder(!showCompletedFolder)}
          className="w-full text-left p-5 flex justify-between items-center hover:bg-slate-950/40 rounded-3xl transition-colors cursor-pointer select-none"
        >
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-xl">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-sans font-bold text-xs text-[#009EE2]">Completed tasks</h3>
              <p className="text-[10px] text-slate-400 mt-0.5">{completedTasks.length} done this cycle</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 px-2 py-0.5 rounded-md font-bold">
              History
            </span>
            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showCompletedFolder ? 'rotate-180' : ''}`} />
          </div>
        </button>

        {showCompletedFolder && (
          <div className="border-t border-slate-800 p-3.5 md:p-5">
            {completedTasks.length === 0 ? (
              <p className="text-center py-8 text-xs text-slate-500 italic">No historical compliance records found for this active cycle dates window.</p>
            ) : (
              <div className="bg-black/25 rounded-2xl border border-slate-800 divide-y divide-slate-800 overflow-hidden">
                {completedTasks.map(task => {
                  const lowerTask = task.taskName.toLowerCase();
                  const isTemp = lowerTask.includes('temperature') || lowerTask.includes('fridge');
                  const isSeal = lowerTask.includes('trolley') || lowerTask.includes('seal') || lowerTask.includes('locker');

                  return (
                    <div 
                      key={task.id} 
                      id={`completed-task-card-${task.id}`}
                      onClick={() => setHistoryDrawerTask(task)}
                      className="p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[#090d16]/40 hover:bg-indigo-500/5 cursor-pointer transition-all border-l-2 border-l-transparent hover:border-l-indigo-500"
                    >
                      <div className="flex-1 min-w-0 pr-2">
                        <h4 className="text-sm font-bold text-slate-400 line-through leading-snug">
                          {task.taskName}
                        </h4>
                        <p className="text-[10px] text-slate-500 mt-1 font-mono">
                          COMPLIANCE BY: <span className="font-black text-slate-300 uppercase">{task.staffName}</span> 
                          {task.counterSign && ` · WITNESS CO-SIGN: ${task.counterSign}`}
                        </p>

                        <div className="mt-2 text-[11px] flex flex-wrap gap-2 font-mono select-all" onClick={(e) => e.stopPropagation()}>
                          {isTemp && task.fridgeTemp !== undefined && (
                            <span className={`px-2 py-0.5 rounded-lg border font-bold flex items-center gap-1 ${
                              task.fridgeTemp < 2.0 || task.fridgeTemp > 8.0 
                                ? 'bg-red-950/50 text-red-400 border-red-900/40' 
                                : 'bg-emerald-950/50 text-emerald-400 border-emerald-900/40'
                            }`}>
                              <Thermometer className="w-3 h-3 text-current" />
                              STORAGE TEMP: <strong>{task.fridgeTemp}°C</strong> (Room: {task.roomTemp}°C)
                            </span>
                          )}

                          {isTemp && task.correctiveAction && (
                            <div className="w-full bg-red-950/20 text-red-300 p-2 border border-red-900/50 rounded-lg text-[11px] mt-1">
                              ⚠️ <strong>Corrective Response Taken:</strong> "{task.correctiveAction}"
                            </div>
                          )}

                          {isSeal && task.sealNumber && (
                            <span className="px-2 py-0.5 rounded-lg border border-slate-800 bg-slate-900/50 text-slate-300 font-bold flex items-center gap-1">
                              <Tag className="w-3 h-3 text-slate-500" />
                              SECURITY LOCK/TAG: <strong>{task.sealNumber}</strong>
                            </span>
                          )}

                          {task.clinicalComment && (
                            <span className="px-2 py-0.5 rounded-lg border border-sky-900 bg-sky-950/50 text-sky-300 font-semibold flex items-center gap-1">
                              <FileCheck className="w-3.5 h-3.5 text-sky-500" />
                              AUDIT REMARK: "{task.clinicalComment}"
                            </span>
                          )}

                          {/* Dynamic custom fields display */}
                          {task.customFieldsData && Object.entries(task.customFieldsData).map(([fid, val]) => {
                            if (['fridgeTemp', 'roomTemp', 'sealNumber', 'clinicalComment'].includes(fid)) return null;
                            const fdef = task.customFields?.find(f => f.id === fid);
                            const label = fdef ? fdef.label : fid;
                            return (
                              <span key={fid} className="px-2 py-0.5 rounded-lg border border-violet-900 bg-violet-950/50 text-violet-300 font-bold flex items-center gap-1">
                                {label}: <strong>{String(val)}</strong>
                              </span>
                            );
                          })}

                          {task.customFieldBreachActions && Object.entries(task.customFieldBreachActions).map(([fid, val]) => {
                            if (fid === 'fridgeTemp') return null; // already rendered via legacy
                            if (!val) return null;
                            const fdef = task.customFields?.find(f => f.id === fid);
                            const label = fdef ? fdef.label : fid;
                            return (
                              <div key={fid} className="w-full bg-red-950/20 text-red-300 p-2 border border-red-900/50 rounded-lg text-[11px] mt-1">
                                ⚠️ <strong>Action for {label} Deviation:</strong> "{String(val)}"
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      
                      <span className="bg-emerald-500/10 text-emerald-400 text-[11px] px-2.5 py-1 rounded-full font-black border border-emerald-500/20 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <Check className="w-3 h-3" strokeWidth={3} /> Certified Compliant
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Compliance inputs modal */}
      {showCounterSignModal && selectedTask && (
        <div className="fixed inset-0 bg-slate-950/65 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <form 
            onSubmit={handleCounterSignSubmit}
            className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-gray-150 relative"
          >
            <h3 className="font-sans font-black text-sm text-slate-800 flex items-center gap-1.5 border-b border-slate-100 pb-3 mb-4">
              <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0" />
              SOP Compliance Parameters Check
            </h3>
            
            <p className="text-xs text-slate-500 leading-relaxed mb-4">
              Specify active verification records to log compliance parameters for <strong className="text-indigo-950 underline">{selectedTask.taskName}</strong>.
            </p>

            <div className="flex flex-col gap-4 mb-6">
              
              {/* Dynamic Task fields rendering */}
              {getResolvedTaskFields(selectedTask).map(field => {
                const val = customFieldsData[field.id] !== undefined ? customFieldsData[field.id] : '';
                
                const isBreached = field.type === 'number' && val !== '' && (
                  (field.minValue !== undefined && parseFloat(String(val)) < field.minValue) ||
                  (field.maxValue !== undefined && parseFloat(String(val)) > field.maxValue)
                );

                return (
                  <div key={field.id} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col gap-2">
                    <label className="text-[10px] font-black text-indigo-950 flex items-center gap-1 uppercase font-mono">
                      {field.label} {field.required && <span className="text-rose-500">*</span>}
                    </label>
                    
                    {field.type === 'text' && (
                      <input
                        type="text"
                        placeholder={field.placeholder ?? "Enter text..."}
                        value={val}
                        onChange={(e) => setCustomFieldsData(prev => ({ ...prev, [field.id]: e.target.value }))}
                        className="w-full text-xs font-semibold bg-white border border-slate-200 rounded-xl p-2.5 mt-1 focus:border-indigo-650 outline-none text-slate-800"
                        required={field.required}
                      />
                    )}

                    {field.type === 'number' && (
                      <div>
                        <input
                          type="number"
                          step="0.1"
                          placeholder={field.placeholder ?? "0.0"}
                          value={val}
                          onChange={(e) => setCustomFieldsData(prev => ({ ...prev, [field.id]: e.target.value }))}
                          className="w-full text-sm font-mono font-bold bg-white border border-slate-200 rounded-xl p-2.5 mt-1 outline-none text-center focus:border-indigo-650 text-slate-800"
                          required={field.required}
                        />
                        {((field.minValue !== undefined) || (field.maxValue !== undefined)) && (
                          <span className="text-[10px] text-slate-400 block mt-1 font-mono text-center">
                            Bounds: {field.minValue !== undefined ? `${field.minValue}°C Min` : ''} 
                            {field.minValue !== undefined && field.maxValue !== undefined ? ' – ' : ''}
                            {field.maxValue !== undefined ? `${field.maxValue}°C Max` : ''}
                          </span>
                        )}
                      </div>
                    )}

                    {field.type === 'checkbox' && (
                      <label className="flex items-center gap-2 mt-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!val}
                          onChange={(e) => setCustomFieldsData(prev => ({ ...prev, [field.id]: e.target.checked }))}
                          className="w-4.5 h-4.5 accent-indigo-650 border-gray-300 rounded cursor-pointer"
                        />
                        <span className="text-xs font-semibold text-slate-600">Reconciled / Completed</span>
                      </label>
                    )}

                    {field.type === 'select' && (
                      <select
                        value={val}
                        onChange={(e) => setCustomFieldsData(prev => ({ ...prev, [field.id]: e.target.value }))}
                        className="w-full text-xs font-semibold bg-white border border-slate-200 rounded-xl p-3 mt-1 focus:border-indigo-650 outline-none text-slate-850"
                        required={field.required}
                      >
                        <option value="">-- Choose Option --</option>
                        {(field.selectOptions || []).map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    )}

                    {/* Dynamic compliance threshold breach action feedback */}
                    {isBreached && field.breachThresholdAction && (
                      <div className="border border-red-200 bg-red-50 text-red-900 p-3 rounded-xl mt-1.5 flex flex-col gap-1">
                        <span className="text-[11px] font-black uppercase font-mono tracking-wider flex items-center gap-1 text-red-700">
                          <AlertCircle className="w-3.5 h-3.5" /> Compliance Threshold Breach detected!
                        </span>
                        <p className="text-[10px] leading-relaxed text-red-800 font-semibold">{field.breachThresholdAction}</p>
                        <label className="text-[11px] font-bold text-slate-500 uppercase font-mono mt-1 block">Specify Corrective Action Details:</label>
                        <textarea
                          value={customFieldBreachActions[field.id] ?? ''}
                          onChange={(e) => setCustomFieldBreachActions(prev => ({ ...prev, [field.id]: e.target.value }))}
                          rows={2}
                          placeholder="Please document deviation countermeasures taken..."
                          className="w-full text-xs font-semibold bg-white border border-slate-200 rounded-lg p-2 mt-1 focus:border-red-500 outline-none leading-relaxed text-slate-800"
                          required
                        />
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Witness chooser */}
              {selectedTask.compliance && (
                <div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase font-mono block">Co-signing Witness / Supervisor Picker</label>
                  <select
                    value={supervisorName}
                    onChange={(e) => setSupervisorName(e.target.value)}
                    className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl p-3 mt-1.5 focus:border-[#009EE2] outline-none"
                    required
                  >
                    <option value="">-- Choose Co-signer --</option>
                    {staffList.filter(s => s.name !== activeStaff?.name).map(s => (
                      <option key={s.id} value={s.name}>{s.name} ({s.role})</option>
                    ))}
                  </select>
                </div>
              )}

            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowCounterSignModal(false);
                  setSelectedTask(null);
                }}
                className="flex-1 py-3 bg-slate-150 hover:bg-slate-200 text-slate-600 font-bold text-xs rounded-xl transition-colors cursor-pointer text-center"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-3 bg-indigo-650 hover:bg-indigo-600 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer"
              >
                Sign Off Duty
              </button>
            </div>
            
          </form>
        </div>
      )}

      {/* Task Drawer details */}
      {historyDrawerTask && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-end z-50 animate-[fadeIn_0.15s_ease-out]">
          <div className="bg-white h-full max-w-md w-full p-6 shadow-2xl flex flex-col justify-between border-l border-slate-100 animate-[slideLeft_0.2s_ease-out]">
            
            <div>
              <div className="flex justify-between items-start border-b border-slate-100 pb-3 mb-4">
                <div>
                  <span className="text-[11px] bg-indigo-50 text-indigo-900 font-extrabold uppercase font-mono tracking-wider px-2 py-0.5 rounded">
                    Audit Ledger
                  </span>
                  <h4 className="text-slate-800 text-base font-black mt-2 font-sans select-none">{historyDrawerTask.taskName}</h4>
                </div>
                <button 
                  onClick={() => setHistoryDrawerTask(null)}
                  className="p-1 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-lg text-xs font-bold font-mono cursor-pointer"
                >
                  ✕ Close
                </button>
              </div>

              <div className="space-y-4">
                
                <div className="bg-slate-50/70 p-4 rounded-2xl border border-slate-100 flex flex-col gap-1 font-mono text-[10.5px]">
                  <div className="flex justify-between">
                    <span className="text-slate-400">ASSIGNED OWNER:</span>
                    <strong className="text-slate-800">{historyDrawerTask.staffName}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">SHIFT WINDOW:</span>
                    <strong className="text-slate-800">Post {historyDrawerTask.shiftCode}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">CATEGORY TAB:</span>
                    <strong className="text-slate-800 uppercase">{historyDrawerTask.category}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">STATUS STATE:</span>
                    <strong className="text-emerald-700">COMPLIANT CERTIFIED</strong>
                  </div>
                  {historyDrawerTask.counterSign && (
                    <div className="flex justify-between">
                      <span className="text-slate-400 font-black">WITNESS VERIFIER:</span>
                      <strong className="text-indigo-900">{historyDrawerTask.counterSign}</strong>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wide block">Compliance Audit Tracks</span>
                  <div className="space-y-2 max-h-[240px] overflow-y-auto scrollbar-thin border border-slate-100 rounded-xl p-3 bg-slate-50/50">
                    {getTaskHistory(historyDrawerTask).map((h, hIdx) => (
                      <div key={h.id || hIdx} className="text-xs leading-relaxed text-slate-600 border-b border-slate-100/40 pb-2.5 last:border-b-0 last:pb-0">
                        <div className="flex justify-between text-[11px] font-mono mb-0.5">
                          <span className="text-indigo-650 font-black">{h.action}</span>
                          <span className="text-slate-500">{h.timestamp}</span>
                        </div>
                        <p className="font-medium text-slate-800 mt-1">{h.details}</p>
                        <span className="text-[11px] text-[#009EE2] font-semibold mt-0.5 block">Recorded Signature: {h.staffName}</span>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            </div>

            <button
              onClick={() => {
                setHistoryDrawerTask(null);
                window.print();
              }}
              className="w-full py-4 bg-indigo-950 hover:bg-slate-900 text-white font-bold text-xs rounded-2xl shadow-xl flex items-center justify-center gap-2 mt-4 cursor-pointer"
            >
              <Printer className="w-4 h-4" /> Export compliant sign-off PDF
            </button>

          </div>
        </div>
      )}

    </div>
  );
}
