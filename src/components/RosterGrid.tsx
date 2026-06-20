import React, { useState, useEffect } from 'react';
import { RosterCycle, StaffMember, PublicHoliday } from '../types';
import { SHIFTS } from '../data/initialData';
import { isWeekend, isPublicHoliday } from '../utils/rosterUtils';
import { dbGetCollection, dbSetDoc, dbDeleteDoc } from '../firebase';
import { useConfirm } from './ui/ConfirmProvider';
import { 
  AlertTriangle, 
  Lock, 
  Unlock, 
  Sparkles, 
  Copy, 
  Clipboard, 
  Trash2, 
  Zap, 
  Check, 
  RefreshCw, 
  CalendarRange,
  Layers,
  HelpCircle,
  GripVertical,
  UserPlus
} from 'lucide-react';

export const parseLocalDate = (dateStr: string | Date | undefined): Date => {
  if (!dateStr) return new Date();
  if (dateStr instanceof Date) return dateStr;
  const str = String(dateStr);
  if (str.includes('T')) return new Date(str);
  return new Date(str + 'T00:00:00');
};

export const formatLocalDate = (date: Date): string => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

interface RosterGridProps {
  activeCycle: RosterCycle;
  updateShift: (staffId: string, dayIdx: number, newShiftCode: string) => void;
  bulkUpdateShifts?: (updates: { staffId: string; dayIdx: number; shiftCode: string }[]) => void;
  restoreCycle?: (cycle: RosterCycle) => void;
  updateCycleDates?: (startDate: string, endDate: string) => void;
  staffList: StaffMember[];
  cycleDates: string[];
  holidays: PublicHoliday[];
  toggleRosterLock: () => void;
  openWizard: () => void;
  openOnboarding?: () => void;
  isManagerView?: boolean;
}

export default function RosterGrid({
  activeCycle,
  updateShift,
  bulkUpdateShifts,
  restoreCycle,
  updateCycleDates,
  staffList,
  cycleDates,
  holidays,
  toggleRosterLock,
  openWizard,
  openOnboarding,
  isManagerView = true,
}: RosterGridProps) {
  const confirm = useConfirm();
  // Enforce read-only locks for standard staff
  const isGridLocked = activeCycle.isLocked || !isManagerView;

  // Operational Cycle configuration states
  const [isConfiguringCycle, setIsConfiguringCycle] = useState(false);
  const [cyclePreset, setCyclePreset] = useState<'mbegg' | 'calendar' | 'custom'>('mbegg');
  const [customStart, setCustomStart] = useState(activeCycle?.startDate || '2026-06-15');
  const [customEnd, setCustomEnd] = useState(activeCycle?.endDate || '2026-07-14');

  useEffect(() => {
    if (activeCycle) {
      setCustomStart(activeCycle.startDate);
      setCustomEnd(activeCycle.endDate);
      
      const startDay = parseLocalDate(activeCycle.startDate).getDate();
      const endDay = parseLocalDate(activeCycle.endDate).getDate();
      
      // Calculate months difference
      const d1 = parseLocalDate(activeCycle.startDate);
      const d2 = parseLocalDate(activeCycle.endDate);
      const diffMonths = (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
      const lastDayOfStartMonth = new Date(d1.getFullYear(), d1.getMonth() + 1, 0).getDate();
      
      if (startDay === 15 && endDay === 14 && diffMonths === 1) {
        setCyclePreset('mbegg');
      } else if (startDay === 1 && endDay === lastDayOfStartMonth && diffMonths === 0) {
        setCyclePreset('calendar');
      } else {
        setCyclePreset('custom');
      }
    }
  }, [activeCycle]);

  const handlePresetChange = (preset: 'mbegg' | 'calendar' | 'custom', baseDateStr?: string) => {
    setCyclePreset(preset);
    const pivot = parseLocalDate(baseDateStr || customStart);
    
    if (preset === 'mbegg') {
      const yStr = pivot.getFullYear();
      const mStr = String(pivot.getMonth() + 1).padStart(2, '0');
      const startVal = `${yStr}-${mStr}-15`;
      const endObj = new Date(pivot.getFullYear(), pivot.getMonth() + 1, 14);
      const endVal = formatLocalDate(endObj);
      setCustomStart(startVal);
      setCustomEnd(endVal);
    } else if (preset === 'calendar') {
      const yStr = pivot.getFullYear();
      const mStr = String(pivot.getMonth() + 1).padStart(2, '0');
      const startVal = `${yStr}-${mStr}-01`;
      const endObj = new Date(pivot.getFullYear(), pivot.getMonth() + 1, 0); // last day
      const endVal = formatLocalDate(endObj);
      setCustomStart(startVal);
      setCustomEnd(endVal);
    }
  };

  const handleApplyCustomDates = (e: React.FormEvent) => {
    e.preventDefault();
    if (updateCycleDates) {
      updateCycleDates(customStart, customEnd);
      triggerFeedback('Operational period successfully updated!');
      setIsConfiguringCycle(false);
    }
  };

  // Enterprise Clipboard State
  const [copiedStaffId, setCopiedStaffId] = useState<string | null>(null);
  const [copiedShifts, setCopiedShifts] = useState<string[] | null>(null);
  const [bulkFeedback, setBulkFeedback] = useState<string | null>(null);

  // Archive & Compare states
  const [activeTab, setActiveTab2] = useState<'grid' | 'history'>('grid');
  const [historyCycles, setHistoryCycles] = useState<RosterCycle[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [selectedHistoryCycle, setSelectedHistoryCycle] = useState<RosterCycle | null>(null);

  // Custom snapshot form
  const [snapshotName, setSnapshotName] = useState('');
  const [snapshotStartDate, setSnapshotStartDate] = useState(activeCycle?.startDate || '2026-06-15');
  const [snapshotStatus, setSnapshotStatus] = useState<'draft' | 'published'>('draft');

  // Drag and drop states
  const [draggedCell, setDraggedCell] = useState<{ staffId: string; dayIdx: number; shiftCode: string } | null>(null);
  const [draggedOverCell, setDraggedOverCell] = useState<{ staffId: string; dayIdx: number } | null>(null);
  const [editingCell, setEditingCell] = useState<{ staffId: string; dayIdx: number } | null>(null);

  const handleDragStart = (e: React.DragEvent, staffId: string, dayIdx: number, shiftCode: string) => {
    if (isGridLocked) return;
    setDraggedCell({ staffId, dayIdx, shiftCode });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify({ staffId, dayIdx, shiftCode }));
  };

  const handleDragOver = (e: React.DragEvent, staffId: string, dayIdx: number) => {
    if (isGridLocked) return;
    e.preventDefault();
    if (draggedOverCell?.staffId !== staffId || draggedOverCell?.dayIdx !== dayIdx) {
      setDraggedOverCell({ staffId, dayIdx });
    }
  };

  const handleDragLeave = () => {
    setDraggedOverCell(null);
  };

  const handleDragEnd = () => {
    setDraggedCell(null);
    setDraggedOverCell(null);
  };

  const handleDrop = (e: React.DragEvent, targetStaffId: string, targetDayIdx: number) => {
    if (isGridLocked) return;
    e.preventDefault();
    setDraggedOverCell(null);

    try {
      const rawData = e.dataTransfer.getData('text/plain');
      if (!rawData) return;
      const { staffId: srcStaffId, dayIdx: srcDayIdx, shiftCode: srcShiftCode } = JSON.parse(rawData);

      if (srcStaffId === targetStaffId && srcDayIdx === targetDayIdx) return;

      const targetShiftCode = activeCycle.shifts[targetStaffId]?.[targetDayIdx] || 'OFF';

      if (bulkUpdateShifts) {
        bulkUpdateShifts([
          { staffId: srcStaffId, dayIdx: srcDayIdx, shiftCode: targetShiftCode },
          { staffId: targetStaffId, dayIdx: targetDayIdx, shiftCode: srcShiftCode }
        ]);
        triggerFeedback(`Swapped: ${srcShiftCode} ⇆ ${targetShiftCode}`);
      } else {
        updateShift(srcStaffId, srcDayIdx, targetShiftCode);
        updateShift(targetStaffId, targetDayIdx, srcShiftCode);
        triggerFeedback(`Shift moved successfully`);
      }
    } catch (err) {
      console.error('Failed to swap shifts on drop:', err);
    } finally {
      setDraggedCell(null);
    }
  };

  const loadHistoryCycles = async () => {
    setIsLoadingHistory(true);
    try {
      // 1. Fetch from Firestore
      const cycles = await dbGetCollection<RosterCycle>('cycles');
      
      // 2. Also read from facility local storage for safety / sandbox isolator
      const localCycles: RosterCycle[] = [];
      const prefix = activeCycle.id.split('-').slice(0, 2).join('-'); // "cycle-kansanshi"
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('kmh_active_cycle') || key.includes('_active_cycle') || key.includes('_history_cycle'))) {
          try {
            const parsed = JSON.parse(localStorage.getItem(key) || '');
            if (parsed && parsed.id) localCycles.push(parsed);
          } catch (_) {}
        }
      }

      // Merge and ensure uniqueness by ID
      const allMerged = [...cycles, ...localCycles];
      const uniqueMap = new Map<string, RosterCycle>();
      allMerged.forEach(c => {
        if (c && c.id) {
          uniqueMap.set(c.id, c);
        }
      });

      // Filter to relevant facility (match selectedFacilityId prefix if ID has it)
      const filtered = Array.from(uniqueMap.values()).filter(c => c.id.startsWith(prefix) && c.id !== activeCycle.id);

      setHistoryCycles(filtered);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadHistoryCycles();
  }, [activeCycle?.id]);

  const handleCreateSnapshot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!snapshotName.trim()) return;
    
    // Format snapshot ID: e.g. cycle-kansanshi-<date>-<custom-slugify-name>
    const cleanSlug = snapshotName.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    const prefix = activeCycle.id.split('-').slice(0, 2).join('-'); // "cycle-kansanshi"
    const snapshotId = `${prefix}-${snapshotStartDate}-${cleanSlug}`;

    const newSnapshot: RosterCycle = {
      id: snapshotId,
      startDate: snapshotStartDate,
      endDate: new Date(new Date(snapshotStartDate).getFullYear(), new Date(snapshotStartDate).getMonth() + 1, 14).toISOString().split('T')[0],
      shifts: { ...activeCycle.shifts },
      isLocked: snapshotStatus === 'published'
    };

    try {
      // Save to Firebase
      await dbSetDoc('cycles', snapshotId, newSnapshot);
      // Save to facility history localstorage for offline fallback
      localStorage.setItem(`${prefix}_history_cycle_${snapshotId}`, JSON.stringify(newSnapshot));
      
      triggerFeedback('Snapshot archived successfully!');
      setSnapshotName('');
      loadHistoryCycles();
    } catch (error) {
      console.error('Error creating snapshot:', error);
      triggerFeedback('Failed to archive snapshot');
    }
  };

  const handleDeleteSnapshot = async (id: string) => {
    if (!(await confirm({ title: 'Delete this archived cycle?', danger: true, confirmLabel: 'Delete' }))) return;
    try {
      await dbDeleteDoc('cycles', id);
      const prefix = activeCycle.id.split('-').slice(0, 2).join('-');
      localStorage.removeItem(`${prefix}_history_cycle_${id}`);
      if (selectedHistoryCycle?.id === id) {
        setSelectedHistoryCycle(null);
      }
      triggerFeedback('Archived cycle deleted.');
      loadHistoryCycles();
    } catch (e) {
      console.error(e);
      triggerFeedback('Failed to delete archived cycle.');
    }
  };

  // Compare function
  const getDiscrepancies = (historyCycle: RosterCycle) => {
    const discrepancies: {
      staffName: string;
      dayIdx: number;
      dateStr: string;
      activeShift: string;
      historyShift: string;
    }[] = [];

    staffList.forEach(staff => {
      cycleDates.forEach((dateStr, dIdx) => {
        const actShift = activeCycle.shifts[staff.id]?.[dIdx] || 'OFF';
        const histShift = historyCycle.shifts[staff.id]?.[dIdx] || 'OFF';
        if (actShift !== histShift) {
          discrepancies.push({
            staffName: staff.name,
            dayIdx: dIdx,
            dateStr,
            activeShift: actShift,
            historyShift: histShift
          });
        }
      });
    });

    return discrepancies;
  };

  // Check coverage issues to report
  const analyzeCoverage = () => {
    const alerts: string[] = [];
    const phSet = new Set(holidays.map(h => h.date));

    cycleDates.forEach((dKey, dIdx) => {
      const isWknd = isWeekend(dKey);
      const isPH = phSet.has(dKey);
      const dLabel = `${parseLocalDate(dKey).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} (${parseLocalDate(dKey).toLocaleDateString('en-GB', { weekday: 'short' })})`;

      // Only care about weekends or holidays for E coverage
      if (isWknd || isPH) {
        let eCount = 0;
        let regularCount = 0;
        staffList.forEach(s => {
          const shift = activeCycle.shifts[s.id]?.[dIdx] || 'OFF';
          if (shift === 'E') eCount++;
          if (['A', 'B', 'C', 'D'].includes(shift)) regularCount++;
        });

        if (eCount === 0) {
          alerts.push(`⚠ ${dLabel} — Weekend/PH Coverage has NO 'E' shift (rotating Extended slot) assigned!`);
        } else if (eCount > 1) {
          alerts.push(`⚠ ${dLabel} — More than one staff member is assigned to 'E' (${eCount}). Ensure exactly 1 for fairness.`);
        }
      }
    });

    return alerts;
  };

  const coverageAlerts = analyzeCoverage();

  // Helper values for rendering spacer columns, totals
  const numDays = cycleDates.length;

  // Compute shift counts by day
  const getShiftCountByDay = (code: string, dayIdx: number) => {
    let count = 0;
    staffList.forEach(s => {
      if (activeCycle.shifts[s.id]?.[dayIdx] === code) {
        count++;
      }
    });
    return count;
  };

  const getTotalOnShiftByDay = (dayIdx: number) => {
    let count = 0;
    staffList.forEach(s => {
      const code = activeCycle.shifts[s.id]?.[dayIdx] || 'OFF';
      if (['A', 'A+', 'B', 'C', 'D', 'E', 'SC', 'N', 'TRN', 'OS'].includes(code)) {
        count++;
      }
    });
    return count;
  };

  // Enterprise Interactive Hour tracking per staff member
  const getStaffScheduledHours = (staffId: string) => {
    let tot = 0;
    cycleDates.forEach((_, dIdx) => {
      const shift = activeCycle.shifts[staffId]?.[dIdx] || 'OFF';
      const def = SHIFTS[shift];
      if (def) {
        tot += def.hours;
      }
    });
    return tot;
  };

  // --- Row Action Handlers ---
  const handleCopyRow = (staffId: string) => {
    const rawShifts = activeCycle.shifts[staffId] || [];
    const cloned = Array.isArray(rawShifts) ? [...rawShifts] : new Array(cycleDates.length).fill('OFF');
    setCopiedShifts(cloned);
    setCopiedStaffId(staffId);
    triggerFeedback('Copied shift pattern!');
  };

  const handlePasteRow = (staffId: string) => {
    if (!copiedShifts || !bulkUpdateShifts) return;
    const updates = cycleDates.map((_, dIdx) => ({
      staffId,
      dayIdx: dIdx,
      shiftCode: copiedShifts[dIdx] || 'OFF'
    }));
    bulkUpdateShifts(updates);
    triggerFeedback('Pasted shift pattern successfully!');
  };

  const handleClearRow = (staffId: string) => {
    if (!bulkUpdateShifts) return;
    const updates = cycleDates.map((_, dIdx) => ({
      staffId,
      dayIdx: dIdx,
      shiftCode: 'OFF'
    }));
    bulkUpdateShifts(updates);
    triggerFeedback('Cleared row schedule.');
  };

  const handleAutoFillRowWeekdays = (staffId: string) => {
    if (!bulkUpdateShifts) return;
    const updates = cycleDates.map((dKey, dIdx) => {
      const isWk = isWeekend(dKey);
      return {
        staffId,
        dayIdx: dIdx,
        shiftCode: isWk ? 'OFF' : 'A' // Monday-Friday standard Morning shift
      };
    });
    bulkUpdateShifts(updates);
    triggerFeedback('Applied modern weekdays Morning template!');
  };

  // --- Global Toolbar Handlers ---
  const handleGlobalFillOFF = () => {
    if (!bulkUpdateShifts) return;
    const updates: { staffId: string; dayIdx: number; shiftCode: string }[] = [];
    staffList.forEach(staff => {
      cycleDates.forEach((_, dIdx) => {
        const val = activeCycle.shifts[staff.id]?.[dIdx];
        if (!val || val === 'OFF') {
          updates.push({
            staffId: staff.id,
            dayIdx: dIdx,
            shiftCode: 'OFF'
          });
        }
      });
    });
    if (updates.length > 0) {
      bulkUpdateShifts(updates);
      triggerFeedback('Filled unassigned cells with OFF.');
    } else {
      triggerFeedback('No empty slots found.');
    }
  };

  const handleGlobalReset = async () => {
    if (!(await confirm({ title: 'Reset the whole draft roster?', message: 'Every shift for all team members is set back to OFF.', danger: true, confirmLabel: 'Reset all' }))) return;
    if (!bulkUpdateShifts) return;
    const updates: { staffId: string; dayIdx: number; shiftCode: string }[] = [];
    staffList.forEach(staff => {
      cycleDates.forEach((_, dIdx) => {
        updates.push({
          staffId: staff.id,
          dayIdx: dIdx,
          shiftCode: 'OFF'
        });
      });
    });
    bulkUpdateShifts(updates);
    triggerFeedback('Reset draft roster successfully.');
  };

  const triggerFeedback = (msg: string) => {
    setBulkFeedback(msg);
    setTimeout(() => setBulkFeedback(null), 3000);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Management Toolbar */}
      <div className="flex flex-wrap justify-between items-center gap-4 bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
        <div>
          <div className="text-xs text-gray-400 font-extrabold">Active Cycle</div>
          <h2 className="text-[#7A1230] text-xl font-black font-sans flex items-center gap-2">
            Roster &amp; Schedule
            {isGridLocked ? (
              <span className="text-xs bg-red-100 text-red-700 px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1 border border-red-200">
                <Lock className="w-3 h-3" /> {isManagerView ? 'Locked (Live)' : 'Read-Only (Access Restricted)'}
              </span>
            ) : (
              <span className="text-xs bg-rose-50 text-[#7A1230] px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1 border border-rose-100">
                <Unlock className="w-3 h-3" /> Draft Editing
              </span>
            )}
          </h2>
        </div>

        {/* Dynamic feedback toast for quick macros */}
        {bulkFeedback && (
          <div className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1.5 rounded-xl text-xs font-bold font-sans flex items-center gap-1.5 animate-bounce shadow-xs">
            <Check className="w-3.5 h-3.5 text-emerald-600" /> {bulkFeedback}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {/* Tab Switcher */}
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 mr-2">
            <button
              onClick={() => setActiveTab2('grid')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'grid' 
                  ? 'bg-white text-[#7A1230] shadow-xs' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              📅 Active Planner
            </button>
            <button
              onClick={() => {
                setActiveTab2('history');
                loadHistoryCycles();
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'history' 
                  ? 'bg-white text-indigo-700 shadow-xs' 
                  : 'text-slate-600 hover:text-indigo-600'
              }`}
            >
              🔄 Archive & Compare ({historyCycles.length})
            </button>
          </div>

          {/* Real Bulk actions only when unlocked */}
          {!isGridLocked && isManagerView && bulkUpdateShifts && activeTab === 'grid' && (
            <div className="flex items-center gap-1.5 bg-slate-50 p-1 rounded-xl border border-slate-205 mr-1.5">
              <button
                onClick={handleGlobalFillOFF}
                className="flex items-center gap-1 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 rounded-lg font-bold text-[11px] shadow-xs cursor-pointer transition-all"
                title="Saves hours of clicking dropdowns by locking in all remaining slots as OFF"
              >
                <Check className="w-3 h-3 text-sky-600" /> Fill Empty with OFF
              </button>

              <button
                onClick={handleGlobalReset}
                className="flex items-center gap-1 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg font-bold text-[11px] cursor-pointer transition-all border border-rose-100"
                title="Clears all active assignments back to OFF"
              >
                <Trash2 className="w-3 h-3 text-rose-600" /> Clear Grid
              </button>
            </div>
          )}

          {activeTab === 'grid' && isManagerView && (
            <>
              {openOnboarding && (
                <button
                  onClick={openOnboarding}
                  className="flex items-center gap-1.5 px-4 py-2 bg-rose-50 hover:bg-rose-100 text-[#7A1230] border border-rose-200/50 rounded-xl font-bold text-xs shadow-xs transition-colors cursor-pointer"
                  title="Launches step-by-step clinical staff onboarding card"
                >
                  <UserPlus className="w-3.5 h-3.5 text-[#E29E25]" />
                  Onboard New Staff
                </button>
              )}
              <button
                onClick={openWizard}
                className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-[#4C0B1E] to-[#7A1230] hover:from-[#7A1230] hover:to-[#4C0B1E] text-white border border-[#E29E25]/40 rounded-xl font-bold text-xs shadow-sm transition-all cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#E29E25]" />
                Roster Setup Wizard
              </button>
              
              {updateCycleDates && (
                <button
                  onClick={() => setIsConfiguringCycle(!isConfiguringCycle)}
                  className={`flex items-center gap-1.5 px-4 py-2 border rounded-xl font-bold text-xs shadow-sm transition-all cursor-pointer ${
                    isConfiguringCycle
                      ? 'bg-indigo-100 text-indigo-900 border-indigo-300'
                      : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                  }`}
                  title="Change the roster's start and end dates"
                >
                  <CalendarRange className="w-3.5 h-3.5 text-indigo-500" />
                  Edit roster dates
                </button>
              )}

              <button
                onClick={toggleRosterLock}
                className={`flex items-center gap-1.5 px-4 py-2 border rounded-xl font-bold text-xs shadow-sm transition-all cursor-pointer ${
                  activeCycle.isLocked
                    ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                }`}
              >
                {activeCycle.isLocked ? (
                  <>
                    <Unlock className="w-3.5 h-3.5" /> Unlock Roster for Swaps
                  </>
                ) : (
                  <>
                    <Lock className="w-3.5 h-3.5" /> Lock & Publish Roster
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Grid Tab Content */}
      {activeTab === 'grid' && (
        <>
          {/* Flexible Operational Cycle / Billing Period Customizer Panel */}
          {isConfiguringCycle && isManagerView && (
            <div className="bg-gradient-to-br from-indigo-500/5 to-indigo-600/5 border border-indigo-200 rounded-3xl p-6 shadow-xs flex flex-col gap-4 animate-[fadeIn_0.15s_ease-out] mb-1">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[11px] bg-indigo-100 text-indigo-900 font-extrabold border border-indigo-200 px-2 py-0.5 rounded-sm font-mono">
                    ⚙️ Operational Cycle Configurations
                  </span>
                  <h3 className="text-slate-900 font-black text-sm mt-1.5 flex items-center gap-2">
                    Custom Operational & Billing Period
                  </h3>
                  <p className="text-xs text-slate-550 leading-relaxed mt-0.5">
                    Align your roster grid to any customized scheduling layout. You can run standard Mary Begg cycles (15th to 14th of following month), basic calendar months (1st to last day of same month), or input custom start and end dates. **All draft shift assignments are preserved and shifted dynamically to align with their calendar dates.**
                  </p>
                </div>
                <button
                  onClick={() => setIsConfiguringCycle(false)}
                  className="text-slate-400 hover:text-slate-600 p-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg cursor-pointer transition-colors"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleApplyCustomDates} className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-white p-5 rounded-2xl border border-slate-100/80">
                <div className="flex flex-col gap-1.5 md:col-span-2">
                  <label className="text-[10px] font-bold text-slate-405">Select Roster Cycle Template</label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => handlePresetChange('mbegg')}
                      className={`px-3 py-2.5 rounded-xl text-xs font-bold border transition-all text-center cursor-pointer ${
                        cyclePreset === 'mbegg'
                          ? 'bg-[#7A1230] text-white border-transparent'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      🗓️ 15th to 14th
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePresetChange('calendar')}
                      className={`px-3 py-2.5 rounded-xl text-xs font-bold border transition-all text-center cursor-pointer ${
                        cyclePreset === 'calendar'
                          ? 'bg-[#7A1230] text-white border-transparent'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      📅 Calendar Month
                    </button>
                    <button
                      type="button"
                      onClick={() => setCyclePreset('custom')}
                      className={`px-3 py-2.5 rounded-xl text-xs font-bold border transition-all text-center cursor-pointer ${
                        cyclePreset === 'custom'
                          ? 'bg-[#7A1230] text-white border-transparent'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      ⚙️ Fully Custom
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-455">Start Date</label>
                  <input
                    type="date"
                    value={customStart}
                    onChange={(e) => {
                      const newStart = e.target.value;
                      setCustomStart(newStart);
                      if (cyclePreset !== 'custom') {
                        handlePresetChange(cyclePreset, newStart);
                      }
                    }}
                    className="px-3.5 py-2.5 text-xs border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#7A1230] bg-[#fdfdfd] text-gray-900 font-mono font-bold shadow-xs"
                    required
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-455">End Date</label>
                  <input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    disabled={cyclePreset !== 'custom'}
                    className="px-3.5 py-2.5 text-xs border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#7A1230] bg-[#fdfdfd] disabled:bg-slate-50 disabled:text-slate-450 text-gray-900 font-mono font-bold shadow-xs"
                    required
                  />
                </div>

                <div className="md:col-span-4 flex justify-end gap-2 border-t border-slate-100 pt-4 mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsConfiguringCycle(false);
                      if (activeCycle) {
                        setCustomStart(activeCycle.startDate);
                        setCustomEnd(activeCycle.endDate);
                      }
                    }}
                    className="px-4 py-2 bg-slate-150 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-[#7A1230] hover:bg-[#5C0D24] text-white rounded-xl text-xs font-black shadow-xs cursor-pointer transition-colors"
                  >
                    Save date changes
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Coverage Integrity Audit Alerts (Manager Only) */}
          {isManagerView && coverageAlerts.length > 0 && (
            <div className="border border-amber-200 bg-amber-50 rounded-2xl p-4 flex flex-col gap-2 shadow-sm">
              <div className="flex items-center gap-2 text-amber-800 font-extrabold text-sm mb-1">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                Coverage gaps ({coverageAlerts.length})
              </div>
              <div className="max-h-24 overflow-y-auto flex flex-col gap-1 pr-2">
                {coverageAlerts.map((alert, idx) => (
                  <p key={idx} className="text-xs text-amber-700 leading-relaxed font-semibold">
                    {alert}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Interactive Drag and Drop Help Banner (Manager Only when grid is unlocked) */}
          {!isGridLocked && (
            <div className="border border-indigo-150 bg-indigo-50/40 rounded-2xl p-3.5 flex items-center justify-between gap-3 shadow-3xs">
              <div className="flex items-center gap-2.5">
                <span className="text-lg select-none">✨</span>
                <p className="text-xs text-indigo-900 leading-relaxed font-semibold">
                  <strong>Interactivity Power-Up:</strong> You can drag any shift cell and drop it onto another to instantly <strong>swap locations or move shifts</strong> between staff or dates!
                </p>
              </div>
              <span className="text-[10px] bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full font-extrabold uppercase select-none tracking-wide animate-pulse">
                Drag-and-Drop Active
              </span>
            </div>
          )}

          {/* Interactive Rostering Grid */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto relative scrollbar-thin">
              <table className="min-w-full border-collapse table-fixed select-none">
                <thead>
                  <tr className="bg-slate-50 border-b border-gray-100">
                    <th className="sticky left-0 bg-slate-50 z-20 w-48 min-w-48 px-4 py-3 text-left text-xs font-bold text-slate-500 border-r border-gray-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                      Staff Member & Roster Stats
                    </th>
                    {cycleDates.map((dKey, dIdx) => {
                      const isWk = isWeekend(dKey);
                      const isPH = isPublicHoliday(dKey, holidays);
                      const dateObj = parseLocalDate(dKey);
                      const dayName = dateObj.toLocaleDateString('en-GB', { weekday: 'short' });
                      const dateNum = dateObj.getDate();
                      const isLastDOM = dateNum === new Date(dateObj.getFullYear(), dateObj.getMonth() + 1, 0).getDate();

                      let hBg = 'bg-[#deeaf1] text-[#1f3864]';
                      if (isPH) hBg = 'bg-amber-100 text-amber-800 border-amber-200';
                      else if (isWk) hBg = 'bg-slate-200 text-slate-700';
                      else if (isLastDOM) hBg = 'bg-purple-100 text-purple-800 border-purple-200';

                      return (
                        <th
                          key={dKey}
                          className={`w-12 min-w-12 text-center py-2 px-1 text-xs border-r border-gray-100 ${hBg}`}
                        >
                          <div className="text-[10px] uppercase font-bold tracking-tight">{dayName}</div>
                          <div className="text-sm font-extrabold mt-0.5">{dateNum}</div>
                          {isLastDOM && <div className="text-[10px] mt-0.5 text-purple-700 font-bold whitespace-nowrap">★ SC</div>}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {staffList.map((staff, sIdx) => {
                    const isEven = sIdx % 2 === 0;
                    const totalHours = getStaffScheduledHours(staff.id);
                    const targetHours = staff.contractedHours || 168;
                    const overtimeHours = totalHours > targetHours ? totalHours - targetHours : 0;

                    return (
                      <tr
                        key={staff.id}
                        className={`border-b border-gray-100 hover:bg-slate-55/40 transition-colors ${
                          isEven ? 'bg-slate-50/20' : 'bg-white'
                        }`}
                      >
                        <td className="sticky left-0 bg-white z-10 px-4 py-3 border-r border-gray-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] font-semibold text-sm text-gray-900 group">
                          <div className="flex flex-col">
                            <span className="flex items-center gap-1 font-bold">
                              {staff.gender === 'F' && <span className="text-[#880e4f] text-xs" title="Mother's Day Entitled">♀</span>}
                              {staff.name}
                            </span>
                            <span className="text-[10px] text-gray-400 font-mono tracking-tight font-normal">
                              {staff.role.split(' ')[0]} ({staff.gender || 'M'})
                            </span>

                            {/* Hour tracking progress indicator of enterprise standards */}
                            <div className="mt-1.5 flex flex-col gap-1">
                              <div className="flex justify-between items-center text-[11px]">
                                <span className="text-slate-500 font-semibold">{totalHours}h of {targetHours}h</span>
                                {overtimeHours > 0 ? (
                                  <span className="text-[#7A1230] font-black uppercase font-mono tracking-tight text-[10px] bg-red-50 px-1 border border-red-100 rounded-sm">+{overtimeHours}h OT</span>
                                ) : totalHours === targetHours ? (
                                  <span className="text-emerald-700 font-black uppercase text-[10px] bg-emerald-50 px-1 rounded-sm">Optimized</span>
                                ) : null}
                              </div>
                              <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                <div 
                                  style={{ width: `${Math.min(100, (totalHours / targetHours) * 100)}%` }}
                                  className={`h-full rounded-full transition-all ${
                                    totalHours > targetHours 
                                      ? 'bg-[#7A1230]' 
                                      : totalHours === targetHours 
                                        ? 'bg-emerald-500' 
                                        : 'bg-amber-400'
                                  }`}
                                ></div>
                              </div>
                            </div>

                            {/* Interactive Bulk Row Macros panel (Only displayed when activeCycle is editable) */}
                            {!activeCycle.isLocked && bulkUpdateShifts && (
                              <div className="mt-2.5 flex items-center gap-1 bg-slate-50 p-1 rounded-lg border border-slate-100 opacity-60 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => handleCopyRow(staff.id)}
                                  title="Copy shifts pattern to clipboard"
                                  className="p-1 hover:bg-white rounded text-slate-500 hover:text-[#7A1230] transition-all cursor-pointer grow flex justify-center"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                </button>
                                {copiedShifts && (
                                  <button
                                    onClick={() => handlePasteRow(staff.id)}
                                    title={`Paste copied shifts from ${staffList.find(s=>s.id===copiedStaffId)?.name || 'clipboard'}`}
                                    className="p-1 hover:bg-white rounded text-indigo-600 hover:text-indigo-800 transition-all cursor-pointer grow flex justify-center animate-pulse"
                                  >
                                    <Clipboard className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                <button
                                  onClick={() => handleAutoFillRowWeekdays(staff.id)}
                                  title="Auto-Fill Monday-Friday Standard Morning Shift (Rest on Weekends)"
                                  className="p-1 hover:bg-amber-100 rounded text-amber-700 transition-all cursor-pointer grow flex justify-center"
                                >
                                  <Zap className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleClearRow(staff.id)}
                                  title="Reset all assignments back to OFF"
                                  className="p-1 hover:bg-rose-50 rounded text-slate-400 hover:text-rose-600 transition-all cursor-pointer grow flex justify-center"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                        {cycleDates.map((_dKey, dIdx) => {
                          const value = activeCycle.shifts[staff.id]?.[dIdx] || 'OFF';
                          const def = SHIFTS[value];
                          const style = def
                            ? { backgroundColor: def.bg, color: def.fg }
                            : { backgroundColor: '#ffffff', color: '#000000' };

                          const isDraggedOver = draggedOverCell?.staffId === staff.id && draggedOverCell?.dayIdx === dIdx;
                          const isBeingDragged = draggedCell?.staffId === staff.id && draggedCell?.dayIdx === dIdx;

                          return (
                            <td
                              key={dIdx}
                              style={style}
                              draggable={!activeCycle.isLocked}
                              onDragStart={(e) => handleDragStart(e, staff.id, dIdx, value)}
                              onDragOver={(e) => handleDragOver(e, staff.id, dIdx)}
                              onDragLeave={handleDragLeave}
                              onDragEnd={handleDragEnd}
                              onDrop={(e) => handleDrop(e, staff.id, dIdx)}
                              className={`h-12 text-center text-xs font-bold border-r border-gray-100 relative group p-0 transition-all ${
                                !activeCycle.isLocked 
                                  ? 'cursor-grab active:cursor-grabbing hover:shadow-inner hover:brightness-105' 
                                  : ''
                              } ${isBeingDragged ? 'opacity-40 scale-95' : ''}`}
                              title={`${staff.name} • Day ${dIdx + 1}: ${def?.name || value}`}
                            >
                              {/* Visual overlay for dragover */}
                              {isDraggedOver && (
                                <div className="absolute inset-0 bg-[#7A1230]/20 border-2 border-dashed border-[#7A1230] pointer-events-none flex items-center justify-center animate-pulse z-30">
                                  <span className="text-[10px] bg-white text-[#7A1230] px-1 py-0.5 rounded font-black border border-[#7A1230]/30 shadow-sm font-sans">
                                    Drop Shift
                                  </span>
                                </div>
                              )}

                              {/* Grip icon indicator visible on hover */}
                              {!isGridLocked && !isBeingDragged && (
                                <div className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing p-0.5 pointer-events-none transition-opacity select-none z-10">
                                  <GripVertical className="w-2.5 h-2.5 opacity-40" />
                                </div>
                              )}

                              {isGridLocked ? (
                                <div className="w-full h-full flex flex-col justify-center items-center py-1 select-none">
                                  <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-md text-[10px] font-black uppercase shadow-3xs border border-black/5 bg-white/40 tracking-wider" style={{ color: def?.fg }}>
                                    {value}
                                  </span>
                                  <span className="text-[10px] font-mono font-bold mt-1 tracking-tighter uppercase" style={{ color: def?.fg ? `${def.fg}bf` : '#475569' }}>
                                    {(() => {
                                      if (value === 'OFF') return 'Rest';
                                      if (value === 'A') return '08-17';
                                      if (value === 'A+') return '08-18';
                                      if (value === 'B') return '10-19';
                                      if (value === 'C') return '12-21';
                                      if (value === 'D') return '16-Cl';
                                      if (value === 'E') return '11h';
                                      if (value === 'SC') return '18-08';
                                      if (value === 'N') return '20-08';
                                      if (value === 'MD') return 'Mat';
                                      if (value === 'AL') return 'AL 8h';
                                      if (value === 'SL') return 'SL 8h';
                                      if (value === 'CO') return 'CO 8h';
                                      if (value === 'TRN') return 'TRN 8h';
                                      if (value === 'OS') return 'OS 8h';
                                      return def?.hours ? `${def.hours}h` : 'Rest';
                                    })()}
                                  </span>
                                </div>
                              ) : (
                                <>
                                  {editingCell?.staffId === staff.id && editingCell?.dayIdx === dIdx ? (
                                    <select
                                      autoFocus
                                      value={value}
                                      onChange={(e) => {
                                        updateShift(staff.id, dIdx, e.target.value);
                                        setEditingCell(null);
                                      }}
                                      onBlur={() => setEditingCell(null)}
                                      style={{ color: def?.fg }}
                                      className="w-full h-full text-center bg-transparent border-none appearance-none font-mono focus:outline-none focus:ring-1 focus:ring-[#7A1230] cursor-pointer block text-xs font-black relative z-25 bg-white text-gray-900"
                                    >
                                      {Object.keys(SHIFTS).map(code => (
                                        <option key={code} value={code} className="text-gray-900 bg-white text-xs font-sans font-medium text-left">
                                          {code} - {SHIFTS[code].name} ({SHIFTS[code].hours}h)
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <div 
                                      className="w-full h-full flex flex-col justify-center items-center cursor-pointer select-none py-1 group/btn"
                                      onClick={() => setEditingCell({ staffId: staff.id, dayIdx: dIdx })}
                                    >
                                      <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-md text-[10px] font-black uppercase shadow-3xs border border-black/5 bg-white/40 tracking-wider group-hover/btn:scale-105 transition-transform" style={{ color: def?.fg }}>
                                        {value}
                                      </span>
                                      <span className="text-[10px] font-mono font-bold mt-1 tracking-tighter uppercase" style={{ color: def?.fg ? `${def.fg}bf` : '#475569' }}>
                                        {(() => {
                                          if (value === 'OFF') return 'Rest';
                                          if (value === 'A') return '08-17';
                                          if (value === 'A+') return '08-18';
                                          if (value === 'B') return '10-19';
                                          if (value === 'C') return '12-21';
                                          if (value === 'D') return '16-Cl';
                                          if (value === 'E') return '11h';
                                          if (value === 'SC') return '18-08';
                                          if (value === 'N') return '20-08';
                                          if (value === 'MD') return 'Mat';
                                          if (value === 'AL') return 'AL 8h';
                                          if (value === 'SL') return 'SL 8h';
                                          if (value === 'CO') return 'CO 8h';
                                          if (value === 'TRN') return 'TRN 8h';
                                          if (value === 'OS') return 'OS 8h';
                                          return def?.hours ? `${def.hours}h` : 'Rest';
                                        })()}
                                      </span>
                                    </div>
                                  )}
                                </>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Real-time Coverage Heatmap (Manager Only) */}
          {isManagerView && (
            <>
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="bg-[#1f3864] text-white py-3.5 px-5 border-b border-blue-900 flex justify-between items-center">
                  <h3 className="font-sans font-black text-sm tracking-wide uppercase flex items-center gap-2">
                    <Layers className="w-4 h-4 text-sky-400" /> Real-time Shift Coverage Heatmap
                  </h3>
                  <p className="text-[10px] text-blue-200 font-semibold">
                    Automated staffing level checks across key pharmacy stations
                  </p>
                </div>

                <div className="overflow-x-auto relative scrollbar-thin">
                  <table className="min-w-full border-collapse table-fixed">
                    <thead>
                      <tr className="bg-slate-50 border-b border-gray-100">
                        <th className="sticky left-0 bg-slate-50 z-20 w-48 min-w-48 px-4 py-2.5 text-left text-xs font-bold text-slate-500 uppercase border-r border-gray-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                          Shift / Station
                        </th>
                        {cycleDates.map((dKey, dIdx) => {
                          const isWk = isWeekend(dKey);
                          return (
                            <th
                              key={dIdx}
                              className={`w-12 min-w-12 text-center py-1 text-[10px] font-bold border-r border-gray-100 ${
                                isWk ? 'bg-slate-100 text-slate-600' : 'bg-slate-55 text-slate-500'
                              }`}
                            >
                              {parseLocalDate(dKey).getDate()}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {/* Render Heatmap rows for standard station layers */}
                      {['A', 'A+', 'B', 'C', 'D', 'E', 'SC', 'N'].map((code) => {
                        const def = SHIFTS[code];
                        return (
                          <tr key={code} className="border-b border-gray-100 transition-colors hover:bg-slate-55/40">
                            <td className="sticky left-0 bg-white z-10 px-4 py-1.5 border-r border-gray-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] font-bold text-xs uppercase flex flex-col justify-center min-h-[44px]">
                              <span className="text-[#1f3864]" style={{ color: def?.fg }}>
                                {code} — {def?.name}
                              </span>
                              <span className="text-[10px] text-gray-450 font-semibold font-mono">
                                {def?.time.split(' ')[0]}
                              </span>
                            </td>
                            {cycleDates.map((dKey, dIdx) => {
                              const isWknd = isWeekend(dKey);
                              const isPH = isPublicHoliday(dKey, holidays);
                              const isSpecial = isWknd || isPH;
                              const count = getShiftCountByDay(code, dIdx);

                              let cellBg = 'bg-slate-50';
                              let cellText = 'text-gray-400';

                              if (code === 'E') {
                                if (isSpecial) {
                                  if (count === 0) { cellBg = 'bg-red-50'; cellText = 'text-red-700'; }
                                  else if (count === 1) { cellBg = 'bg-emerald-50'; cellText = 'text-emerald-700'; }
                                  else { cellBg = 'bg-amber-50'; cellText = 'text-amber-700'; }
                                } else {
                                  if (count > 0) { cellBg = 'bg-red-50'; cellText = 'text-red-700'; }
                                  else { cellBg = 'bg-slate-50'; cellText = 'text-gray-300'; }
                                }
                              } else if (code === 'SC') {
                                const isLastDOM = parseLocalDate(dKey).getDate() === new Date(parseLocalDate(dKey).getFullYear(), parseLocalDate(dKey).getMonth() + 1, 0).getDate();
                                if (isLastDOM) {
                                  if (count === 0) { cellBg = 'bg-[#f3e5f5]'; cellText = 'text-purple-400'; }
                                  else { cellBg = 'bg-purple-100'; cellText = 'text-purple-800'; }
                                } else {
                                  if (count > 0) { cellBg = 'bg-red-50'; cellText = 'text-red-700'; }
                                  else { cellBg = 'bg-slate-50'; cellText = 'text-gray-300'; }
                                }
                              } else {
                                if (count === 0) {
                                  cellBg = isSpecial ? 'bg-slate-100' : 'bg-slate-50';
                                  cellText = 'text-gray-300';
                                } else if (count < 2) {
                                  cellBg = 'bg-amber-50';
                                  cellText = 'text-amber-800 animate-pulse';
                                } else {
                                  cellBg = 'bg-emerald-50';
                                  cellText = 'text-emerald-800 font-extrabold';
                                }
                              }

                              return (
                                <td
                                  key={dIdx}
                                  className={`h-8 text-center text-xs font-bold border-r border-gray-100 ${cellBg} ${cellText}`}
                                >
                                  {count > 0 ? (code === 'E' && count === 1 ? '✓' : count) : ''}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}

                      {/* Total On Shift Row */}
                      <tr className="bg-slate-800 text-white font-bold border-t border-slate-700">
                        <td className="sticky left-0 bg-slate-800 z-10 px-4 py-2 border-r border-slate-700 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] text-xs text-blue-200">
                          TOTAL ON FLOOR
                        </td>
                        {cycleDates.map((_dKey, dIdx) => {
                          const tot = getTotalOnShiftByDay(dIdx);
                          let cellBg = '';
                          if (tot === 0) cellBg = 'bg-red-900/60';
                          else if (tot <= 2) cellBg = 'bg-amber-900/50';
                          else cellBg = 'bg-emerald-950/40 text-emerald-300';

                          return (
                            <td
                              key={dIdx}
                              className={`h-9 text-center text-xs font-extrabold border-r border-slate-700 ${cellBg}`}
                            >
                              {tot || '—'}
                            </td>
                          );
                        })}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Legend Information Box */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <div className="bg-white p-4.5 rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-2">
                  <h4 className="text-xs font-bold text-gray-700 border-b border-gray-150 pb-2 flex items-center gap-1.5">
                    <span className="w-1.5 h-3 bg-red-500 rounded-sm"></span>
                    Heatmap Color Rules & Analytics
                  </h4>
                  <div className="flex flex-col gap-1.5 text-xs text-slate-600">
                    <div className="flex items-center gap-2"><span className="w-3.5 h-3.5 rounded bg-red-100 border border-red-200 inline-block"></span> <span>Unassigned E on Weekend / PH</span></div>
                    <div className="flex items-center gap-2"><span className="w-3.5 h-3.5 rounded bg-amber-100 border border-amber-250 inline-block"></span> <span>Understaffed Station (&lt; 2 staff)</span></div>
                    <div className="flex items-center gap-2"><span className="w-3.5 h-3.5 rounded bg-emerald-100 border border-emerald-200 inline-block"></span> <span>Fully Covered / Adequate Cover</span></div>
                  </div>
                </div>

                <div className="bg-white p-4.5 rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-2">
                  <h4 className="text-xs font-bold text-gray-700 border-b border-gray-150 pb-2 flex items-center gap-1.5">
                    <span className="w-1.5 h-3 bg-[#7A1230] rounded-sm"></span>
                    Special Shifts & Warns
                  </h4>
                  <div className="flex flex-col gap-1.5 text-xs text-slate-600">
                    <p><strong>SC Shift:</strong> 18:00 – 08:00 Stock Count. Must only be scheduled on the last calendar day of the month.</p>
                    <p><strong>E Shift:</strong> 11-hour weekend specialty shift designed to rotate fairly among pharmacists.</p>
                  </div>
                </div>

                <div className="bg-white p-4.5 rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-2">
                  <h4 className="text-xs font-bold text-gray-700 border-b border-gray-150 pb-2 flex items-center gap-1.5">
                    <span className="w-1.5 h-3 bg-blue-500 rounded-sm"></span>
                    Zambian Labor Compliance
                  </h4>
                  <div className="flex flex-col gap-1.5 text-xs text-[#5D4037]">
                    <p><strong>Mother's Day:</strong> One paid day off per cycle is automatically mandated for female staff, restricted to mid-week.</p>
                    <p><strong>Contracted Cap:</strong> Normal target is 168 hours. Overtime is tracked automatically and highlighted in real-time.</p>
                  </div>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* History Archive & Comparison Portal */}
      {activeTab === 'history' && (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Col 1 & 2: Archived Cycles and Snapshots */}
            <div className="lg:col-span-2 flex flex-col gap-6">
              {/* Create Snapshot Card */}
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                <h3 className="text-slate-900 font-black text-sm mb-2.5 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-500 animate-pulse" /> Archive Current Roster Snapshot
                </h3>
                <p className="text-xs text-slate-550 mb-4 leading-relaxed">
                  Lock and save a frozen, read-only copy of the current active roster to store in the Firestore database. 
                  This is perfect for historical compliance audits, shift variance checks, and multi-version draft comparison.
                </p>

                <form onSubmit={handleCreateSnapshot} className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-gray-500">Snapshot Label / Version</label>
                    <input
                      type="text"
                      placeholder="e.g. Mid-June Backup V1"
                      value={snapshotName}
                      onChange={e => setSnapshotName(e.target.value)}
                      className="px-3 py-2 text-xs border border-gray-250 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#7A1230] bg-[#fdfdfd] text-gray-900 font-semibold shadow-xs"
                      required
                    />
                  </div>
                  
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-gray-500">Cycle Start Date</label>
                    <input
                      type="date"
                      value={snapshotStartDate}
                      onChange={e => setSnapshotStartDate(e.target.value)}
                      className="px-3 py-2 text-xs border border-gray-250 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#7A1230] bg-[#fdfdfd] text-gray-900 font-mono shadow-xs"
                      required
                    />
                  </div>

                  <div className="flex flex-col gap-1 justify-end">
                    <button
                      type="submit"
                      className="w-full flex items-center justify-center gap-1.5 px-4 py-2 bg-[#7A1230] hover:bg-[#5C0D24] text-white rounded-xl font-bold text-xs transition-all cursor-pointer shadow-sm md:h-10 border border-transparent hover:border-[#E29E25]/20"
                    >
                      <Clipboard className="w-3.5 h-3.5" /> Archive Roster snapshot
                    </button>
                  </div>
                </form>
              </div>

              {/* List of Previous Cycles */}
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-4">
                <div className="flex justify-between items-center border-b border-gray-105 pb-3">
                  <h3 className="text-slate-900 font-black text-sm flex items-center gap-2">
                    <CalendarRange className="w-4 h-4 text-indigo-500 animate-pulse" /> Archived & Previous Cycles
                  </h3>
                  <button
                    onClick={loadHistoryCycles}
                    className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-800 transition-all cursor-pointer border border-slate-100 bg-white shadow-xs"
                    title="Refresh lists"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingHistory ? 'animate-spin' : ''}`} />
                  </button>
                </div>

                {isLoadingHistory ? (
                  <div className="text-center py-12 text-xs text-slate-400 font-medium">
                    Loading archived roster datasets from FireStore...
                  </div>
                ) : historyCycles.length === 0 ? (
                  <div className="text-center py-12 text-xs text-slate-400 font-medium border border-dashed border-gray-200 rounded-2xl bg-slate-50/40 px-4">
                    <span className="text-lg block mb-1">🗄️</span>
                    No secondary snapshots registered. Archive your first draft cycle using the module above!
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {historyCycles.map(cycle => {
                      const isSelected = selectedHistoryCycle?.id === cycle.id;
                      const totalScheduled = Object.values(cycle.shifts).flat().filter(code => code !== 'OFF').length;

                      return (
                        <div
                          key={cycle.id}
                          className={`p-4 rounded-xl border transition-all flex flex-col gap-2.5 relative ${
                            isSelected 
                              ? 'border-indigo-500 bg-indigo-50/10 shadow-xs' 
                              : 'border-gray-200 hover:border-indigo-400 bg-white'
                          }`}
                        >
                          <div className="flex justify-between items-start gap-2">
                            <div className="flex flex-col max-w-[85%]">
                              <span className="text-xs font-extrabold text-indigo-950 font-mono break-all pr-5">
                                {cycle.id.replace(/^cycle-[^-]+-/, '')}
                              </span>
                              <span className="text-[10px] text-slate-400 font-semibold mt-0.5">
                                Range: {cycle.startDate} to {cycle.endDate}
                              </span>
                            </div>
                            <button
                              onClick={() => handleDeleteSnapshot(cycle.id)}
                              className="text-slate-400 hover:text-red-600 transition-colors absolute top-3.5 right-3.5 p-1 rounded-lg hover:bg-rose-50"
                              title="Delete permanently"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1 pt-2 border-t border-gray-100">
                            <span>Assigned Shifts: <strong>{totalScheduled}</strong></span>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-tight ${
                              cycle.isLocked ? 'bg-red-50 text-red-700 border border-red-100' : 'bg-slate-50 text-slate-500 border border-slate-100'
                            }`}>
                              {cycle.isLocked ? 'Published' : 'Draft'}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-2 mt-1.5 font-sans">
                            <button
                              onClick={() => setSelectedHistoryCycle(cycle)}
                              className={`px-3 py-1.5 rounded-lg font-bold text-[11px] transition-all cursor-pointer border ${
                                isSelected
                                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                  : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-100'
                              }`}
                            >
                              {isSelected ? '✓ Selected' : '📊 Compare'}
                            </button>

                            {restoreCycle && (
                              <button
                                onClick={async () => {
                                  if (await confirm({ title: 'Restore this roster?', message: `Replaces the active grid with the saved shifts from '${cycle.id}'.`, confirmLabel: 'Restore' })) {
                                    restoreCycle(cycle);
                                    triggerFeedback('Roster cycle restored.');
                                    setActiveTab2('grid');
                                  }
                                }}
                                className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-100 rounded-lg font-bold text-[11px] transition-all cursor-pointer"
                              >
                                ⏪ Overwrite Active
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Col 3: Comparison Summary Stats */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-4">
              <h3 className="text-slate-900 font-black text-sm pb-2 border-b border-gray-105 flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-emerald-500 animate-pulse" /> Live Analysis Hub
              </h3>

              {!selectedHistoryCycle ? (
                <div className="text-center py-16 px-4 text-xs text-slate-400 font-medium flex flex-col items-center gap-3">
                  <span className="text-2xl animate-pulse">📊</span>
                  <span>Select any archived snapshot from the grid list to perform an automatic discrepancy inspection.</span>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <div className="p-3.5 bg-indigo-50/40 rounded-xl border border-indigo-100 text-xs flex flex-col gap-1">
                    <div className="font-extrabold text-indigo-950 uppercase text-[11px] tracking-wider">Comparing Active with:</div>
                    <div className="font-mono font-bold text-slate-800 break-all">{selectedHistoryCycle.id.replace(/^cycle-[^-]+-/, '')}</div>
                    <div className="text-[10px] text-slate-400 font-semibold mt-0.5">Dates: {selectedHistoryCycle.startDate} to {selectedHistoryCycle.endDate}</div>
                  </div>

                  {(() => {
                    const discrepancies = getDiscrepancies(selectedHistoryCycle);
                    const totalSlots = staffList.length * cycleDates.length;
                    const matchCount = totalSlots - discrepancies.length;
                    const matchPercent = Math.max(0, Math.min(100, Math.round((matchCount / totalSlots) * 100)));

                    return (
                      <div className="flex flex-col gap-4.5">
                        {/* Visual Progress Meter */}
                        <div className="flex flex-col gap-1.5">
                          <div className="flex justify-between items-center text-xs font-bold text-slate-700">
                            <span>Compliance Match Score</span>
                            <span className="text-emerald-700 font-black">{matchPercent}% Same</span>
                          </div>
                          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-200">
                            <div 
                              className={`h-full rounded-full transition-all ${
                                matchPercent > 90 ? 'bg-emerald-500' : matchPercent > 50 ? 'bg-amber-400' : 'bg-rose-500'
                              }`}
                              style={{ width: `${matchPercent}%` }}
                            ></div>
                          </div>
                        </div>

                        {/* Metric Summaries / Counts */}
                        <div className="grid grid-cols-2 gap-3.5">
                          <div className="bg-slate-50 p-3 rounded-xl border border-slate-150 text-center">
                            <div className="text-[11px] font-black text-slate-500">Mismatch Count</div>
                            <div className="text-lg font-black text-rose-700 mt-0.5">{discrepancies.length}</div>
                          </div>
                          <div className="bg-slate-50 p-3 rounded-xl border border-slate-150 text-center">
                            <div className="text-[11px] font-black text-slate-500">Identical Slots</div>
                            <div className="text-lg font-black text-emerald-700 mt-0.5">{matchCount}</div>
                          </div>
                        </div>

                        {/* List of cell discrepancies */}
                        <div className="flex flex-col gap-2">
                          <h4 className="text-[10px] font-extrabold uppercase text-slate-500 tracking-wider">Mismatch Audit Log</h4>
                          
                          {discrepancies.length === 0 ? (
                            <p className="text-[11px] text-emerald-700 font-bold bg-emerald-50 p-3 rounded-xl border border-emerald-100 text-center">
                              ✓ Perfect correlation! Both rosters match 100% cell-by-cell.
                            </p>
                          ) : (
                            <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-xl bg-white flex flex-col divide-y divide-gray-100 scrollbar-thin">
                              {discrepancies.slice(0, 50).map((diff, dIdx) => (
                                <div key={dIdx} className="p-2.5 text-[11px] flex justify-between items-center hover:bg-slate-50 transition-colors">
                                  <div className="flex flex-col gap-0.5">
                                    <span className="font-bold text-slate-800">{diff.staffName}</span>
                                    <span className="text-[11px] text-slate-400 font-mono">
                                      Day {diff.dayIdx + 1} ({parseLocalDate(diff.dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })})
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <span className="px-1.5 py-0.5 rounded font-mono text-[11px] font-black border border-slate-200 bg-slate-50 text-slate-500" title="Active">
                                      {diff.activeShift}
                                    </span>
                                    <span className="text-slate-300">➔</span>
                                    <span className="px-1.5 py-0.5 rounded font-mono text-[11px] font-black border border-indigo-150 bg-indigo-50/50 text-indigo-700" title="Historical Snapshot">
                                      {diff.historyShift}
                                    </span>
                                  </div>
                                </div>
                              ))}
                              {discrepancies.length > 50 && (
                                <div className="p-2 text-center text-[10px] text-slate-400 bg-slate-50 font-bold border-t border-gray-100">
                                  + {discrepancies.length - 50} other changes hidden
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>

          {/* Cell-Level Side-By-Side Mismatch Highlight Matrix */}
          {selectedHistoryCycle && (
            <div className="bg-white rounded-2xl shadow-sm border border-indigo-100 overflow-hidden mt-2">
              <div className="bg-indigo-950 text-white py-3 px-5 border-b border-indigo-900 flex justify-between items-center flex-wrap gap-2">
                <h3 className="font-sans font-black text-sm tracking-wide uppercase flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-300" /> Interactive Mismatch Highlighting Matrix
                </h3>
                <span className="text-[10px] bg-indigo-800 text-indigo-100 rounded-full px-3 py-0.5 font-bold border border-indigo-700">
                  Matrix: Active Draft vs {selectedHistoryCycle.id.replace(/^cycle-[^-]+-/, '')}
                </span>
              </div>

              <div className="overflow-x-auto relative scrollbar-thin">
                <table className="min-w-full border-collapse table-fixed select-none text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-gray-150">
                      <th className="sticky left-0 bg-slate-50 z-20 w-48 min-w-48 px-4 py-3 border-r border-gray-150 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] font-bold text-slate-500 uppercase text-left tracking-wider">
                        Personnel
                      </th>
                      {cycleDates.map((dKey, dIdx) => (
                        <th key={dKey} className="w-12 min-w-12 text-center py-2.5 border-r border-gray-105 font-mono font-bold text-slate-400 bg-slate-100/50">
                          {parseLocalDate(dKey).getDate()}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {staffList.map((staff, sIdx) => {
                      const isEven = sIdx % 2 === 0;
                      return (
                        <tr key={staff.id} className={`border-b border-slate-100 transition-colors ${isEven ? 'bg-slate-50/10' : 'bg-white'}`}>
                          <td className="sticky left-0 bg-white z-10 px-4 py-3 border-r border-gray-150 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] font-bold text-gray-850">
                            {staff.name}
                          </td>
                          {cycleDates.map((_dKey, dIdx) => {
                            const activeVal = activeCycle.shifts[staff.id]?.[dIdx] || 'OFF';
                            const historyVal = selectedHistoryCycle.shifts[staff.id]?.[dIdx] || 'OFF';
                            const isMatch = activeVal === historyVal;

                            return (
                              <td
                                key={dIdx}
                                className={`h-12 text-center font-mono font-black text-xs border-r border-gray-100 transition-colors ${
                                  isMatch 
                                    ? 'bg-emerald-50/15 text-emerald-800/40' 
                                    : 'bg-rose-50 border-y border-rose-200 text-rose-800'
                                }`}
                              >
                                {isMatch ? (
                                  <span>{activeVal}</span>
                                ) : (
                                  <div className="flex flex-col justify-center h-full text-[11px] leading-tight">
                                    <span className="text-slate-400 line-through font-medium" title="Historical Snapshot Value">{historyVal}</span>
                                    <span className="text-rose-700 font-black" title="Current Active Value">{activeVal}</span>
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
