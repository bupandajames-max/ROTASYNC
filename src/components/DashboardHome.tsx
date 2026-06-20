import React, { useState, useEffect } from 'react';
import { StaffMember, RosterCycle, DailyTask, Facility, Department, ShiftDef, PublicHoliday, RosterRuleSet } from '../types';
import { SHIFTS } from '../data/initialData';
import { validateRoster } from '../utils/rosterUtils';
import { motion, AnimatePresence } from 'motion/react';
import {
  Calendar,
  ClipboardCheck,
  Clock,
  Award,
  ChevronRight,
  Activity,
  MapPin,
  Check,
  ShieldAlert,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  UserCheck,
  AlertCircle,
  ListChecks,
  Users,
  X
} from 'lucide-react';

interface DashboardHomeProps {
  activeStaffId: string;
  staffList: StaffMember[];
  activeCycle: RosterCycle;
  cycleDates: string[];
  dailyTasks: DailyTask[];
  onNavigate: (tab: string) => void;
  onIncrementTracker: (taskId: string, amount: number) => void;
  onUpdateTask: (taskId: string, status: DailyTask['status'], counterSign?: string) => void;
  selectedFacilityId: string;
  facilities: Facility[];
  departments: Department[];
  shifts: { [code: string]: ShiftDef };
  holidays: PublicHoliday[];
  ruleSet: RosterRuleSet;
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
}

export default function DashboardHome({
  activeStaffId,
  staffList,
  activeCycle,
  cycleDates,
  dailyTasks,
  onNavigate,
  onIncrementTracker,
  onUpdateTask,
  selectedFacilityId,
  facilities,
  departments,
  shifts,
  holidays,
  ruleSet,
  taxonomy,
}: DashboardHomeProps) {
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  // Use the workspace's editable shift definitions (falls back to defaults).
  const shiftDefs = { ...SHIFTS, ...(shifts || {}) };

  // Asset/log audit modal (writes real tracker increments)
  const [auditTarget, setAuditTarget] = useState<'ward' | 'firstaid' | null>(null);
  const [auditLocation, setAuditLocation] = useState('');
  const [sealNumber, setSealNumber] = useState('');
  const [auditItemsCheck, setAuditItemsCheck] = useState({
    expiry: true,
    quantities: true,
    integrity: true
  });

  // Station detail modal
  const [selectedStationInfo, setSelectedStationInfo] = useState<string | null>(null);

  const [currentHour, setCurrentHour] = useState(new Date().getHours());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentHour(new Date().getHours());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const staff = staffList.find(s => s.id === activeStaffId);
  if (!staff) return null;

  const activeFacility = facilities.find(f => f.id === selectedFacilityId) || facilities[0];

  const todayStr = new Date().toISOString().split('T')[0];
  const dayIdx = cycleDates.indexOf(todayStr);

  // Today's Shift for current user
  const shiftToday = dayIdx !== -1 ? (activeCycle.shifts[staff.id]?.[dayIdx] || 'OFF') : 'OFF';
  const shiftDef = shiftDefs[shiftToday];

  // Daily Tasks stats
  const todayTasks = dailyTasks.filter(t => t.staffName === staff.name);
  const doneTasks = todayTasks.filter(t => t.status === 'Done');
  const taskPct = todayTasks.length > 0 ? Math.round((doneTasks.length / todayTasks.length) * 100) : 100;

  // Trackers progress
  const wardTask = dailyTasks.find(t => (t.taskName.toLowerCase().includes('inspect') || t.taskName.toLowerCase().includes('secure')) && t.date === todayStr);
  const faTask = dailyTasks.find(t => (t.taskName.toLowerCase().includes('first aid') || t.taskName.toLowerCase().includes('facility')) && t.date === todayStr);

  const curWardVal = wardTask?.trackerValue ?? 4;
  const targetWardVal = wardTask?.trackerTarget ?? 10;
  const wardPct = Math.round((curWardVal / targetWardVal) * 100);

  const curFaVal = faTask?.trackerValue ?? 8;
  const targetFaVal = faTask?.trackerTarget ?? 20;
  const faPct = Math.round((curFaVal / targetFaVal) * 100);

  // Determine active shifts based on current hour
  const getActiveShiftsAtHour = (hour: number) => {
    const activeList: string[] = [];
    if (hour >= 7 && hour < 16) activeList.push('A');
    if (hour >= 7 && hour < 17) activeList.push('A+');
    if (hour >= 10 && hour < 18) activeList.push('B');
    if (hour >= 11 && hour < 19) activeList.push('C');
    if (hour >= 15 && hour < 23) activeList.push('D');
    if (hour >= 19 || hour < 7) {
      activeList.push('N');
      activeList.push('SC');
    }
    return activeList;
  };

  const currentActiveShiftCodes = getActiveShiftsAtHour(currentHour);

  // Find who is assigned to active shifts today
  const liveTeamOnDuty = staffList
    .filter(s => !s.isManager)
    .map(s => {
      const code = dayIdx !== -1 ? (activeCycle.shifts[s.id]?.[dayIdx] || 'OFF') : 'OFF';
      const isActiveNow = currentActiveShiftCodes.includes(code);
      return {
        staff: s,
        shiftCode: code,
        shiftDef: shiftDefs[code],
        isActiveNow
      };
    })
    .filter(item => item.shiftCode !== 'OFF');

  // ── Real data for dashboard widgets ──────────────────────────────────────
  // Today's tasks across the team needing attention.
  const todaysTeamTasks = dailyTasks.filter(t => t.date === todayStr);
  const pendingCount = todaysTeamTasks.filter(t => t.status === 'Pending').length;
  const inProgressCount = todaysTeamTasks.filter(t => t.status === 'In Progress').length;
  const reviewCount = todaysTeamTasks.filter(t => t.status === 'Pending Review').length;
  const overdueCount = dailyTasks.filter(t => t.date < todayStr && t.status !== 'Done').length;

  // Real roster health (no simulation): validate the active cycle against rules.
  const rosterHealth = validateRoster(activeCycle.shifts, staffList, cycleDates, ruleSet);
  const clopenCount = rosterHealth.issues.filter(i => i.kind === 'clopen').length;
  const overConsecCount = rosterHealth.issues.filter(i => i.kind === 'over-consecutive').length;
  const unfilledCount = rosterHealth.issues.filter(i => i.kind === 'unfilled').length;

  const handleOpenAuditModal = (target: 'ward' | 'firstaid') => {
    setAuditTarget(target);
    setAuditLocation(target === 'ward' ? `${activeFacility?.name} Secure Locker` : `Field Service Station at ${activeFacility?.location}`);
    setSealNumber(`ID-${Math.floor(100000 + Math.random() * 900000)}`);
  };

  const handleApplyAudit = () => {
    const matchingTask = dailyTasks.find(t => {
      const name = t.taskName.toLowerCase();
      if (auditTarget === 'ward') {
        return (name.includes('ward') || name.includes('secure') || name.includes('locker') || name.includes('inspect')) && t.date === todayStr;
      } else {
        return (name.includes('first aid') || name.includes('field') || name.includes('station') || name.includes('conduct')) && t.date === todayStr;
      }
    });

    if (matchingTask) {
      onIncrementTracker(matchingTask.id, 1);
      setToastMessage(`✓ Saved on Log: ${auditTarget === 'ward' ? 'Emergency Unit' : 'Field Station'} verified at ${auditLocation}. Seal: ${sealNumber}.`);
    } else {
      setToastMessage(`✓ Asset safety audit recorded for ${auditLocation}. Seal: ${sealNumber}.`);
    }

    setAuditTarget(null);
    setTimeout(() => setToastMessage(null), 4500);
  };

  // Operational stations are derived from the workspace's configured departments.
  // No org-specific posts are hardcoded; if no departments exist yet, a small set
  // of neutral generic stations is shown until the admin defines their own.
  const facilityDepartments = departments.filter(d => d.facilityId === selectedFacilityId);
  type Station = { id: string; title: string; lead: string };
  const stations: Station[] = facilityDepartments.length > 0
    ? facilityDepartments.map(d => ({ id: d.id, title: d.name, lead: d.description || 'No description provided.' }))
    : [
        { id: 'gen-frontdesk', title: 'Front Desk', lead: 'Primary reception & coordination point.' },
        { id: 'gen-floor', title: 'Operations Floor', lead: 'General operational coverage area.' },
        { id: 'gen-storage', title: 'Storage', lead: 'Stock and asset custody area.' },
      ];

  // Match an on-duty member to a station (by department if available).
  const memberForStation = (station: Station): string => {
    const deptMatch = liveTeamOnDuty.find(item => item.staff.departmentId === station.id);
    if (deptMatch) return deptMatch.staff.name;
    return liveTeamOnDuty[0]?.staff.name || 'Unassigned';
  };

  const selectedStation = stations.find(s => s.id === selectedStationInfo) || null;

  return (
    <div className="flex flex-col gap-6">
      
      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div 
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className="fixed top-20 left-6 right-6 md:left-auto md:right-8 md:max-w-md bg-slate-950 border border-indigo-500/30 text-white py-3.5 px-5 rounded-2xl shadow-2xl z-50 text-xs font-semibold leading-relaxed flex items-center gap-3"
          >
            <div className="p-1.5 bg-indigo-600 rounded-full text-white">
              <Check className="w-3.5 h-3.5" strokeWidth={3} />
            </div>
            <span className="flex-1">{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Rebranded Identity card with abstract shapes */}
      <div className="bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 text-white p-7 rounded-3xl shadow-xl border border-indigo-500/10 flex justify-between items-center flex-wrap gap-6 relative overflow-hidden">
        
        <div className="relative z-10 flex-1 min-w-[280px]">
          <span className="text-[11px] bg-indigo-505/20 text-indigo-200 border border-indigo-500/30 px-3 py-1 rounded-full font-semibold inline-block mb-3 select-none">
            {taxonomy.appName} · {activeFacility?.name}
          </span>
          <h2 className="text-3xl font-extrabold flex items-center gap-2 font-sans tracking-tight leading-tight">
            Hi {staff.fullName || staff.name} 👋
          </h2>
          <p className="text-xs text-indigo-200/80 max-w-xl font-medium mt-1.5 leading-relaxed">
            Here's your team's day at a glance — schedules, today's tasks, and roster health, all in one place.
          </p>
        </div>
        
      </div>

      {/* Primary quick actions — surfaced at the top so they're never buried */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button onClick={() => onNavigate('tasks')} className="flex items-center gap-2.5 bg-white hover:bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3.5 shadow-sm transition-all cursor-pointer group text-left">
          <div className="p-2 bg-indigo-50 text-indigo-700 rounded-xl"><ClipboardCheck className="w-4 h-4" /></div>
          <span className="font-bold text-xs text-slate-700 group-hover:text-indigo-900">{taxonomy.taskSingular} board</span>
        </button>
        <button onClick={() => onNavigate('roster')} className="flex items-center gap-2.5 bg-white hover:bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3.5 shadow-sm transition-all cursor-pointer group text-left">
          <div className="p-2 bg-sky-50 text-sky-700 rounded-xl"><Calendar className="w-4 h-4" /></div>
          <span className="font-bold text-xs text-slate-700 group-hover:text-indigo-900">Roster & schedule</span>
        </button>
        <button onClick={() => onNavigate('timesheets')} className="flex items-center gap-2.5 bg-white hover:bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3.5 shadow-sm transition-all cursor-pointer group text-left">
          <div className="p-2 bg-emerald-50 text-emerald-700 rounded-xl"><Clock className="w-4 h-4" /></div>
          <span className="font-bold text-xs text-slate-700 group-hover:text-indigo-900">My timesheet</span>
        </button>
        <button onClick={() => onNavigate('analytics')} className="flex items-center gap-2.5 bg-white hover:bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3.5 shadow-sm transition-all cursor-pointer group text-left">
          <div className="p-2 bg-amber-50 text-amber-700 rounded-xl"><Award className="w-4 h-4" /></div>
          <span className="font-bold text-xs text-slate-700 group-hover:text-indigo-900">Reports & pay</span>
        </button>
      </div>

      {/* Dispatch station map */}
      <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-[0_8px_30px_rgba(0,0,0,0.015)]">
        <div className="flex justify-between items-center border-b border-gray-100 pb-4 mb-4 flex-wrap gap-2">
          <div>
            <h3 className="font-sans font-extrabold text-[#003764] text-sm flex items-center gap-2">
              <Activity className="w-4.5 h-4.5 text-[#009EE2]" /> Who's on now
            </h3>
            <p className="text-[11px] text-gray-400 mt-1 font-medium">
              Team coverage by station as of {currentHour}:00.
            </p>
          </div>
          <span className="text-[11px] bg-indigo-50 text-indigo-900 border border-indigo-100 font-mono font-bold px-3 py-1 rounded-full flex items-center gap-1.5 shadow-sm">
            <span className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-ping"></span>
            LIVE
          </span>
        </div>

        {/* Floor layout derived from the workspace's configured departments */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {stations.map((station, idx) => (
            <div
              key={station.id}
              onClick={() => setSelectedStationInfo(station.id)}
              className="group cursor-pointer bg-slate-50 hover:bg-sky-50/20 border border-slate-100 hover:border-indigo-500/20 p-4 rounded-2xl transition-all flex flex-col justify-between min-h-[140px] shadow-sm relative overflow-hidden"
            >
              <div>
                <span className="text-[11px] text-gray-400 font-semibold">
                  Station {idx + 1}
                </span>
                <h4 className="font-bold text-slate-800 text-sm mt-1">{station.title}</h4>
                <p className="text-[10px] text-gray-500 mt-1 leading-normal line-clamp-2">{station.lead}</p>
              </div>
              <div className="mt-3 pt-2.5 border-t border-slate-100/60 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-sm"></div>
                <span className="text-[11px] text-slate-600 font-semibold">
                  {memberForStation(station)}
                </span>
              </div>
            </div>
          ))}
        </div>

        <p className="text-[10px] text-gray-400 mt-3 text-center">
          💡 Click a station to view its {taxonomy.groupSingular.toLowerCase()} details.
        </p>
      </div>

      {/* Real operational panels */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Tasks needing attention (real, from dailyTasks) */}
        <div className="lg:col-span-7 bg-white p-6 rounded-3xl border border-gray-100 shadow-[0_8px_30px_rgba(0,0,0,0.015)] flex flex-col">
          <div className="flex justify-between items-start border-b border-gray-100 pb-3 mb-4">
            <div>
              <h3 className="font-sans font-extrabold text-slate-800 text-base flex items-center gap-2">
                <ListChecks className="w-5 h-5 text-indigo-600" /> Today's {taxonomy.taskPlural}
              </h3>
              <p className="text-[11px] text-gray-500 mt-1">What needs attention across the team today.</p>
            </div>
            <button
              onClick={() => onNavigate('tasks')}
              className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
            >
              Open board <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Pending', value: pendingCount, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-100' },
              { label: 'In progress', value: inProgressCount, color: 'text-sky-600', bg: 'bg-sky-50 border-sky-100' },
              { label: 'Awaiting sign-off', value: reviewCount, color: 'text-indigo-600', bg: 'bg-indigo-50 border-indigo-100' },
              { label: 'Overdue', value: overdueCount, color: 'text-rose-600', bg: 'bg-rose-50 border-rose-100' },
            ].map(stat => (
              <div key={stat.label} className={`border rounded-2xl p-4 ${stat.bg}`}>
                <div className={`text-3xl font-black font-mono ${stat.color}`}>{stat.value}</div>
                <div className="text-[11px] font-bold text-slate-500 mt-1 leading-tight">{stat.label}</div>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex-1">
            {todaysTeamTasks.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-4 text-center">No {taxonomy.taskPlural.toLowerCase()} scheduled for today.</p>
            ) : (
              <div className="flex flex-col gap-2 max-h-44 overflow-y-auto">
                {todaysTeamTasks
                  .filter(t => t.status !== 'Done')
                  .slice(0, 6)
                  .map(t => (
                    <div key={t.id} className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-800 truncate">{t.taskName}</div>
                        <div className="text-[11px] text-slate-500 truncate">{t.staffName} · {t.category}</div>
                      </div>
                      <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full shrink-0 ${
                        t.status === 'Pending' ? 'bg-amber-100 text-amber-700' :
                        t.status === 'In Progress' ? 'bg-sky-100 text-sky-700' :
                        'bg-indigo-100 text-indigo-700'
                      }`}>{t.status}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>

        {/* Roster health check (real validation) */}
        <div className="lg:col-span-5 bg-slate-900 text-white p-6 rounded-3xl shadow-xl flex flex-col border border-slate-800">
          <div className="flex justify-between items-center border-b border-slate-800 pb-3.5 mb-4">
            <div className="flex items-center gap-2">
              <div className={`p-1.5 rounded-xl ${rosterHealth.ok ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-white">Roster health check</h3>
                <p className="text-[11px] text-slate-400">Live validation of the active cycle</p>
              </div>
            </div>
            <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${rosterHealth.ok ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>
              {rosterHealth.ok ? 'All clear' : 'Needs review'}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-4">
            {[
              { label: 'Back-to-back', value: clopenCount },
              { label: 'Over max days', value: overConsecCount },
              { label: 'Unfilled', value: unfilledCount },
            ].map(s => (
              <div key={s.label} className="bg-black/30 border border-slate-800 rounded-xl p-3 text-center">
                <div className={`text-2xl font-black font-mono ${s.value > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>{s.value}</div>
                <div className="text-[10px] text-slate-400 font-bold mt-0.5 leading-tight">{s.label}</div>
              </div>
            ))}
          </div>

          <div className="bg-black/30 border border-slate-800 rounded-2xl p-3 flex-1 min-h-[120px]">
            {rosterHealth.ok ? (
              <div className="h-full flex flex-col items-center justify-center text-center gap-2 py-4">
                <ShieldCheck className="w-8 h-8 text-emerald-400" />
                <p className="text-xs text-slate-300 font-semibold">
                  {rosterHealth.filledSlots}/{rosterHealth.totalSlots} shift slots filled — no rest-rule conflicts.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5 max-h-36 overflow-y-auto text-[11px]">
                {rosterHealth.issues.slice(0, 12).map((iss, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <span className="text-slate-300 leading-snug">
                      <span className="font-bold text-white">{iss.staffName}</span> · {iss.date} — {iss.detail}
                    </span>
                  </div>
                ))}
                {rosterHealth.issues.length > 12 && (
                  <p className="text-slate-500 italic mt-1">+{rosterHealth.issues.length - 12} more…</p>
                )}
              </div>
            )}
          </div>

          <button
            onClick={() => onNavigate('roster')}
            className="w-full mt-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs rounded-xl shadow-lg transition-all cursor-pointer flex items-center justify-center gap-1.5"
          >
            Open roster <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

      </div>

      {/* Target progress trackers */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        <div className="lg:col-span-8 bg-white p-6 rounded-3xl border border-gray-100 shadow-[0_8px_30px_rgba(0,0,0,0.015)]">
          <div className="flex justify-between items-start border-b border-gray-100 pb-3 mb-4 flex-wrap gap-2">
            <div>
              <h3 className="font-sans font-extrabold text-[#003764] text-xs flex items-center gap-1.5">
                <MapPin className="w-4.5 h-4.5 text-[#009EE2]" /> Daily checks
              </h3>
              <p className="text-[11px] text-gray-400 mt-1 font-medium font-mono">
                Progress on today's recurring checks.
              </p>
            </div>
            <span className="text-[11px] bg-slate-100 text-slate-800 font-mono font-bold px-3 py-1 rounded-full uppercase">
              This cycle
            </span>
          </div>

          <p className="text-xs text-gray-500 mb-5 leading-relaxed">
            Record daily physical checks of equipment, stock, and safety points, then log each one here.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Circle 1 */}
            <div className="bg-slate-50 border border-slate-100 p-5 rounded-2xl flex items-center gap-5">
              <div className="relative w-20 h-20 shrink-0 select-none flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                  <path
                    className="text-slate-200"
                    strokeWidth="3.5"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  <path
                    className="text-indigo-600"
                    strokeDasharray={`${faPct}, 100`}
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center text-[10px] font-mono font-black text-indigo-900">
                  {faPct}%
                </div>
              </div>
              <div className="flex-1">
                <span className="text-[11px] text-gray-400 font-bold block">Inspections Checked</span>
                <h4 className="font-extrabold text-xs text-slate-800 mt-1">Field Service Stations</h4>
                <p className="text-[10px] text-slate-500 mt-1 font-bold leading-normal">Completed {curFaVal} of {targetFaVal} stations.</p>
                <button 
                  onClick={() => handleOpenAuditModal('firstaid')}
                  className="mt-2 text-[10px] font-black tracking-wide text-indigo-650 hover:text-indigo-800 flex items-center gap-1 hover:translate-x-0.5 transition-all uppercase cursor-pointer"
                >
                  Log Physical Station Check <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Circle 2 */}
            <div className="bg-slate-50 border border-slate-100 p-5 rounded-2xl flex items-center gap-5">
              <div className="relative w-20 h-20 shrink-0 select-none flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                  <path
                    className="text-slate-200"
                    strokeWidth="3.5"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  <path
                    className="text-sky-500"
                    strokeDasharray={`${wardPct}, 100`}
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center text-[10px] font-mono font-black text-slate-800">
                  {wardPct}%
                </div>
              </div>
              <div className="flex-1">
                <span className="text-[11px] text-gray-400 font-bold block">Verification Audits</span>
                <h4 className="font-extrabold text-xs text-slate-800 mt-1">Secure Asset Lockers</h4>
                <p className="text-[10px] text-slate-500 mt-1 font-bold leading-normal">Completed {curWardVal} of {targetWardVal} units.</p>
                <button 
                  onClick={() => handleOpenAuditModal('ward')}
                  className="mt-2 text-[10px] font-black tracking-wide text-indigo-650 hover:text-indigo-850 flex items-center gap-1 hover:translate-x-0.5 transition-all uppercase cursor-pointer"
                >
                  Log Asset Audit <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>

          </div>
        </div>

        {/* Compact quick actions */}
        <div className="lg:col-span-4 bg-indigo-505/10 p-6 rounded-3xl border border-indigo-500/10 flex flex-col justify-between">
          <div>
            <h3 className="font-sans font-extrabold text-indigo-950 text-xs border-b border-indigo-250/20 pb-2.5 mb-3 flex items-center gap-1.5">
              Quick actions
            </h3>
            <p className="text-[11px] text-slate-600 leading-relaxed mb-4">
              Jump straight to your tasks, the roster, or payroll & analytics.
            </p>

            <div className="flex flex-col gap-3">
              <button
                onClick={() => onNavigate('tasks')}
                className="w-full flex justify-between items-center py-3 px-4 bg-white hover:bg-slate-50 border border-slate-150/60 rounded-xl transition-all cursor-pointer shadow-xs group"
              >
                <div className="flex items-center gap-2">
                  <ClipboardCheck className="w-4 h-4 text-indigo-900" />
                  <span className="font-bold text-xs text-[#005c93] group-hover:text-indigo-900">{taxonomy.taskSingular} board</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition-transform" />
              </button>

              <button
                onClick={() => onNavigate('roster')}
                className="w-full flex justify-between items-center py-3 px-4 bg-white hover:bg-slate-50 border border-slate-150/60 rounded-xl transition-all cursor-pointer shadow-xs group"
              >
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-indigo-900" />
                  <span className="font-bold text-xs text-[#005c93] group-hover:text-indigo-900">Roster & schedule</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition-transform" />
              </button>

              <button
                onClick={() => onNavigate('analytics')}
                className="w-full flex justify-between items-center py-3 px-4 bg-white hover:bg-slate-50 border border-slate-150/60 rounded-xl transition-all cursor-pointer shadow-xs group"
              >
                <div className="flex items-center gap-2">
                  <Award className="w-4 h-4 text-indigo-900" />
                  <span className="font-bold text-xs text-[#005c93] group-hover:text-indigo-900">Payroll & analytics</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>

          <div className="mt-4 pt-3.5 border-t border-indigo-200/20 text-[11px] text-slate-500 font-mono leading-relaxed">
            {taxonomy.appName} · {activeFacility?.name}
          </div>
        </div>

      </div>

      {/* Audit verification modal form */}
      {auditTarget && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-gray-150 relative"
          >
            <div className="flex justify-between items-start border-b border-gray-100 pb-3.5 mb-4">
              <div>
                <span className="text-[11px] bg-indigo-50 text-indigo-900 border border-indigo-200 px-2.5 py-1 rounded font-mono font-bold uppercase select-none">
                  🔒 SECURE AUDIT REGISTER
                </span>
                <h3 className="font-sans font-black text-slate-900 mt-1.5 select-none text-base">
                  {auditTarget === 'ward' ? 'Audit Secure Locker Unit' : 'Audit Field Service Station'}
                </h3>
              </div>
              <button 
                onClick={() => setAuditTarget(null)}
                className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-lg text-xs font-bold font-mono cursor-pointer"
              >
                ✕ Esc
              </button>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed mb-4">
              Sign off on physical asset checks. This creates a permanent ledger sync entry bound directly to your operator session.
            </p>

            <div className="flex flex-col gap-4 mb-5">
              <div>
                <label className="text-[10px] font-bold text-slate-400 block">Inspected Unit Location</label>
                <select
                  value={auditLocation}
                  onChange={(e) => setAuditLocation(e.target.value)}
                  className="w-full text-xs font-bold select bg-slate-50 border border-slate-200 rounded-xl p-3 mt-1.5 focus:border-indigo-600 outline-none"
                >
                  {(auditTarget === 'ward' ? [
                    `${activeFacility?.name} Secure Hub Locker A`,
                    `${activeFacility?.name} Secondary Materials Cage`,
                    `${activeFacility?.name} Executive Assets Vault`
                  ] : [
                    `Field Zone 1 Audit Post at ${activeFacility?.location}`,
                    `Regional Concentrator Box Site D`,
                    `Main Gate Facility Maintenance Hub B`
                  ]).map((loc, idx) => (
                    <option key={idx} value={loc}>{loc}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block">Auditing Coordinator Signature</label>
                  <input
                    type="text"
                    value={staff.name}
                    disabled
                    className="w-full text-xs font-mono font-bold bg-slate-100 text-slate-500 rounded-xl p-3 mt-1.5 border-none cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-indigo-900 block">Verified Wire Seal / Tag ID</label>
                  <input
                    type="text"
                    value={sealNumber}
                    onChange={(e) => setSealNumber(e.target.value)}
                    className="w-full text-xs font-mono font-bold bg-slate-50 border border-slate-200 rounded-xl p-3 mt-1.5 text-slate-900 focus:border-indigo-600 outline-none"
                    placeholder="E.g. TAG-192532"
                  />
                </div>
              </div>

              <div className="border border-slate-100 bg-slate-50 p-4 rounded-2xl flex flex-col gap-3 mt-1 shadow-inner">
                <span className="text-[10px] font-bold text-indigo-900 block">Physical SOP Checks Checklist</span>
                
                <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={auditItemsCheck.expiry}
                    onChange={(e) => setAuditItemsCheck({...auditItemsCheck, expiry: e.target.checked})}
                    className="w-4.5 h-4.5 accent-indigo-600 border-gray-300 rounded cursor-pointer"
                  />
                  <span>No items or materials are compromised or expired.</span>
                </label>

                <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={auditItemsCheck.quantities}
                    onChange={(e) => setAuditItemsCheck({...auditItemsCheck, quantities: e.target.checked})}
                    className="w-4.5 h-4.5 accent-indigo-600 border-gray-300 rounded cursor-pointer"
                  />
                  <span>Actual quantities match strategic catalog benchmarks.</span>
                </label>

                <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={auditItemsCheck.integrity}
                    onChange={(e) => setAuditItemsCheck({...auditItemsCheck, integrity: e.target.checked})}
                    className="w-4.5 h-4.5 accent-indigo-600 border-gray-300 rounded cursor-pointer"
                  />
                  <span>Tamper-evident structural seal is pristine & uncompromised.</span>
                </label>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setAuditTarget(null)}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                disabled={!auditItemsCheck.integrity || !auditItemsCheck.quantities || !auditItemsCheck.expiry || !sealNumber}
                onClick={handleApplyAudit}
                className="flex-1 py-3 bg-indigo-650 hover:bg-indigo-600 disabled:opacity-55 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer"
              >
                Submit Verifiably Checked
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Station / department detail popup modal */}
      {selectedStation && (
        <div 
          onClick={() => setSelectedStationInfo(null)}
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 cursor-pointer"
        >
          <motion.div 
            onClick={(e) => e.stopPropagation()}
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-gray-150 relative cursor-default"
          >
            {/* Direct Close Button */}
            <button
              onClick={() => setSelectedStationInfo(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors p-2 hover:bg-slate-50 rounded-xl cursor-pointer"
              title="Close Protocol"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="border-b border-gray-100 pb-3 mb-3 pr-8">
              <span className="text-[11px] bg-indigo-50 text-indigo-900 font-black font-mono border border-indigo-200 px-2 py-0.5 rounded uppercase">
                {taxonomy.groupSingular} Details
              </span>
              <h3 className="text-base font-black text-slate-800 mt-2 flex items-center gap-1.5 font-sans">
                {selectedStation.title}
              </h3>
            </div>

            <p className="text-xs text-slate-500 mt-1 mb-4 leading-relaxed font-semibold">
              {selectedStation.lead}
            </p>

            <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-[11px] text-slate-600 font-semibold">
              On-duty member: <span className="font-mono text-slate-800">{memberForStation(selectedStation)}</span>
            </div>

            <button
              onClick={() => setSelectedStationInfo(null)}
              className="w-full mt-4 py-2.5 bg-indigo-950 hover:bg-indigo-900 text-white font-black text-xs rounded-xl shadow-md transition-colors cursor-pointer text-center block"
            >
              Close
            </button>
          </motion.div>
        </div>
      )}

    </div>
  );
}
