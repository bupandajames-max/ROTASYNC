import React, { useState } from 'react';
import { StaffMember, RosterCycle, ApprovalRequest, ExtraHoursEntry, PublicHoliday, DailyTask, Facility } from '../types';
import { SHIFTS } from '../data/initialData';
import { isWeekend, isPublicHoliday, calculateStaffStats } from '../utils/rosterUtils';
import { Calendar, Clock, ArrowRightLeft, FileSpreadsheet, Hourglass, CheckCircle2, XCircle, Printer, Sparkles, UserCheck, ThumbsUp, AlertTriangle, Info } from 'lucide-react';
import { useToast } from './ui/ToastProvider';

interface StaffPortalProps {
  activeStaffId: string;
  staffList: StaffMember[];
  activeCycle: RosterCycle;
  cycleDates: string[];
  holidays: PublicHoliday[];
  approvals: ApprovalRequest[];
  onSubmitRequest: (req: ApprovalRequest) => void;
  extraHoursLog: ExtraHoursEntry[];
  dailyTasks: DailyTask[];
  selectedFacilityId: string;
  facilities: Facility[];
}

export default function StaffPortal({
  activeStaffId,
  staffList,
  activeCycle,
  cycleDates,
  holidays,
  approvals,
  onSubmitRequest,
  extraHoursLog,
  dailyTasks,
  selectedFacilityId,
  facilities,
}: StaffPortalProps) {
  const toast = useToast();
  const [xhrDate, setXhrDate] = useState(cycleDates[0] || '');
  const [xhrHours, setXhrHours] = useState<number>(2);
  const [xhrNote, setXhrNote] = useState('');

  const [swapMyDate, setSwapMyDate] = useState(cycleDates[0] || '');
  const [swapStaffId, setSwapStaffId] = useState('');
  const [swapNote, setSwapNote] = useState('');

  const [showTimesheetPrint, setShowTimesheetPrint] = useState(false);

  const activeStaff = staffList.find(s => s.id === activeStaffId);
  if (!activeStaff) return null;

  const activeFacility = facilities.find(f => f.id === activeStaff.facilityId) || facilities.find(f => f.id === selectedFacilityId) || facilities[0];

  // Filter approvals submitted by this user
  const myRequests = approvals.filter(a => a.requesterName === activeStaff.name);

  // Compile active extra hours logged for this staff member
  const myExtraHoursMap: { [date: string]: number } = {};
  extraHoursLog
    .filter(e => e.staffName === activeStaff.name)
    .forEach(e => {
      myExtraHoursMap[e.shiftDate] = (myExtraHoursMap[e.shiftDate] || 0) + e.hours;
    });

  // Shifts of active staff member in the cycle
  const myShifts = activeCycle.shifts[activeStaff.id] || [];

  // Calculate Pace Stats
  const stats = calculateStaffStats(activeStaff, myShifts, cycleDates, holidays, myExtraHoursMap);

  // Generate 7-Day Forecast (Starts with today)
  const todayStr = new Date().toISOString().split('T')[0];
  const upcomingIdx = cycleDates.findIndex(d => d >= todayStr);
  const startForecastIdx = upcomingIdx !== -1 ? upcomingIdx : 0;
  const forecastDates = cycleDates.slice(startForecastIdx, startForecastIdx + 7);

  // --- Smart Swap AI Assistant Recs Engine ---
  const myDayIdx = cycleDates.indexOf(swapMyDate);
  const myShiftCode = myShifts[myDayIdx] || 'OFF';
  const myShiftHours = SHIFTS[myShiftCode]?.hours || 0;

  let smartSwapRecs: Array<{
    colleague: StaffMember;
    colleagueShiftCode: string;
    colleagueTotalHours: number;
    isRoleCompatible: boolean;
    fatigueMessage: string;
    score: number;
    reason: string;
    type: 'cover' | 'overtime' | 'trade' | 'fatigue' | 'role-mismatch' | 'invalid';
  }> = [];

  if (myDayIdx !== -1 && myShiftCode !== 'OFF') {
    smartSwapRecs = staffList
      .filter(colleague => colleague.id !== activeStaff.id)
      .map(colleague => {
        const colleagueShifts = activeCycle.shifts[colleague.id] || [];
        const colleagueShiftCode = colleagueShifts[myDayIdx] || 'OFF';
        const isLeave = ['AL', 'SL', 'CO', 'MD'].includes(colleagueShiftCode);
        const isSameShiftCode = colleagueShiftCode === myShiftCode;

        // Calculate workload
        let colleagueTotalHours = 0;
        colleagueShifts.forEach(code => {
          colleagueTotalHours += SHIFTS[code]?.hours || 0;
        });

        // A swap candidate needs the same role to actually cover the shift.
        const isRoleCompatible = activeStaff.role === colleague.role;

        // Fatigue check (11 hour break compliance)
        let fatigueMessage = '';
        if (myDayIdx > 0) {
          const prevCode = colleagueShifts[myDayIdx - 1] || 'OFF';
          if ((prevCode === 'N' || prevCode === 'SC') && ['A', 'A+', 'B'].includes(myShiftCode)) {
            fatigueMessage = '⚠️ Prev day night shift. morning shift violates 11-hour rest.';
          }
        }
        if (myDayIdx < cycleDates.length - 1) {
          const nextCode = colleagueShifts[myDayIdx + 1] || 'OFF';
          if ((myShiftCode === 'N' || myShiftCode === 'SC') && ['A', 'A+', 'B'].includes(nextCode)) {
            fatigueMessage = '⚠️ Next day morning shift conflicts with night cover rest break.';
          }
        }

        // Scoring math
        let score = 100;
        let reason = 'Perfect Cover Match';
        let type: 'cover' | 'overtime' | 'trade' | 'fatigue' | 'role-mismatch' | 'invalid' = 'cover';

        if (isLeave) {
          score = 0;
          reason = 'Colleague on leave';
          type = 'invalid';
        } else if (isSameShiftCode) {
          score = 0;
          reason = 'Already scheduled on this shift';
          type = 'invalid';
        } else if (fatigueMessage) {
          score = 25;
          reason = 'Rest period break violation';
          type = 'fatigue';
        } else if (!isRoleCompatible) {
          score = 40;
          reason = 'Role specialty mismatch';
          type = 'role-mismatch';
        } else if (colleagueShiftCode !== 'OFF') {
          score = 85;
          reason = 'Bilateral shift-for-shift trade candidate';
          type = 'trade';
          if (!isRoleCompatible) {
            score = Math.max(0, score - 35);
          }
        } else {
          // Off & available to cover
          const projectedHrs = colleagueTotalHours + myShiftHours;
          const limit = colleague.contractedHours || 168;
          if (projectedHrs > limit) {
            score = 75;
            reason = `Incurs +${projectedHrs - limit}h overtime workload`;
            type = 'overtime';
            if (!isRoleCompatible) {
              score = Math.max(0, score - 35);
            }
          } else {
            score = 100;
            reason = 'Direct coverage (Within normal contracted hours)';
            type = 'cover';
            if (!isRoleCompatible) {
              score = Math.max(0, score - 35);
            }
          }
        }

        return {
          colleague,
          colleagueShiftCode,
          colleagueTotalHours,
          isRoleCompatible,
          fatigueMessage,
          score: Math.max(0, score),
          reason,
          type,
        };
      })
      .filter(entry => entry.score > 20)
      .sort((a, b) => b.score - a.score);
  }

  // Handle Log Extra Hours submission
  const handleXhrSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!xhrDate || !xhrHours) return;

    const request: ApprovalRequest = {
      id: `req-${Date.now()}`,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
      type: 'EXTRA',
      requesterName: activeStaff.name,
      shiftData: xhrDate,
      targetName: String(xhrHours),
      details: xhrNote || 'Duty extension',
      status: 'Pending'
    };

    onSubmitRequest(request);
    setXhrNote('');
    toast.success('Extra-hours request sent for manager approval.');
  };

  // Handle Swap submission
  const handleSwapSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!swapMyDate || !swapStaffId) {
      toast.error('Please fill in both the Date and Colleague fields.');
      return;
    }

    const colleague = staffList.find(s => s.id === swapStaffId);
    if (!colleague) return;

    // Check if swap involves leave (Zambian Laws safeguard)
    const myDayIdx = cycleDates.indexOf(swapMyDate);
    const mySourceShift = activeCycle.shifts[activeStaff.id]?.[myDayIdx] || 'OFF';
    const colleagueSourceShift = activeCycle.shifts[colleague.id]?.[myDayIdx] || 'OFF';

    const restrictedLeave = ['AL', 'SL', 'CO', 'MD'];
    if (restrictedLeave.includes(mySourceShift) || restrictedLeave.includes(colleagueSourceShift)) {
      toast.error('Leave days (AL, SL, MD, CO) can’t be swapped between staff. Please contact your manager.');
      return;
    }

    const request: ApprovalRequest = {
      id: `req-${Date.now()}`,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
      type: 'SWAP',
      requesterName: activeStaff.name,
      shiftData: `${swapMyDate}|${mySourceShift}`,
      targetName: colleague.name,
      details: swapNote || 'Plan adjustment',
      status: 'Pending'
    };

    onSubmitRequest(request);
    setSwapNote('');
    toast.success('Shift-swap request sent for manager review.');
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Pace Check & Contracted Target Gauges */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 gap-3">
        {/* Total Hours Card */}
        <div className="bg-white p-3.5 rounded-xl shadow-xs border border-gray-100 flex items-center justify-between">
          <div>
            <span className="text-[11px] text-gray-400 font-bold block">Pace Check</span>
            <h3 className="text-[#1f3864] text-lg font-black mt-0.5">{stats.totalHrs.toFixed(1)} hrs</h3>
            <p className="text-[10px] text-slate-500 font-medium mt-0.5 leading-none">Logged</p>
          </div>
          <div className="p-2 bg-blue-50 text-[#00aeff] rounded-lg shrink-0">
            <Clock className="w-4 h-4" />
          </div>
        </div>

        {/* Contract Capacity target */}
        <div className="bg-white p-3.5 rounded-xl shadow-xs border border-gray-100 flex items-center justify-between">
          <div>
            <span className="text-[11px] text-gray-400 font-bold block">Contract Target</span>
            <h3 className="text-gray-900 text-lg font-black mt-0.5">{activeStaff.contractedHours} hrs</h3>
            <div className="w-16 bg-slate-100 h-1.5 rounded-full overflow-hidden mt-1">
              <div
                className="bg-emerald-500 h-full transition-all"
                style={{ width: `${Math.min(100, Math.floor((stats.totalHrs / activeStaff.contractedHours) * 100))}%` }}
              ></div>
            </div>
          </div>
          <div className="p-2 bg-slate-50 text-slate-400 rounded-lg shrink-0">
            <FileSpreadsheet className="w-4 h-4" />
          </div>
        </div>

        {/* Overtime hrs */}
        <div className="bg-white p-3.5 rounded-xl shadow-xs border border-gray-100 flex items-center justify-between">
          <div>
            <span className="text-[11px] text-gray-400 font-bold block">Calculated Overtime</span>
            <h3 className="text-amber-600 text-lg font-black mt-0.5">+{stats.overtime} hrs</h3>
            <p className="text-[10px] text-slate-500 font-medium mt-0.5 leading-none">payout</p>
          </div>
          <div className="p-2 bg-amber-50 text-amber-500 rounded-lg shrink-0">
            <Clock className="w-4 h-4" />
          </div>
        </div>

        {/* Call shifts */}
        <div className="bg-white p-3.5 rounded-xl shadow-xs border border-gray-100 flex items-center justify-between">
          <div>
            <span className="text-[11px] text-gray-400 font-bold block">Stand-by Count</span>
            <h3 className="text-purple-600 text-lg font-black mt-0.5">{stats.callShiftCount}</h3>
            <p className="text-[10px] text-slate-500 font-semibold mt-0.5 leading-none">shifts</p>
          </div>
          <div className="p-2 bg-purple-50 text-purple-500 rounded-lg shrink-0">
            <Calendar className="w-4 h-4" />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        {/* Left column: Forecast schedule */}
        <div className="flex flex-col gap-6">
          {/* Upcoming Shifts 7-Day Forecast */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
            <h3 className="text-[#1f3864] text-base font-bold mb-4 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-[#00aeff]" /> Upcoming 7-Day Forecast
            </h3>

            <div className="flex flex-col gap-3">
              {forecastDates.map((dKey, fIdx) => {
                const dateIdx = cycleDates.indexOf(dKey);
                const sCode = myShifts[dateIdx] || 'OFF';
                const def = SHIFTS[sCode];
                const cleanDate = new Date(dKey + 'T00:00:00');
                const dayLabel = cleanDate.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
                const isPH = isPublicHoliday(dKey, holidays);
                const isXhr = myExtraHoursMap[dKey] || 0;

                return (
                  <div
                    key={dKey}
                    className="flex justify-between items-center p-3 border border-gray-100 rounded-xl hover:border-blue-100 transition-colors bg-white shadow-xs"
                  >
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-gray-900">{dayLabel}</span>
                      {isPH && <span className="text-[10px] text-red-600 font-extrabold mt-0.5">★ Zambian Holiday</span>}
                      {isXhr > 0 && <span className="text-[10px] text-[#00aeff] font-bold mt-0.5">⏱ +{isXhr} overtime hrs</span>}
                    </div>

                    <div className="flex items-center gap-3">
                      <span
                        style={{ backgroundColor: def?.bg, color: def?.fg }}
                        className="text-center font-mono font-bold text-xs uppercase px-3 py-1.5 rounded-lg border border-opacity-10 tracking-wider shadow-xs"
                      >
                        {sCode}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => setShowTimesheetPrint(true)}
              className="w-full mt-4 flex items-center justify-center gap-2 py-3 bg-[#eef5fc] hover:bg-[#deeaf1] text-[#1f3864] border border-[#cbdff0] rounded-xl font-bold text-xs cursor-pointer shadow-xs"
            >
              <Printer className="w-4 h-4 text-[#00aeff]" /> Print/Preview Cycles Timesheet
            </button>
          </div>

          {/* Submitted requests ledger */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
            <h3 className="text-[#1f3864] text-base font-bold mb-4 flex items-center gap-2">
              <Hourglass className="w-5 h-5 text-[#00aeff]" /> My Requests Ledger
            </h3>

            <div className="flex flex-col gap-3 max-h-60 overflow-y-auto divide-y divide-gray-100 pr-2">
              {myRequests.map((req, idx) => {
                const isApproved = req.status === 'Approved';
                const isDenied = req.status === 'Denied';

                const statusColor = isApproved
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                  : isDenied
                    ? 'bg-red-50 text-red-700 border-red-100'
                    : 'bg-amber-50 text-amber-700 border-amber-100';

                const StatusIcon = isApproved ? CheckCircle2 : isDenied ? XCircle : Hourglass;

                return (
                  <div key={req.id} className="py-2.5 flex justify-between items-center text-xs gap-4 first:pt-0">
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-slate-800">
                          {req.type === 'SWAP' ? '🔄 Shift Trade' : '⏱ Extra Duty'}
                        </span>
                        <span className="text-[10px] text-gray-400 font-mono font-normal">
                          {req.timestamp}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500 mt-1 select-all">
                        Details: {req.type === 'SWAP' ? `Swap shift in ${req.shiftData?.split('|')[0]} with ${req.targetName}` : `+${req.targetName} hours in ${req.shiftData}`}
                        {req.details && ` - "${req.details}"`}
                      </p>
                    </div>

                    <span className={`flex items-center gap-1 px-2.5 py-1 rounded-full font-bold uppercase tracking-tight text-[10px] border ${statusColor} shrink-0`}>
                      <StatusIcon className="w-3.5 h-3.5" />
                      {req.status}
                    </span>
                  </div>
                );
              })}

              {myRequests.length === 0 && (
                <p className="text-xs text-gray-400 py-6 text-center italic">No requests logged during this period.</p>
              )}
            </div>
          </div>
        </div>

        {/* Right column: Form requests */}
        <div className="flex flex-col gap-6">
          {/* Shift swap request form */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
            <h3 className="text-[#1f3864] text-base font-bold mb-4 flex items-center gap-1.5">
              <ArrowRightLeft className="w-5 h-5 text-[#00aeff]" /> Request Shift Trade
            </h3>

            <form onSubmit={handleSwapSubmit} className="flex flex-col gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">My Shift Date</label>
                <select
                  value={swapMyDate}
                  onChange={(e) => setSwapMyDate(e.target.value)}
                  className="w-full text-xs font-semibold select bg-[#fafbfc] border border-gray-200 rounded-lg p-3 mt-1.5 shadow-xs outline-none"
                >
                  {cycleDates.map((dVal, dIdx) => {
                    const code = myShifts[dIdx] || 'OFF';
                    const activeShift = code !== 'OFF' && !['AL', 'SL', 'CO', 'MD'].includes(code);
                    if (!activeShift) return null;

                    return (
                      <option key={dVal} value={dVal}>
                        {new Date(dVal + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} ({code} Shift)
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Smart Swap Suggestions Panel */}
              {swapMyDate && myShiftCode !== 'OFF' && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mt-1 flex flex-col gap-2.5">
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] font-black text-[#1f3864] flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-pulse" /> 
                      Smart Swap Suggestions
                    </span>
                    <span className="text-[11px] bg-[#deeaf1] text-[#1f3864] font-black px-1.5 py-0.5 rounded-md uppercase font-sans">
                      {smartSwapRecs.length} Matches
                    </span>
                  </div>
                  
                  <div className="flex flex-col gap-2 max-h-56 overflow-y-auto scrollbar-thin pr-1">
                    {smartSwapRecs.map(({ colleague, colleagueShiftCode, colleagueTotalHours, isRoleCompatible, fatigueMessage, score, reason, type }) => {
                      let badgeBg = 'bg-emerald-50 border-emerald-150 text-emerald-800';
                      let scoreColor = 'text-emerald-700';
                      let statusText = 'Perfect Direct Cover';
                      
                      if (type === 'overtime') {
                        badgeBg = 'bg-amber-50 border-amber-200 text-amber-800';
                        scoreColor = 'text-amber-700';
                        statusText = 'Cover (Adds Overtime)';
                      } else if (type === 'trade') {
                        badgeBg = 'bg-blue-50 border-blue-150 text-blue-800';
                        scoreColor = 'text-blue-700';
                        statusText = 'Shift-for-Shift Trade';
                      } else if (type === 'fatigue') {
                        badgeBg = 'bg-rose-50 border-rose-150 text-rose-800';
                        scoreColor = 'text-rose-700';
                        statusText = 'Rest Constraints Warning';
                      } else if (type === 'role-mismatch') {
                        badgeBg = 'bg-orange-50 border-orange-150 text-orange-850';
                        scoreColor = 'text-orange-700';
                        statusText = 'Specialty Role Swap';
                      }

                      const totalHoursAfter = type === 'cover' || type === 'overtime' 
                        ? colleagueTotalHours + myShiftHours 
                        : colleagueTotalHours;

                      const isSelected = swapStaffId === colleague.id;

                      const draftExplanation = type === 'cover' || type === 'overtime'
                        ? `Requesting direct shift cover on ${new Date(swapMyDate + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} with ${colleague.name} since they are currently scheduled OFF. Keeps adjacent night-morning rest breaks compliant and ensures station coverage.`
                        : `Requesting shift-for-shift trade on ${new Date(swapMyDate + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} with ${colleague.name}. Trading my ${myShiftCode} shift for their ${colleagueShiftCode} shift. High specialty compatibility and compliant rest times satisfy clinical stand-by requirements.`;

                      return (
                        <div
                          key={colleague.id}
                          onClick={() => {
                            setSwapStaffId(colleague.id);
                            setSwapNote(draftExplanation);
                          }}
                          className={`p-2.5 rounded-lg border text-xs cursor-pointer transition-all flex flex-col gap-1.5 bg-white shadow-3xs text-left ${
                            isSelected
                              ? 'border-[#00aeff] bg-sky-50/20 ring-1 ring-sky-200'
                              : 'border-slate-100 hover:border-sky-300 hover:bg-slate-50/50'
                          }`}
                        >
                          <div className="flex justify-between items-start gap-1">
                            <div className="flex flex-col">
                              <span className="font-extrabold text-slate-800 text-xs flex items-center gap-1">
                                {colleague.name}
                                {isSelected && <span className="text-[#00aeff] font-bold text-[11px] bg-sky-50 px-1 rounded-sm">Selected</span>}
                              </span>
                              <span className="text-[10px] text-slate-400 font-semibold font-mono">
                                {colleague.role}
                              </span>
                            </div>
                            
                            <div className="text-right flex flex-col items-end">
                              <span className={`text-[10px] uppercase font-black px-1.5 py-0.5 rounded border inline-block ${badgeBg}`}>
                                {score}% Match
                              </span>
                              <span className="text-[11px] text-slate-400 font-semibold mt-0.5">{statusText}</span>
                            </div>
                          </div>

                          {/* Workload and labor compliance metrics */}
                          <div className="grid grid-cols-2 gap-2 mt-0.5 pt-1.5 border-t border-slate-100 text-[10px] text-slate-500">
                            <div className="flex flex-col gap-0.5">
                              <span className="font-bold text-slate-400 uppercase text-[10px] tracking-wider">Workload Stats</span>
                              <span className="font-semibold text-slate-700 font-mono">
                                {colleagueTotalHours}h Scheduled → <strong className={`${totalHoursAfter > (colleague.contractedHours || 168) ? 'text-amber-600' : 'text-emerald-700'}`}>{totalHoursAfter}h / {colleague.contractedHours || 168}h</strong>
                              </span>
                            </div>
                            
                            <div className="flex flex-col gap-0.5 pr-1 text-right">
                              <span className="font-bold text-slate-400 uppercase text-[10px] tracking-wider">Labor Guardrails</span>
                              <span className="text-[11px] font-bold text-slate-550 truncate">
                                {fatigueMessage ? (
                                  <span className="text-rose-600 font-bold block truncate" title={fatigueMessage}>⚠️ Rest Warning</span>
                                ) : (
                                  <span className="text-emerald-700 font-bold block">✓ Compliance OK</span>
                                )}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {smartSwapRecs.length === 0 && (
                      <div className="text-center py-6 text-[11px] text-slate-400 font-bold border border-dashed border-slate-200 rounded-xl bg-white px-2.5">
                        No optimal same-category colleagues listed for this date block. Choose a candidate from the picker below.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {swapMyDate && myShiftCode === 'OFF' && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 font-bold flex gap-1.5 items-start mt-1">
                  <Info className="w-4 h-4 text-amber-650 shrink-0 mt-0.5" />
                  <div>
                    <span>You are scheduled OFF on this day.</span>
                    <p className="text-[10px] text-amber-700 font-normal mt-0.5">Please select another date when you are scheduled on-shift to initiate a trade proposal with coworker colleagues.</p>
                  </div>
                </div>
              )}

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Trading Partner (Colleague)</label>
                <select
                  value={swapStaffId}
                  onChange={(e) => setSwapStaffId(e.target.value)}
                  className="w-full text-xs font-semibold select bg-[#fafbfc] border border-gray-200 rounded-lg p-3 mt-1.5 shadow-xs outline-none"
                >
                  <option value="">-- Choose Colleague --</option>
                  {staffList.filter(s => s.id !== activeStaff.id).map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.role.split(' ')[0]})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Trade Explanation / Reason</label>
                <textarea
                  value={swapNote}
                  onChange={(e) => setSwapNote(e.target.value)}
                  rows={2}
                  placeholder="Need morning off? swap coverage explanations..."
                  className="w-full text-xs font-semibold bg-[#fafbfc] border border-gray-200 rounded-lg p-3 mt-1.5 shadow-xs outline-none focus:border-blue-500 focus:bg-white transition-colors"
                ></textarea>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-[#1f3864] hover:bg-blue-900 border border-blue-500 text-white text-xs font-bold rounded-xl transition-colors shadow-sm cursor-pointer mt-1"
              >
                Send Request
              </button>
            </form>
          </div>

          {/* Extra hours request form */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
            <h3 className="text-[#1f3864] text-base font-bold mb-4 flex items-center gap-1.5">
              <Clock className="w-5 h-5 text-[#00aeff]" /> Log Extra Hours
            </h3>

            <form onSubmit={handleXhrSubmit} className="flex flex-col gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Date of Shift Extension</label>
                <select
                  value={xhrDate}
                  onChange={(e) => setXhrDate(e.target.value)}
                  className="w-full text-xs font-semibold select bg-[#fafbfc] border border-gray-200 rounded-lg p-3 mt-1.5 shadow-xs outline-none"
                >
                  {cycleDates.map(dVal => (
                    <option key={dVal} value={dVal}>
                      {new Date(dVal + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', weekday: 'short' })}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Hours Completed</label>
                <input
                  type="number"
                  min="-8"
                  max="12"
                  value={xhrHours}
                  onChange={(e) => setXhrHours(Math.max(-8, parseInt(e.target.value) || 0))}
                  className="w-full text-xs font-bold bg-[#fafbfc] border border-gray-200 rounded-lg p-3 mt-1.5 shadow-xs outline-none focus:border-blue-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Description / counter-sign context</label>
                <textarea
                  value={xhrNote}
                  onChange={(e) => setXhrNote(e.target.value)}
                  rows={2}
                  placeholder="e.g. Stayed late to cover a shift, finished end-of-day tasks..."
                  className="w-full text-xs font-semibold bg-[#fafbfc] border border-gray-200 rounded-lg p-3 mt-1.5 shadow-xs outline-none focus:border-blue-500 focus:bg-white transition-colors"
                ></textarea>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-[#1f3864] hover:bg-blue-900 border border-blue-500 text-white text-xs font-bold rounded-xl transition-colors shadow-sm cursor-pointer mt-1"
              >
                Log Extra Hours
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Branded Official Timesheet Print/Preview Overlay */}
      {showTimesheetPrint && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-start justify-center p-4 z-[100] overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-8 shadow-2xl relative my-auto">
            <button
              onClick={() => setShowTimesheetPrint(false)}
              className="absolute top-4 right-4 bg-gray-100 hover:bg-gray-200 text-gray-500 p-2 rounded-xl text-xs font-extrabold cursor-pointer"
            >
              Minimize [X]
            </button>

            {/* Branded Timesheet Preview */}
            <div id="timesheetPrintable" className="p-4 border border-gray-200 rounded-xl bg-white font-sans max-h-[70vh] overflow-y-auto">
              <div className="border-b-2 border-[#1f3864] pb-4 mb-4 text-center">
                <h2 className="text-[#009EE2] font-extrabold text-base">{activeFacility?.name}</h2>
                <h3 className="text-gray-800 text-sm font-semibold">{activeFacility?.location}</h3>
                <p className="text-[10px] text-gray-500 mt-1 font-bold">Official Cycle Timesheet Record</p>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs bg-slate-50 border border-slate-100 p-3 rounded-xl mb-4 font-mono">
                <div><strong>Employee Name:</strong> {activeStaff.fullName || activeStaff.name}</div>
                <div><strong>Employee ID:</strong> {activeStaff.employeeNo || 'EMP-N/A'}</div>
                <div><strong>Designation:</strong> {activeStaff.role}</div>
                <div><strong>Cycle Period:</strong> {cycleDates[0]} to {cycleDates[cycleDates.length - 1]}</div>
              </div>

              <table className="w-full text-left text-[11px] border border-gray-150 rounded-lg overflow-hidden border-collapse mb-4">
                <thead>
                  <tr className="bg-[#1f3864] text-white text-[11px] uppercase">
                    <th className="p-2 border-r border-[#1a2c4d]">Date</th>
                    <th className="p-2 border-r border-[#1a2c4d]">Shift & Station</th>
                    <th className="p-2 text-center border-r border-[#1a2c4d]">Scheduled Hrs</th>
                    <th className="p-2 text-center">Extra Hours Added</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {cycleDates.map((dKey, dIdx) => {
                    const sc = myShifts[dIdx] || 'OFF';
                    const sDef = SHIFTS[sc];
                    const isPH = isPublicHoliday(dKey, holidays);
                    const isSun = new Date(dKey + 'T00:00:00').getDay() === 0;
                    const xHrs = myExtraHoursMap[dKey] || 0;

                    let bg = dIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40';
                    let textClass = 'text-gray-800';

                    if (isPH || isSun) {
                      bg = 'bg-red-50/30';
                      textClass = 'text-red-700 font-bold';
                    }

                    return (
                      <tr key={dKey} className={`${bg} ${textClass}`}>
                        <td className="p-2 border-r border-gray-100">{dKey}</td>
                        <td className="p-2 border-r border-gray-100 font-mono text-[10px]">
                          {sc} — {sDef?.name || 'Rest'}
                        </td>
                        <td className="p-2 text-center border-r border-gray-100">{sDef ? sDef.hours : '—'}</td>
                        <td className="p-2 text-center font-bold text-[#00aeff]">{xHrs > 0 ? `+${xHrs} hrs` : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Hour calculations and signatures */}
              <div className="grid grid-cols-3 gap-2 border border-slate-100 bg-slate-50/50 p-3 rounded-xl mb-6 text-xs text-center font-mono">
                <div>
                  <div className="font-extrabold text-[#1f3864] text-sm">{stats.totalHrs.toFixed(1)} hrs</div>
                  <div className="text-[11px] text-gray-500 uppercase mt-0.5">Total Hours</div>
                </div>
                <div>
                  <div className="font-extrabold text-amber-600 text-sm">+{stats.overtime} hrs</div>
                  <div className="text-[11px] text-gray-500 uppercase mt-0.5">Normal Overtime</div>
                </div>
                <div>
                  <div className="font-extrabold text-blue-800 text-sm">{stats.callShiftCount}</div>
                  <div className="text-[11px] text-gray-500 uppercase mt-0.5">Standby Shifts</div>
                </div>
              </div>

              {/* Signoff lines */}
              <div className="grid grid-cols-3 gap-4 pt-4 border-t border-[#1f3864] text-[10px]">
                <div className="text-center">
                  <div className="border-b border-gray-800 h-10 w-full mb-1"></div>
                  <div className="font-bold">Employee Signature</div>
                  <div className="text-gray-400">{activeStaff.fullName || activeStaff.name}</div>
                </div>
                <div className="text-center">
                  <div className="border-b border-gray-800 h-10 w-full mb-1"></div>
                  <div className="font-bold">Supervisor Signature</div>
                  <div className="text-gray-400">{activeFacility?.leadManager || ''}</div>
                </div>
                <div className="text-center">
                  <div className="border-b border-gray-800 h-10 w-full mb-1"></div>
                  <div className="font-bold">Manager Signature</div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowTimesheetPrint(false)}
                className="py-2.5 px-6 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl cursor-pointer"
              >
                Close Preview
              </button>
              <button
                onClick={() => {
                  window.print();
                }}
                className="py-2.5 px-6 bg-[#1f3864] hover:bg-blue-900 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-md cursor-pointer"
              >
                <Printer className="w-4 h-4" /> Trigger System Print Dialog
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
