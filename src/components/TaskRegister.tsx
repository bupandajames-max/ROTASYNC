import React, { useState } from 'react';
import { TaskMaster, StaffMember, DailyTask, TaskFieldDef, patternLabel } from '../types';

type CategorySuggestion = {
  name: string;
  pattern: string;
  priority: string;
  frequency: string;
  notes: string;
  requiredSkills?: string[];
  checked: boolean;
};
import { Database, Plus, Trash2, Check, Sparkles, BookOpen, Star, AlertCircle, BarChart, Calendar, Zap, Play, CheckCircle } from 'lucide-react';

interface TaskRegisterProps {
  tasks: TaskMaster[];
  staffList: StaffMember[];
  onAddTask: (task: TaskMaster) => void;
  onDeleteTask: (id: string) => void;
  onUpdateTaskAssignee: (id: string, name: string) => void;
  dailyTasksLog: DailyTask[]; // to query completion metrics
  myExtraHoursLogCount: { [name: string]: number }; // total hours in active period for staff
  onUpdateTasksBulk: (updatedTasks: TaskMaster[]) => void;
  onPreGenerate7DaysTasks?: () => { success: boolean; message: string; generatedDates: string[]; skippedDates: string[] };
  taskCategories: string[];
}

export default function TaskRegister({
  tasks,
  staffList,
  onAddTask,
  onDeleteTask,
  onUpdateTaskAssignee,
  dailyTasksLog,
  myExtraHoursLogCount,
  onUpdateTasksBulk,
  onPreGenerate7DaysTasks,
  taskCategories,
}: TaskRegisterProps) {
  const [showAddModal, setShowAddTaskModal] = useState(false);
  const [taskName, setTaskName] = useState('');
  const [category, setCategory] = useState<TaskMaster['category']>(taskCategories[0] || 'General');
  const [pattern, setPattern] = useState<TaskMaster['pattern']>('Shift-based');
  const [asgnVal, setAsgnVal] = useState('');
  const [priority, setPriority] = useState<TaskMaster['priority']>('Standard');
  const [freq, setFreq] = useState('Daily');
  const [compliance, setCompliance] = useState(false);
  const [notes, setNotes] = useState('');
  const [requiredSkillsInput, setRequiredSkillsInput] = useState('');

  // AI category-task suggestions
  const [catSuggesting, setCatSuggesting] = useState(false);
  const [catSuggestError, setCatSuggestError] = useState<string | null>(null);
  const [catSuggestions, setCatSuggestions] = useState<CategorySuggestion[]>([]);

  // Tracker target for Continuous trackers
  const [trackerTarget, setTrackerTarget] = useState<number>(0);

  // Dynamic customized checklist form schemas builder
  const [customFields, setCustomFields] = useState<TaskFieldDef[]>([]);

  // AI Suggestion State
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiTargetTask, setAiTargetTask] = useState<TaskMaster | null>(null);
  const [aiSuggestionReport, setAiSuggestionReport] = useState<{
    bestCandidate: string;
    details: { name: string; score: number; completedCount: number; currentCount: number; leavePenalty: number }[];
  } | null>(null);

  // Bulk Edit States
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkPriority, setBulkPriority] = useState<TaskMaster['priority'] | ''>('');
  const [bulkFrequency, setBulkFrequency] = useState<string>('');

  // Pre-scheduler utility state & feedback
  const [utilityFeedback, setUtilityFeedback] = useState<{
    show: boolean;
    success: boolean;
    message: string;
    generatedDates: string[];
    skippedDates: string[];
  } | null>(null);

  const handleTriggerPreGeneration = () => {
    if (onPreGenerate7DaysTasks) {
      const res = onPreGenerate7DaysTasks();
      setUtilityFeedback({
        show: true,
        success: res.success,
        message: res.message,
        generatedDates: res.generatedDates || [],
        skippedDates: res.skippedDates || [],
      });
    }
  };

  // Next 7 Days generation checking status mapping
  const today = new Date();
  const next7DaysInfo = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date();
    d.setDate(today.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    const dayLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
    const hasTasks = dailyTasksLog.some(t => t.date === dateStr);
    const dayTasksCount = dailyTasksLog.filter(t => t.date === dateStr).length;
    return { dateStr, dayLabel, hasTasks, count: dayTasksCount };
  });

  // Dashboard Stats calculations
  const totalTasks = tasks.length;
  const activeCount = tasks.filter(t => t.active).length;
  const inactiveCount = totalTasks - activeCount;

  const criticalCount = tasks.filter(t => t.priority === 'Critical').length;
  const highCount = tasks.filter(t => t.priority === 'High').length;
  const standardCount = tasks.filter(t => t.priority === 'Standard').length;
  const routineCount = tasks.filter(t => t.priority === 'Routine').length;

  const handleSelectRow = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === tasks.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(tasks.map(t => t.id));
    }
  };

  const handleApplyBulkChanges = () => {
    if (selectedIds.length === 0) return;
    if (!bulkPriority && !bulkFrequency) return;

    const updatedTasks = tasks.map(t => {
      if (selectedIds.includes(t.id)) {
        const updated = { ...t };
        if (bulkPriority) updated.priority = bulkPriority;
        if (bulkFrequency) {
          updated.frequency = bulkFrequency;
          if (bulkFrequency.includes('Continuous') && !updated.trackerTarget) {
            updated.trackerTarget = 10;
          }
        }
        return updated;
      }
      return t;
    });

    onUpdateTasksBulk(updatedTasks);
    setSelectedIds([]);
    setBulkPriority('');
    setBulkFrequency('');
  };

  const handleAddTaskSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskName) return;

    const parsedSkills = requiredSkillsInput.split(',').map(s => s.trim()).filter(Boolean);
    const newTask: TaskMaster = {
      id: `task-${Date.now()}`,
      name: taskName,
      category,
      pattern,
      assignedValue: asgnVal,
      requiredSkills: parsedSkills.length > 0 ? parsedSkills : undefined,
      priority,
      frequency: freq,
      compliance,
      active: true,
      notes,
      trackerTarget: trackerTarget > 0 ? trackerTarget : undefined,
      trackerValue: trackerTarget > 0 ? 0 : undefined,
      customFields: customFields.length > 0 ? customFields : undefined
    };

    onAddTask(newTask);
    setShowAddTaskModal(false);
    // Reset Form
    setTaskName('');
    setAsgnVal('');
    setNotes('');
    setRequiredSkillsInput('');
    setTrackerTarget(0);
    setCustomFields([]);
  };

  // Ask the AI for concrete tasks under the chosen category, in context.
  const handleSuggestCategoryTasks = async () => {
    if (!category) return;
    setCatSuggesting(true);
    setCatSuggestError(null);
    setCatSuggestions([]);
    try {
      // Retry a couple of times — the model occasionally returns a transient 503.
      let data: any = null;
      let lastErr = '';
      for (let attempt = 0; attempt < 3; attempt++) {
        const res = await fetch('/api/suggest-category-tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category, existingTaskNames: tasks.map(t => t.name) }),
        });
        if (res.ok) { data = await res.json(); break; }
        const err = await res.json().catch(() => ({}));
        lastErr = typeof err.error === 'string' ? err.error : JSON.stringify(err.error || `status ${res.status}`);
        if (attempt < 2) await new Promise(r => setTimeout(r, 1200));
      }
      if (!data) throw new Error(lastErr.includes('high demand') ? 'The AI is busy right now — please try again in a moment.' : lastErr || 'Could not reach the suggestion service.');
      if (Array.isArray(data.tasks)) {
        setCatSuggestions(data.tasks.map((t: any): CategorySuggestion => ({
          name: t.name || '',
          pattern: t.pattern || 'Auto',
          priority: t.priority || 'Standard',
          frequency: t.frequency || 'Daily',
          notes: t.notes || '',
          requiredSkills: Array.isArray(t.requiredSkills) ? t.requiredSkills : [],
          checked: true,
        })));
      }
    } catch (err: any) {
      setCatSuggestError(err.message || 'Failed to get suggestions.');
    } finally {
      setCatSuggesting(false);
    }
  };

  // Load a single suggestion into the form fields for editing before saving.
  const applySuggestionToForm = (sug: CategorySuggestion) => {
    setTaskName(sug.name);
    setPattern(sug.pattern as TaskMaster['pattern']);
    setPriority(sug.priority as TaskMaster['priority']);
    setFreq(sug.frequency);
    setNotes(sug.notes);
    setRequiredSkillsInput((sug.requiredSkills || []).join(', '));
  };

  // Bulk-create every selected suggestion under the current category.
  const handleAddSelectedSuggestions = () => {
    const selected = catSuggestions.filter(s => s.checked);
    if (selected.length === 0) return;
    const baseTs = Date.now();
    const newTasks: TaskMaster[] = selected.map((s, i) => ({
      id: `task-${baseTs}-${i}`,
      name: s.name,
      category,
      pattern: s.pattern as TaskMaster['pattern'],
      assignedValue: '',
      requiredSkills: s.requiredSkills && s.requiredSkills.length > 0 ? s.requiredSkills : undefined,
      priority: s.priority as TaskMaster['priority'],
      frequency: s.frequency,
      compliance: false,
      active: true,
      notes: s.notes,
    }));
    onUpdateTasksBulk([...tasks, ...newTasks]);
    setCatSuggestions([]);
    setShowAddTaskModal(false);
  };

  // Upgraded suggestFairAssignee algorithm
  const handleTriggerAiSuggest = (task: TaskMaster) => {
    setAiTargetTask(task);
    const cleanTargetName = task.name.replace(/\(.*?\)/gi, '').trim();

    // 1. Compile recent completion history count (past logs)
    const historyCounts: { [name: string]: number } = {};
    staffList.forEach(s => historyCounts[s.name] = 0);

    dailyTasksLog.forEach(log => {
      const cleanLoggedTask = log.taskName.replace(/\(.*?\)/gi, '').trim();
      if (cleanLoggedTask === cleanTargetName && log.status === 'Done') {
        if (historyCounts[log.staffName] !== undefined) {
          historyCounts[log.staffName]++;
        }
      }
    });

    // 2. Compile current workloads (active allocations in col F)
    const activeAllocations: { [name: string]: number } = {};
    staffList.forEach(s => activeAllocations[s.name] = 0);
    tasks.forEach(t => {
      if (t.managerAssignedName) {
        const names = t.managerAssignedName.split(',').map(n => n.trim());
        names.forEach(n => {
          if (activeAllocations[n] !== undefined) activeAllocations[n]++;
        });
      }
    });

    // 3. Score candidates mathematically (lowest score = fairest assignee)
    const candidatesDetails = staffList
      .filter(s => !s.isManager) // Exclude supervisor from pool
      .map(s => {
        const historyScore = (historyCounts[s.name] || 0) * 100;
        const workloadScore = (activeAllocations[s.name] || 0) * 50;
        const loggedHrs = myExtraHoursLogCount[s.name] || 168; // scheduled workloads hrs

        // Check if currently doing the task
        const isCurrentAssignee = task.managerAssignedName?.includes(s.name) ? 300 : 0;

        // Cumulative priority score
        const score = historyScore + workloadScore + loggedHrs + isCurrentAssignee;

        return {
          name: s.name,
          score,
          completedCount: historyCounts[s.name] || 0,
          currentCount: activeAllocations[s.name] || 0,
          leavePenalty: 0 // leave check
        };
      });

    candidatesDetails.sort((a, b) => a.score - b.score);
    const best = candidatesDetails[0]?.name || 'Nobody';

    setAiSuggestionReport({
      bestCandidate: best,
      details: candidatesDetails
    });
    setShowAiModal(true);
  };

  const handleApplyAiSuggestion = () => {
    if (!aiTargetTask || !aiSuggestionReport) return;
    onUpdateTaskAssignee(aiTargetTask.id, aiSuggestionReport.bestCandidate);
    setShowAiModal(false);
    setAiTargetTask(null);
    setAiSuggestionReport(null);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Upper info band */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="text-xs text-gray-500 font-bold uppercase tracking-wider">Directory Control</div>
          <h2 className="text-[#1f3864] text-lg font-bold font-sans flex items-center gap-1.5">
            <Database className="w-5 h-5 text-[#00aeff]" /> Task Master Directory
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Configure custom pharmacy tasks, boundaries, and AI suggest models
          </p>
        </div>

        <button
          onClick={() => setShowAddTaskModal(true)}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-[#1f3864] hover:bg-blue-900 text-white rounded-xl font-bold text-xs shadow-sm border border-blue-500 transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4 text-[#00aeff]" /> Add New Task Master
        </button>
      </div>

      {/* --- TASK AUTO-GENERATION & PRE-SCHEDULER SERVICE PANEL --- */}
      <div className="bg-gradient-to-br from-[#1f3864]/5 to-[#00aeff]/5 border border-[#1f3864]/10 rounded-3xl p-6 shadow-xs flex flex-col lg:flex-row items-stretch justify-between gap-6">
        <div className="flex-1 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] bg-[#1f3864]/10 text-[#1f3864] font-extrabold px-2 py-0.5 rounded-sm uppercase tracking-wider font-mono flex items-center gap-1">
                <Zap className="w-3 h-3 text-[#00aeff] animate-pulse" /> Autonomous Routing Active
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
            </div>
            
            <h3 className="text-[#1f3864] font-black text-sm uppercase tracking-wide mt-2.5 flex items-center gap-2">
              📅 7-Day Forward Task Pre-Generation Service
            </h3>
            
            <p className="text-xs text-gray-500 leading-relaxed mt-1.5 max-w-xl">
              Our background scheduler monitors upcoming calendar cycles and auto-generates tomorrow's daily board logs. To safeguard operations and preview the next <strong>7 days</strong> immediately, trigger the forward utility manually below.
            </p>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={handleTriggerPreGeneration}
              disabled={!onPreGenerate7DaysTasks}
              className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#1f3864] to-blue-900 border border-blue-500 hover:opacity-95 text-white rounded-xl font-bold text-xs shadow-md transition-all cursor-pointer disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5 fill-white text-[#00aeff]" /> Pre-Generate Next 7 Days Tasks
            </button>
            <div className="text-[11px] text-gray-400 font-bold font-mono">
              Status: <span className="text-emerald-600 font-extrabold">Active (Autonomous)</span>
            </div>
          </div>
        </div>

        {/* Calendar Day status nodes */}
        <div className="flex flex-col gap-2 justify-center bg-white p-4 rounded-2xl border border-gray-100 min-w-[280px]">
          <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider flex items-center gap-1">
            <Calendar className="w-3 h-3 text-[#1f3864]" /> Schedule Horizon Status (Next 7 Days)
          </span>
          <div className="grid grid-cols-7 gap-1.5 mt-1">
            {next7DaysInfo.map((day, idx) => (
              <div 
                key={day.dateStr}
                className={`p-2 rounded-xl border flex flex-col items-center justify-between text-center transition-all ${
                  day.hasTasks 
                    ? 'bg-emerald-50 border-emerald-100 text-emerald-950 shadow-2xs' 
                    : 'bg-amber-50/50 border-amber-100 text-amber-950'
                }`}
                title={`${day.dateStr}: ${day.count} tasks generated`}
              >
                <span className="text-[9px] font-black font-mono leading-none text-gray-400">{day.dayLabel.split(',')[0]}</span>
                <span className="text-[10px] font-black font-mono mt-0.5">{day.dayLabel.split(' ')[1] || day.dateStr.slice(-2)}</span>
                <span className="mt-1.5">
                  {day.hasTasks ? (
                    <span className="flex flex-col items-center">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-[8px] text-emerald-600 font-black font-mono mt-0.5">{day.count}</span>
                    </span>
                  ) : (
                    <span className="flex flex-col items-center">
                      <span className="w-3.5 h-3.5 rounded-full border border-amber-305 border-dashed bg-amber-100/30 block" />
                      <span className="text-[8px] text-amber-600 font-black font-mono mt-0.5">0</span>
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {utilityFeedback && utilityFeedback.show && (
        <div 
          className={`p-4 border rounded-2xl animate-[fadeIn_0.15s_ease-out] flex flex-col gap-1.5 text-xs ${
            utilityFeedback.success 
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900' 
              : 'bg-slate-50 border-slate-200 text-slate-800'
          }`}
        >
          <div className="flex items-center gap-1.5 font-bold">
            <span className="text-sm">{utilityFeedback.success ? '🌿 Success' : 'ℹ️ System Status'}</span>
            <span>{utilityFeedback.message}</span>
          </div>
          {utilityFeedback.success && utilityFeedback.generatedDates && utilityFeedback.generatedDates.length > 0 && (
            <div className="text-[11px] font-medium leading-relaxed mt-0.5">
              💡 <strong>Populated planning dates:</strong> {utilityFeedback.generatedDates.join(', ')}
            </div>
          )}
          {utilityFeedback.skippedDates && utilityFeedback.skippedDates.length > 0 && (
            <div className="text-[10px] text-gray-400 font-medium italic mt-0.5">
              Note: Skipped dates (either outside active cycle dates, or possess preloaded logs): {utilityFeedback.skippedDates.join(', ')}
            </div>
          )}
        </div>
      )}

      {/* --- TASK DIRECTORY SUMMARY DASHBOARD --- */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 select-none">
        {/* Active Tasks */}
        <div className="bg-gradient-to-br from-emerald-50 to-white px-3.5 py-3 rounded-2xl border border-emerald-100 shadow-xs flex flex-col justify-between transition-all hover:shadow-sm">
          <div className="flex items-center justify-between gap-1.5 text-emerald-800">
            <span className="text-[10px] font-black uppercase tracking-wider">Active</span>
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <div className="mt-2.5 flex items-baseline gap-1">
            <span className="text-2xl font-black text-emerald-950 tracking-tight">{activeCount}</span>
            <span className="text-[11px] text-emerald-600 font-bold">tasks</span>
          </div>
          <p className="text-[10px] text-emerald-500/80 font-bold mt-1">Live active templates</p>
        </div>

        {/* Inactive Tasks */}
        <div className="bg-gradient-to-br from-slate-50 to-white px-3.5 py-3 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between transition-all hover:shadow-sm">
          <div className="flex items-center justify-between gap-1.5 text-slate-500">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-600">Inactive</span>
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
          </div>
          <div className="mt-2.5 flex items-baseline gap-1">
            <span className="text-2xl font-black text-slate-850 tracking-tight">{inactiveCount}</span>
            <span className="text-[11px] text-slate-500 font-bold">tasks</span>
          </div>
          <p className="text-[10px] text-slate-400/85 font-semibold mt-1">Disabled temporarily</p>
        </div>

        {/* Critical Priority */}
        <div className="bg-gradient-to-br from-red-50 to-white px-3.5 py-3 rounded-2xl border border-red-100 shadow-xs flex flex-col justify-between transition-all hover:shadow-sm">
          <div className="flex items-center justify-between gap-1.5 text-red-800">
            <span className="text-[10px] font-black uppercase tracking-wider">Critical</span>
            <span className="text-[10px] bg-red-100 px-1.5 py-0.5 rounded-full font-black text-red-700">Level 4</span>
          </div>
          <div className="mt-2.5 flex items-baseline gap-1">
            <span className="text-2xl font-black text-red-950 tracking-tight">{criticalCount}</span>
            <span className="text-[11px] text-red-650 font-bold">tasks</span>
          </div>
          <p className="text-[10px] text-red-500/80 font-bold mt-1">Immediate duty response</p>
        </div>

        {/* High Priority */}
        <div className="bg-gradient-to-br from-orange-50 to-white px-3.5 py-3 rounded-2xl border border-orange-100 shadow-xs flex flex-col justify-between transition-all hover:shadow-sm">
          <div className="flex items-center justify-between gap-1.5 text-orange-850">
            <span className="text-[10px] font-black uppercase tracking-wider text-orange-800">High</span>
            <span className="text-[10px] bg-orange-100 px-1.5 py-0.5 rounded-full font-black text-orange-700">Level 3</span>
          </div>
          <div className="mt-2.5 flex items-baseline gap-1">
            <span className="text-2xl font-black text-orange-950 tracking-tight">{highCount}</span>
            <span className="text-[11px] text-orange-650 font-bold">tasks</span>
          </div>
          <p className="text-[10px] text-orange-600/85 font-semibold mt-1">SLA target compliance</p>
        </div>

        {/* Standard Priority */}
        <div className="bg-gradient-to-br from-blue-50 to-white px-3.5 py-3 rounded-2xl border border-blue-100 shadow-xs flex flex-col justify-between transition-all hover:shadow-sm">
          <div className="flex items-center justify-between gap-1.5 text-blue-850">
            <span className="text-[10px] font-black uppercase tracking-wider text-blue-800">Standard</span>
            <span className="text-[10px] bg-blue-100 px-1.5 py-0.5 rounded-full font-black text-blue-700">Level 2</span>
          </div>
          <div className="mt-2.5 flex items-baseline gap-1">
            <span className="text-2xl font-black text-blue-950 tracking-tight">{standardCount}</span>
            <span className="text-[11px] text-blue-650 font-bold">tasks</span>
          </div>
          <p className="text-[10px] text-blue-500/80 font-bold mt-1">Routine clinical tracking</p>
        </div>

        {/* Routine Priority */}
        <div className="bg-gradient-to-br from-slate-100/30 to-white px-3.5 py-3 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between transition-all hover:shadow-sm">
          <div className="flex items-center justify-between gap-1.5 text-slate-800">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-600">Routine</span>
            <span className="text-[10px] bg-slate-200 px-1.5 py-0.5 rounded-full font-black text-slate-600">Level 1</span>
          </div>
          <div className="mt-2.5 flex items-baseline gap-1">
            <span className="text-2xl font-black text-slate-900 tracking-tight">{routineCount}</span>
            <span className="text-[11px] text-slate-500 font-bold">tasks</span>
          </div>
          <p className="text-[10px] text-slate-500/80 font-bold mt-1">General housekeeping</p>
        </div>
      </div>

      {/* --- BULK ACTION BAR --- */}
      {selectedIds.length > 0 && (
        <div className="bg-gradient-to-r from-[#eef5fc] to-sky-50 border border-sky-100 p-4 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4 animate-fade-in shadow-sm">
          <div className="flex items-center gap-3">
            <div className="bg-[#1f3864] text-[#00aeff] text-[10px] font-black uppercase px-2.5 py-1.5 rounded-lg shrink-0 shadow-xs border border-blue-500/20">
              {selectedIds.length} SELECTED
            </div>
            <div>
              <p className="text-xs text-slate-800 font-extrabold">
                Configure Bulk Adjustments
              </p>
              <p className="text-[10px] text-slate-500 font-semibold">
                Change priority and/or frequency of selected tasks simultaneously.
              </p>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Priority:</span>
              <select
                value={bulkPriority}
                onChange={(e) => setBulkPriority(e.target.value as any)}
                className="text-xs font-semibold bg-white border border-gray-200 rounded-xl p-2 outline-none cursor-pointer focus:border-[#1f3864]"
              >
                <option value="">-- Keep Current --</option>
                <option value="Critical">Critical</option>
                <option value="High">High</option>
                <option value="Standard">Standard</option>
                <option value="Routine">Routine</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Frequency:</span>
              <select
                value={bulkFrequency}
                onChange={(e) => setBulkFrequency(e.target.value)}
                className="text-xs font-semibold bg-white border border-gray-200 rounded-xl p-2 outline-none cursor-pointer focus:border-[#1f3864]"
              >
                <option value="">-- Keep Current --</option>
                <option value="Daily">Daily</option>
                <option value="Weekly (Sunday)">Weekly (Sunday)</option>
                <option value="Monthly">Monthly</option>
                <option value="Monthly (Continuous)">Monthly (Continuous)</option>
                <option value="Last day of month">Last day of month</option>
              </select>
            </div>

            <button
              onClick={handleApplyBulkChanges}
              disabled={!bulkPriority && !bulkFrequency}
              className={`px-4.5 py-2 rounded-xl font-bold text-xs shadow-md transition-all flex items-center gap-1 ${
                bulkPriority || bulkFrequency
                  ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer hover:shadow-lg'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed border border-gray-300/40'
              }`}
            >
              <Check className="w-3.5 h-3.5" /> Apply changes
            </button>

            <button
              onClick={() => {
                setSelectedIds([]);
                setBulkPriority('');
                setBulkFrequency('');
              }}
              className="px-3.5 py-2 bg-white hover:bg-gray-150 text-gray-600 border border-gray-200 rounded-xl font-bold text-xs cursor-pointer transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Directory Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto relative">
          <table className="min-w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-gray-100 text-[#1f3864] uppercase font-mono tracking-tight text-[10px]">
                <th className="p-4 font-extrabold w-16 text-center select-none">
                  <div className="flex items-center justify-center gap-2">
                    <input
                      type="checkbox"
                      checked={tasks.length > 0 && selectedIds.length === tasks.length}
                      onChange={handleSelectAll}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                    />
                    <span>#</span>
                  </div>
                </th>
                <th className="p-4 font-extrabold w-48">Task Name</th>
                <th className="p-4 font-extrabold w-36">Category</th>
                <th className="p-4 font-extrabold w-24 text-center">Priority</th>
                <th className="p-4 font-extrabold w-32 text-center">Pattern</th>
                <th className="p-4 font-extrabold w-44 text-center">⭐ Assigned Representative</th>
                <th className="p-4 font-extrabold w-16 text-center">AI suggestion</th>
                <th className="p-4 font-extrabold w-24 text-center">Frequency</th>
                <th className="p-4 font-extrabold w-12 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tasks.map((t, idx) => {
                const isManagerOption = t.pattern === 'Manager-assign' || t.pattern === 'Collab';

                return (
                  <tr key={t.id} className={`transition-colors ${selectedIds.includes(t.id) ? 'bg-[#cbdff0]/10 hover:bg-[#cbdff0]/15' : 'hover:bg-slate-50/20'}`}>
                    <td className="p-4 text-center font-bold text-gray-300 font-mono select-none">
                      <div className="flex items-center justify-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(t.id)}
                          onChange={() => handleSelectRow(t.id)}
                          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                        />
                        <span className="text-gray-400 font-mono text-[10px]">{idx + 1}</span>
                      </div>
                    </td>
                    <td className="p-4 font-bold text-slate-800">
                      <div>{t.name}</div>
                      {t.compliance && (
                        <span className="text-[8px] bg-red-50 text-red-700 px-1 py-0.5 rounded font-bold uppercase mt-1 inline-block border border-red-100">
                          Dual Sign-off [🔒]
                        </span>
                      )}
                      {t.trackerTarget && (
                        <span className="text-[8px] bg-[#eef5fc] text-[#1f3864] px-1 py-0.5 rounded font-bold uppercase mt-1 inline-block border border-blue-100 ml-1">
                          📊 Tracker [Target: {t.trackerTarget}]
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-gray-500 font-medium">{t.category}</td>
                    <td className="p-4 text-center">
                      <span className={`text-[10px] px-2.5 py-1 rounded-full border font-bold ${
                        t.priority === 'Critical'
                          ? 'bg-red-50 text-red-700 border-red-150'
                          : t.priority === 'High'
                          ? 'bg-orange-50 text-orange-700 border-orange-150'
                          : t.priority === 'Standard'
                          ? 'bg-blue-50 text-blue-700 border-blue-150'
                          : 'bg-slate-50 text-slate-600 border-slate-200'
                      }`}>
                        {t.priority}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      <span className="bg-[#cbdff0]/30 text-[#122543] text-[10px] px-2.5 py-1 rounded-full font-bold border border-slate-100 select">
                        {patternLabel(t.pattern)}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      {isManagerOption ? (
                        <select
                          value={t.managerAssignedName || ''}
                          onChange={(e) => onUpdateTaskAssignee(t.id, e.target.value)}
                          className={`w-full text-[11px] font-extrabold rounded-lg p-2- outline-none border focus:border-[#1f3864] p-1.5 focus:bg-white select ${
                            t.managerAssignedName
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                              : 'bg-amber-50 border-amber-250 text-amber-800 animate-pulse'
                          }`}
                        >
                          <option value="">-- Click to Nominate --</option>
                          {staffList.filter(s => !s.isManager).map(s => (
                            <option key={s.id} value={s.name}>{s.name}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-[11px] text-gray-400 italic">Auto-managed</span>
                      )}
                    </td>
                    <td className="p-4 text-center">
                      {isManagerOption ? (
                        <button
                          onClick={() => handleTriggerAiSuggest(t)}
                          className="p-2 bg-[#eef5fc] hover:bg-sky-100 text-[#1f3864] rounded-xl border border-[#cbdff0] cursor-pointer transition-colors shadow-xs"
                          title="Generate AI suggestion report Card"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-[#00aeff]" />
                        </button>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="p-4 text-center font-bold text-gray-500">{t.frequency}</td>
                    <td className="p-4 text-center">
                      <button
                        onClick={() => onDeleteTask(t.id)}
                        className="p-1 px-2.5 text-gray-400 hover:text-red-500 hover:bg-red-50- rounded-lg cursor-pointer"
                        title="Delete Task"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Task Modal overlay */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-gray-100 relative max-h-[85vh] flex flex-col">
            <h3 className="font-sans font-bold text-base text-gray-900 border-b border-gray-100 pb-3 mb-4 flex items-center gap-1.5 shrink-0">
              <BookOpen className="w-5 h-5 text-[#00aeff]" /> Create New Task Master
            </h3>

            <form onSubmit={handleAddTaskSubmit} className="flex flex-col gap-3 flex-1 min-h-0">
              {/* Scrollable field area — keeps the action buttons pinned below */}
              <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3 pr-1">
              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase">Task Name</label>
                <input
                  type="text"
                  required
                  value={taskName}
                  onChange={(e) => setTaskName(e.target.value)}
                  placeholder="e.g. Opening checklist, equipment check, daily report..."
                  className="w-full text-xs font-semibold bg-[#fafbfc] border border-gray-200 rounded-lg p-2.5 mt-1 outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Category</label>
                  <button
                    type="button"
                    onClick={handleSuggestCategoryTasks}
                    disabled={catSuggesting || !category}
                    className="flex items-center gap-1 text-[10px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 px-2 py-1 rounded-md border border-indigo-200 transition-all cursor-pointer"
                  >
                    <Sparkles className={`w-3 h-3 ${catSuggesting ? 'animate-pulse' : ''}`} />
                    {catSuggesting ? 'Thinking…' : 'Suggest tasks'}
                  </button>
                </div>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as any)}
                  className="w-full text-xs font-semibold bg-[#fafbfc] border border-gray-200 rounded-lg p-2.5 mt-1 outline-none"
                >
                  {taskCategories.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                  {/* Preserve a value that isn't in the workspace taxonomy (e.g. legacy/AI-seeded) */}
                  {category && !taskCategories.includes(category) && (
                    <option value={category}>{category}</option>
                  )}
                </select>

                {catSuggestError && (
                  <p className="text-[10px] text-rose-600 font-semibold mt-1.5">⚠️ {catSuggestError}</p>
                )}

                {catSuggestions.length > 0 && (
                  <div className="mt-2 bg-indigo-50/50 border border-indigo-100 rounded-lg p-2.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-indigo-900 uppercase tracking-wide">
                        Suggested for "{category}"
                      </span>
                      <button type="button" onClick={() => setCatSuggestions([])} className="text-[10px] text-slate-400 hover:text-slate-600 font-bold cursor-pointer">✕ Dismiss</button>
                    </div>
                    <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                      {catSuggestions.map((sug, idx) => (
                        <div
                          key={idx}
                          className={`p-2 rounded-md border text-[11px] cursor-pointer flex items-start gap-2 transition-all ${sug.checked ? 'bg-white border-indigo-300' : 'bg-slate-50/60 border-slate-100 opacity-60'}`}
                          onClick={() => setCatSuggestions(catSuggestions.map((s, i) => i === idx ? { ...s, checked: !s.checked } : s))}
                        >
                          <input type="checkbox" checked={sug.checked} onChange={() => {}} className="mt-0.5 accent-indigo-600" />
                          <div className="flex-1">
                            <div className="flex items-center justify-between gap-1 flex-wrap">
                              <span className="font-bold text-slate-800">{sug.name}</span>
                              <span className="text-[8px] font-mono font-extrabold uppercase bg-indigo-100 text-indigo-700 px-1 py-0.5 rounded">{patternLabel(sug.pattern)}</span>
                            </div>
                            <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">{sug.notes}</p>
                            <div className="text-[9px] text-slate-400 font-mono mt-0.5">
                              {sug.priority} · {sug.frequency}{sug.requiredSkills?.length ? ` · skills: ${sug.requiredSkills.join(', ')}` : ''}
                            </div>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); applySuggestionToForm(sug); }}
                              className="text-[9px] font-bold text-indigo-700 hover:underline mt-1 cursor-pointer"
                            >
                              ↳ Use this to fill the form
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={handleAddSelectedSuggestions}
                      disabled={!catSuggestions.some(s => s.checked)}
                      className="w-full text-[11px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 rounded-md py-2 transition-all cursor-pointer"
                    >
                      + Add {catSuggestions.filter(s => s.checked).length} selected task{catSuggestions.filter(s => s.checked).length === 1 ? '' : 's'}
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Pattern</label>
                  <select
                    value={pattern}
                    onChange={(e) => setPattern(e.target.value as any)}
                    className="w-full text-xs font-semibold bg-[#fafbfc] border border-gray-200 rounded-lg p-2.5 mt-1 outline-none"
                  >
                    <option value="Auto">Smart auto-assign</option>
                    <option value="Shift-based">Shift-based</option>
                    <option value="Role-group">Role-group</option>
                    <option value="Linked">Linked</option>
                    <option value="Collab">Collab</option>
                    <option value="Person-specific">Person-specific</option>
                    <option value="Manager-assign">Manager-assign</option>
                    <option value="Dispensing-rotate">Round-robin</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Priority</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as any)}
                    className="w-full text-xs font-semibold bg-[#fafbfc] border border-gray-200 rounded-lg p-2.5 mt-1 outline-none"
                  >
                    <option value="Critical">Critical</option>
                    <option value="High">High</option>
                    <option value="Standard">Standard</option>
                    <option value="Routine">Routine</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase">Fulfillment Value</label>
                <input
                  type="text"
                  value={asgnVal}
                  onChange={(e) => setAsgnVal(e.target.value)}
                  placeholder={pattern === 'Auto' ? 'Optional: restrict to a role (e.g. Nurse)' : 'Shift A, Provide Relief, or Slot index (0,1,2)'}
                  className="w-full text-xs font-semibold bg-[#fafbfc] border border-gray-200 rounded-lg p-2.5 mt-1 outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase">Required Skills <span className="text-gray-400 normal-case font-medium">(optional, comma-separated)</span></label>
                <input
                  type="text"
                  value={requiredSkillsInput}
                  onChange={(e) => setRequiredSkillsInput(e.target.value)}
                  placeholder="e.g. First Aid, Forklift License"
                  className="w-full text-xs font-semibold bg-[#fafbfc] border border-gray-200 rounded-lg p-2.5 mt-1 outline-none"
                />
                <p className="text-[9px] text-gray-400 mt-1">Only staff who hold every listed skill are eligible for this task.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Frequency</label>
                  <select
                    value={freq}
                    onChange={(e) => setFreq(e.target.value)}
                    className="w-full text-xs font-semibold bg-[#fafbfc] border border-gray-200 rounded-lg p-2.5 mt-1 outline-none animate"
                  >
                    <option value="Daily">Daily</option>
                    <option value="Weekly (Sunday)">Weekly (Sunday)</option>
                    <option value="Monthly">Monthly</option>
                    <option value="Monthly (Continuous)">Monthly (Continuous)</option>
                    <option value="Last day of month">Last day of month</option>
                  </select>
                </div>

                {freq.includes('Continuous') && (
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 uppercase">Tracker Target</label>
                    <input
                      type="number"
                      value={trackerTarget}
                      onChange={(e) => setTrackerTarget(Math.max(0, parseInt(e.target.value) || 0))}
                      placeholder="e.g. 10 wards"
                      className="w-full text-xs font-semibold bg-[#fafbfc] border border-gray-200 rounded-lg p-2.5 mt-1 outline-none"
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 py-1">
                <input
                  type="checkbox"
                  id="complianceCheck"
                  checked={compliance}
                  onChange={(e) => setCompliance(e.target.checked)}
                  className="w-4.5 h-4.5 accent-blue-900 border-gray-300 rounded cursor-pointer"
                />
                <label htmlFor="complianceCheck" className="text-xs font-bold text-gray-700 cursor-pointer">
                  Mandatory Dual Counter-sign [🔒]
                </label>
              </div>

              {/* Dynamic Checklist Parameter Configuration builder */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col gap-2.5">
                <div className="flex justify-between items-center">
                  <h4 className="text-[10px] font-black text-slate-800 uppercase font-mono tracking-wide">
                    📋 Custom SOP Parameter Checklist
                  </h4>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomFields(prev => [
                        ...prev,
                        {
                          id: `f-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                          label: '',
                          type: 'text',
                          required: true,
                          placeholder: ''
                        }
                      ]);
                    }}
                    className="text-[9.5px] font-black bg-[#1f3864] hover:bg-slate-800 text-white px-2 py-1 rounded-md uppercase font-mono flex items-center gap-0.5 cursor-pointer leading-tight"
                  >
                    + Add Field
                  </button>
                </div>

                {customFields.length === 0 ? (
                  <p className="text-[9.5px] text-slate-400 italic">No custom fields defined. Standard single text remark field will be provided.</p>
                ) : (
                  <div className="flex flex-col gap-2.5 max-h-48 overflow-y-auto pr-1">
                    {customFields.map((field, idx) => (
                      <div key={field.id} className="bg-white border border-slate-200 rounded-lg p-2.5 flex flex-col gap-2 relative">
                        <button
                          type="button"
                          onClick={() => setCustomFields(prev => prev.filter(f => f.id !== field.id))}
                          className="absolute right-2 top-2 p-1 text-rose-500 hover:bg-rose-50 rounded-md transition-colors font-bold text-xs"
                        >
                          ✕
                        </button>

                        <div className="grid grid-cols-2 gap-2 mt-1">
                          <div>
                            <label className="text-[8px] font-bold text-gray-400 uppercase font-mono block">Label *</label>
                            <input
                              type="text"
                              required
                              value={field.label}
                              onChange={(e) => {
                                const newFields = [...customFields];
                                newFields[idx].label = e.target.value;
                                setCustomFields(newFields);
                              }}
                              placeholder="e.g. Verify unit pressure"
                              className="w-full text-[11px] font-semibold bg-white border border-gray-200 rounded-md p-1.5 mt-1 outline-none text-slate-800"
                            />
                          </div>

                          <div>
                            <label className="text-[8px] font-bold text-gray-400 uppercase font-mono block">Type *</label>
                            <select
                              value={field.type}
                              onChange={(e) => {
                                const newFields = [...customFields];
                                newFields[idx].type = e.target.value as any;
                                setCustomFields(newFields);
                              }}
                              className="w-full text-[11px] font-semibold bg-white border border-gray-200 rounded-md p-1.5 mt-1 outline-none text-slate-800"
                            >
                              <option value="text">Text free-form</option>
                              <option value="number">Numeric bounds check</option>
                              <option value="checkbox">Checkbox toggle</option>
                              <option value="select">Select list</option>
                            </select>
                          </div>
                        </div>

                        {/* Numeric specific guidelines bounds */}
                        {field.type === 'number' && (
                          <div className="grid grid-cols-2 gap-2 bg-amber-50/50 p-2 rounded-md border border-amber-100">
                            <div>
                              <label className="text-[8px] font-bold text-amber-800 uppercase font-mono block">Min Limit</label>
                              <input
                                type="number"
                                step="0.1"
                                placeholder="e.g. 2.0"
                                value={field.minValue ?? ''}
                                onChange={(e) => {
                                  const newFields = [...customFields];
                                  newFields[idx].minValue = e.target.value !== '' ? parseFloat(e.target.value) : undefined;
                                  setCustomFields(newFields);
                                }}
                                className="w-full text-[10px] font-mono bg-white border border-amber-200 rounded p-1 outline-none text-slate-800 font-bold"
                              />
                            </div>
                            <div>
                              <label className="text-[8px] font-bold text-amber-800 uppercase font-mono block">Max Limit</label>
                              <input
                                type="number"
                                step="0.1"
                                placeholder="e.g. 8.0"
                                value={field.maxValue ?? ''}
                                onChange={(e) => {
                                  const newFields = [...customFields];
                                  newFields[idx].maxValue = e.target.value !== '' ? parseFloat(e.target.value) : undefined;
                                  setCustomFields(newFields);
                                }}
                                className="w-full text-[10px] font-mono bg-white border border-amber-200 rounded p-1 outline-none text-slate-800 font-bold"
                              />
                            </div>
                            <div className="col-span-2 mt-1">
                              <label className="text-[8px] font-mono font-bold text-amber-800 uppercase block">Out-of-bounds directive *</label>
                              <input
                                type="text"
                                required
                                value={field.breachThresholdAction || ''}
                                onChange={(e) => {
                                  const newFields = [...customFields];
                                  newFields[idx].breachThresholdAction = e.target.value;
                                  setCustomFields(newFields);
                                }}
                                placeholder="e.g. Engage cooler backup immediately"
                                className="w-full text-[10px] bg-white border border-amber-200 rounded p-1 mt-0.5 outline-none text-slate-800 font-semibold"
                              />
                            </div>
                          </div>
                        )}

                        {/* Select options */}
                        {field.type === 'select' && (
                          <div className="bg-indigo-50/50 p-2 rounded-md border border-indigo-150">
                            <label className="text-[8px] font-bold text-indigo-850 uppercase font-mono block">Comma-separated Options *</label>
                            <input
                              type="text"
                              required
                              value={(field.selectOptions || []).join(', ')}
                              onChange={(e) => {
                                const newFields = [...customFields];
                                newFields[idx].selectOptions = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                                setCustomFields(newFields);
                              }}
                              placeholder="e.g. Clean, Requires service, Damaged"
                              className="w-full text-[10px] bg-white border border-indigo-200 rounded p-1 mt-1 outline-none text-slate-800 font-semibold"
                            />
                          </div>
                        )}

                        <div className="flex items-center gap-1.5 mt-1">
                          <input
                            type="checkbox"
                            id={`req-${field.id}`}
                            checked={!!field.required}
                            onChange={(e) => {
                              const newFields = [...customFields];
                              newFields[idx].required = e.target.checked;
                              setCustomFields(newFields);
                            }}
                            className="w-3.5 h-3.5 accent-slate-800 border-gray-300 rounded cursor-pointer"
                          />
                          <label htmlFor={`req-${field.id}`} className="text-[9px] font-bold text-gray-400 uppercase font-mono cursor-pointer">
                            Required parameter check
                          </label>
                        </div>

                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase">Notes & instructions description</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Details and instructions for whoever performs this task..."
                  className="w-full text-xs font-semibold bg-[#fafbfc] border border-gray-200 rounded-lg p-2.5 mt-1 outline-none"
                ></textarea>
              </div>
              </div>

              <div className="flex gap-2.5 pt-3 mt-1 shrink-0 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowAddTaskModal(false)}
                  className="flex-1 py-2.5 bg-gray-150 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-[#1f3864] hover:bg-blue-900 text-white font-bold text-xs rounded-xl shadow-md border border-blue-500 cursor-pointer text-center"
                >
                  Save Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AI Suggestion Report Modal overlay */}
      {showAiModal && aiTargetTask && aiSuggestionReport && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100 relative">
            <h3 className="font-sans font-bold text-base text-gray-900 border-b border-gray-100 pb-3 mb-4 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#00aeff]" /> AI Assignment Recommendation Card
            </h3>
            <p className="text-xs text-gray-500 leading-relaxed mb-4">
              Analyzing scheduled shifts, historical completion logs, and active task loads to locate the most equitable eligible and qualified candidate for: <br />
              <strong className="text-slate-900 text-sm">{aiTargetTask.name}</strong>
            </p>

            <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-100 p-4 rounded-2xl mb-4 flex items-center justify-between shadow-xs">
              <div>
                <span className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider block">Best Candidate Match:</span>
                <span className="font-extrabold text-lg text-emerald-950 flex items-center gap-1 mt-0.5">
                  <Star className="w-5 h-5 text-amber-500 fill-amber-300 animate-pulse" /> {aiSuggestionReport.bestCandidate}
                </span>
              </div>
              <span className="bg-emerald-600 text-white text-[10px] px-2.5 py-1 rounded-full font-bold uppercase shadow-sm">
                98% Fairness Match
              </span>
            </div>

            <div className="mb-5 max-h-40 overflow-y-auto divide-y divide-gray-50 flex flex-col pr-1 border border-gray-50 rounded-xl">
              {aiSuggestionReport.details.map((detail, idx) => (
                <div key={idx} className="py-2 px-3 flex justify-between items-center text-xs bg-white">
                  <div className="flex flex-col">
                    <span className="font-bold text-slate-800">{idx + 1}. {detail.name}</span>
                    <span className="text-[10px] text-gray-400 font-semibold font-mono">
                      Work Index: {Math.round(detail.score)} pts · Assigned: {detail.currentCount} tasks
                    </span>
                  </div>
                  <span className="text-slate-500 text-[10px]">
                    Completed task {detail.completedCount}x historically
                  </span>
                </div>
              ))}
            </div>

            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setShowAiModal(false);
                  setAiTargetTask(null);
                  setAiSuggestionReport(null);
                }}
                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl cursor-pointer"
              >
                Decline
              </button>
              <button
                onClick={handleApplyAiSuggestion}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 border border-emerald-500 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer flex items-center justify-center gap-1"
              >
                <Check className="w-4 h-4" /> Confirm & Apply Candidate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
