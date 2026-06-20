import React, { useState } from 'react';
import { StaffMember, RosterCycle, ApprovalRequest, ExtraHoursEntry, PublicHoliday, DailyTask, Timesheet, TimesheetDay } from '../types';
import { SHIFTS } from '../data/initialData';
import { isWeekend, isPublicHoliday } from '../utils/rosterUtils';
import { sumTimesheetTotals } from '../utils/timesheetUtils';
import { 
  Sliders, 
  Check, 
  X, 
  ShieldAlert, 
  Award, 
  FileSpreadsheet, 
  Hourglass, 
  UserCheck, 
  AlertOctagon, 
  ChevronRight, 
  CheckCircle2, 
  XCircle, 
  CornerDownRight, 
  MessageSquare,
  Clock,
  ArrowRight
} from 'lucide-react';
import { useToast } from './ui/ToastProvider';
import { useConfirm } from './ui/ConfirmProvider';

interface ManagerDashboardProps {
  approvals: ApprovalRequest[];
  onProcessAction: (id: string, decision: 'approve' | 'deny') => void;
  staffList: StaffMember[];
  activeCycle: RosterCycle;
  cycleDates: string[];
  holidays: PublicHoliday[];
  extraHoursLog: ExtraHoursEntry[];
  dailyTasks: DailyTask[];
  
  // Real-world timesheets integration
  timesheets: Timesheet[];
  onUpdateTimesheet: (updated: Timesheet) => void;
  approverName: string;
}

export default function ManagerDashboard({
  approvals,
  onProcessAction,
  staffList,
  activeCycle,
  cycleDates,
  holidays,
  extraHoursLog,
  dailyTasks,
  timesheets,
  onUpdateTimesheet,
  approverName,
}: ManagerDashboardProps) {
  const toast = useToast();
  const confirm = useConfirm();
  const [selectedInspectStaffId, setSelectedInspectStaffId] = useState('');
  const [managerCommentText, setManagerCommentText] = useState('');

  // Live Floor Plan today
  const todayStr = new Date().toISOString().split('T')[0];
  const dayIdx = cycleDates.indexOf(todayStr);

  const activeFloorPlan: { onShift: { name: string; shift: string; bg: string; fg: string }[]; onLeave: { name: string; shift: string }[] } = {
    onShift: [],
    onLeave: []
  };

  if (dayIdx !== -1) {
    staffList.forEach(s => {
      const shift = activeCycle.shifts[s.id]?.[dayIdx] || 'OFF';
      const def = SHIFTS[shift];
      if (['AL', 'SL', 'CO', 'MD', 'TRN', 'OS'].includes(shift)) {
        activeFloorPlan.onLeave.push({ name: s.name, shift });
      } else if (shift !== 'OFF' && def) {
        activeFloorPlan.onShift.push({ name: s.name, shift, bg: def.bg, fg: def.fg });
      }
    });
  }

  // Yesterday's incomplete checks as exceptional flags
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];
  const missedTasks = dailyTasks.filter(t => t.date === yesterdayStr && t.status !== 'Done');

  // Pending Peer requests (Swaps & Extra hours)
  const pendingRequests = approvals.filter(a => a.status === 'Pending');

  // Active inspect timesheet
  const currentInspectTimesheet = timesheets.find(t => t.staffId === selectedInspectStaffId);
  const currentInspectStaff = staffList.find(s => s.id === selectedInspectStaffId);

  // Re-sum totals
  const inspectTotals = currentInspectTimesheet ? sumTimesheetTotals(currentInspectTimesheet) : null;

  // Handle Approve Timesheet
  const handleApproveTimesheet = async () => {
    if (!currentInspectTimesheet) return;

    if (await confirm({ title: 'Approve this timesheet?', message: `Locks ${currentInspectStaff?.fullName || 'the staff member'}'s hours for payroll and marks it certified.`, confirmLabel: 'Approve & lock' })) {
      const updated: Timesheet = {
        ...currentInspectTimesheet,
        status: 'Approved',
        approvedAt: new Date().toISOString().substring(0, 16).replace('T', ' '),
        approvedBy: approverName,
        managerComment: managerCommentText || 'Approved pursuant to schedule audit.'
      };
      onUpdateTimesheet(updated);
      setManagerCommentText('');
    }
  };

  // Handle Reject Timesheet (Return to draft)
  const handleRejectTimesheet = async () => {
    if (!currentInspectTimesheet) return;

    if (!managerCommentText.trim()) {
      toast.error('Please note the required corrections in Comments before returning the timesheet.');
      return;
    }

    if (await confirm({ title: 'Return for corrections?', message: `Sends the timesheet back to ${currentInspectStaff?.name || 'the staff member'} with your comments.`, danger: true, confirmLabel: 'Return' })) {
      const updated: Timesheet = {
        ...currentInspectTimesheet,
        status: 'Rejected',
        approvedAt: undefined,
        approvedBy: approverName,
        managerComment: managerCommentText
      };
      onUpdateTimesheet(updated);
      setManagerCommentText('');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      
      {/* Live Floor Plan and Exceptions Upper Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Floor plan widget */}
        <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 flex flex-col gap-4">
          <div className="text-xs font-black text-[#005c93] border-b border-gray-100 pb-3 flex justify-between items-center uppercase">
            <span className="flex items-center gap-1.5"><Sliders className="w-5 h-5 text-[#009EE2]" /> Live Floor Plan</span>
            <span className="text-[10px] text-gray-400 font-mono font-bold tracking-wider">{todayStr}</span>
          </div>

          <div className="flex flex-col gap-3">
            <div className="max-h-44 overflow-y-auto flex flex-col gap-2 pr-1">
              <span className="text-[10px] text-gray-400 font-bold font-mono">Duty Staff on Workspace deck:</span>
              {activeFloorPlan.onShift.map((s, idx) => (
                <div key={idx} className="flex justify-between items-center text-xs font-bold bg-slate-50 border border-slate-100 p-2.5 rounded-xl">
                  <span>{s.name}</span>
                  <span
                    style={{ backgroundColor: s.bg, color: s.fg }}
                    className="px-2 py-0.5 rounded font-bold font-mono text-[9px] border border-black/5 uppercase"
                  >
                    {s.shift} Shift
                  </span>
                </div>
              ))}
              {activeFloorPlan.onShift.length === 0 && (
                <p className="text-xs text-slate-400 hover:underline italic py-2">No staff members on shift today.</p>
              )}
            </div>

            {activeFloorPlan.onLeave.length > 0 && (
              <div className="pt-3 border-t border-dashed border-gray-150">
                <span className="text-[10px] text-gray-400 font-bold block mb-1.5 font-mono">Authorized Absences Today:</span>
                <div className="flex flex-wrap gap-1.5">
                  {activeFloorPlan.onLeave.map((s, idx) => (
                    <span key={idx} className="bg-indigo-50 text-indigo-700 text-[9.5px] px-2.5 py-1 rounded-lg border border-indigo-100 font-bold uppercase tracking-wide">
                      {s.name} ({s.shift})
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Incomplete compliance logs from yesterday */}
        <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 flex flex-col gap-4">
          <div className="text-xs font-black text-[#005c93] border-b border-gray-200 pb-3 flex justify-between items-center uppercase">
            <span className="flex items-center gap-2 font-black text-[#005c93]">
              <AlertOctagon className="w-5 h-5 text-sky-600 animate-pulse" /> Yesterday's Exceptions
            </span>
            <span className="text-[10px] text-gray-400 font-mono font-bold">{yesterdayStr}</span>
          </div>

          <div className="max-h-56 overflow-y-auto flex flex-col gap-3 pr-1">
            {missedTasks.map((t, idx) => (
              <div key={idx} className="text-xs bg-sky-50/20 border border-[#009EE2]/20 p-3 rounded-xl border-l-4 border-l-[#009EE2]">
                <div className="font-extrabold text-slate-800 flex justify-between text-[11px]">
                  <span>{t.taskName}</span>
                  <span className="text-[8.5px] uppercase font-mono text-[#005c93]">{t.shiftCode} shift</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  Responsible: <strong className="font-semibold text-slate-800 uppercase">{t.staffName}</strong> · Category: {t.category}
                </p>
                <div className="mt-2 text-right">
                  <span className="bg-sky-100 text-[#005c93] text-[8.5px] px-2 py-0.5 rounded font-black tracking-widest uppercase">
                    Pending Verification
                  </span>
                </div>
              </div>
            ))}

            {missedTasks.length === 0 && (
              <div className="text-center py-8">
                <Award className="w-10 h-10 text-emerald-600 mx-auto" />
                <h5 className="text-xs text-emerald-800 font-extrabold mt-2 uppercase">Compliant Operations!</h5>
                <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">All statutory logs from yesterday were certified completely on time.</p>
              </div>
            )}
          </div>
        </div>

        {/* Peer Swaps & Extra hours Requests box */}
        <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 flex flex-col gap-4">
          <div className="text-xs font-black text-[#005c93] border-b border-gray-200 pb-3 flex justify-between items-center uppercase">
            <span className="flex items-center gap-1.5"><Sliders className="w-5 h-5 text-[#009EE2]" /> Duty Requests Queue</span>
            <span className="text-[10px] text-[#005c93] font-mono font-black bg-sky-50 px-2 py-0.5 rounded-full border border-[#009EE2]/15">{pendingRequests.length}</span>
          </div>

          <div className="max-h-56 overflow-y-auto flex flex-col gap-3 pr-1 text-xs">
            {pendingRequests.map(req => (
              <div key={req.id} className="p-3 bg-semibold border border-slate-150 rounded-2xl flex justify-between items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-100 font-extrabold">{req.type}</span>
                    <span className="text-[9px] text-slate-400 font-medium font-mono">{req.timestamp.split(' ')[1] || req.timestamp}</span>
                  </div>
                  <p className="text-[10.5px] text-slate-700 font-semibold truncate uppercase mt-1.5">{req.requesterName}</p>
                  <p className="text-[9.5px] text-slate-400 font-medium truncate italic mt-0.5">"{req.details}"</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => onProcessAction(req.id, 'deny')}
                    className="p-1 px-2 border border-rose-200 hover:bg-rose-50 text-rose-600 rounded-lg transition-colors cursor-pointer"
                  >
                    Deny
                  </button>
                  <button
                    onClick={() => onProcessAction(req.id, 'approve')}
                    className="p-1 px-2 border border-emerald-250 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg font-bold transition-all cursor-pointer"
                  >
                    Grant
                  </button>
                </div>
              </div>
            ))}
            {pendingRequests.length === 0 && (
              <p className="text-xs text-slate-400 font-medium italic text-center py-10">No pending peer trades or duty adjustments.</p>
            )}
          </div>
        </div>

      </div>

      {/* Main timesheets review grid & inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Staff Timesheet Ledger status */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 self-start flex flex-col gap-4.5">
          <div>
            <h3 className="text-slate-800 font-black text-xs uppercase block">Submitted Timesheet Ledger</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Select a staff timesheet below to audit work clocks side-by-side with scheduled rosters.</p>
          </div>

          <div className="flex flex-col gap-2.5">
            {staffList.map(s => {
              const ts = timesheets.find(t => t.staffId === s.id);
              if (!ts) return null;

              const tsTotals = sumTimesheetTotals(ts);
              const isSelected = selectedInspectStaffId === s.id;

              return (
                <button
                  key={s.id}
                  onClick={() => {
                    setSelectedInspectStaffId(s.id);
                    setManagerCommentText(ts.managerComment || '');
                  }}
                  className={`w-full text-left p-3.5 rounded-2xl border transition-all cursor-pointer flex justify-between items-center ${
                    isSelected
                      ? 'bg-sky-50/70 border-[#009EE2]/30 shadow-indigo-100/10'
                      : 'bg-white border-slate-150 hover:border-slate-350'
                  }`}
                >
                  <div className="flex-1 min-w-0 pr-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h4 className="font-extrabold text-xs text-slate-800 truncate uppercase">{s.name}</h4>
                      <span className="text-[9px] text-slate-400">• {s.role.split(' ')[0]}</span>
                    </div>
                    <p className="text-[10px] font-mono text-slate-500 font-semibold mt-1">
                      {tsTotals.total}h worked · Sunday: {tsTotals.sunday}h · OT: {tsTotals.overtime}h
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 select-none">
                    {ts.status === 'Draft' && (
                      <span className="px-2 py-0.5 rounded text-[8.5px] bg-slate-100 text-slate-600 font-mono font-bold uppercase border border-slate-200">Draft</span>
                    )}
                    {ts.status === 'Submitted' && (
                      <span className="px-2 py-0.5 rounded text-[8.5px] bg-indigo-100 text-indigo-800 font-mono font-black uppercase-bold border border-indigo-200 animate-pulse tracking-wide italic">Verify</span>
                    )}
                    {ts.status === 'Approved' && (
                      <span className="px-1.5 py-1 text-emerald-600 flex items-center gap-0.5 font-bold"><CheckCircle2 className="w-4 h-4" /></span>
                    )}
                    {ts.status === 'Rejected' && (
                      <span className="px-1.5 py-1 text-[8.5px] bg-rose-50 border border-rose-200 text-rose-700 font-mono font-bold uppercase rounded">Rejected</span>
                    )}
                    <ChevronRight className={`w-4 h-4 transition-transform ${isSelected ? 'text-[#005c93] translate-x-1' : 'text-slate-300'}`} />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Columns: Clocking Auditor Inspection Station */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {currentInspectTimesheet && currentInspectStaff && inspectTotals ? (
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
              
              {/* Inspection Header */}
              <div className="bg-slate-50 border-b border-slate-100 p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <span className="text-[9px] text-[#005c93] font-black uppercase font-mono tracking-wider block">Auditing workspace:</span>
                  <h3 className="text-slate-900 font-black text-base uppercase mt-0.5">{currentInspectStaff.fullName}</h3>
                  <p className="text-[10.5px] text-slate-500 font-medium font-sans">Role: {currentInspectStaff.role} · ID: {currentInspectStaff.employeeNo || "EMP-MB01"}</p>
                </div>
                
                <span className={`px-2.5 py-1 rounded-full text-[9px] font-black font-mono border ${
                  currentInspectTimesheet.status === 'Approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                  currentInspectTimesheet.status === 'Submitted' ? 'bg-indigo-50 text-indigo-700 border-indigo-100 animate-pulse' :
                  currentInspectTimesheet.status === 'Rejected' ? 'bg-rose-50 text-rose-700 border-rose-100' : 'bg-slate-50 text-slate-600 border-slate-200'
                }`}>
                  Status: {currentInspectTimesheet.status}
                </span>
              </div>

              {/* Aggregated Totals row before the grid list */}
              <div className="grid grid-cols-2 sm:grid-cols-4 border-b border-gray-100 select-none">
                <div className="p-4 border-r border-gray-100 text-center">
                  <span className="text-[8.5px] text-slate-400 font-mono font-bold uppercase">Base Expected</span>
                  <div className="text-slate-800 font-extrabold text-base mt-0.5">{currentInspectStaff.contractedHours} hrs</div>
                </div>
                <div className="p-4 border-r border-gray-100 text-center bg-blue-50/20">
                  <span className="text-[8.5px] text-slate-400 font-mono font-bold uppercase">Regular Worked</span>
                  <div className="text-blue-900 font-extrabold text-base mt-0.5">{inspectTotals.regular} hrs</div>
                </div>
                <div className="p-4 border-r border-gray-100 text-center bg-sky-50/20">
                  <span className="text-[8.5px] text-slate-400 font-mono font-bold uppercase">Sunday (1.5x)</span>
                  <div className="text-[#005c93] font-extrabold text-base mt-0.5">{inspectTotals.sunday} hrs</div>
                </div>
                <div className="p-4 text-center bg-amber-50/20">
                  <span className="text-[8.5px] text-slate-400 font-mono font-bold uppercase">OT & Holiday</span>
                  <div className="text-amber-600 font-extrabold text-base mt-0.5">+{inspectTotals.overtime + inspectTotals.holiday} hrs</div>
                </div>
              </div>

              {/* Day-by-Day inspection audit table rows */}
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-400 text-[8.5px] font-mono border-b border-gray-100 font-bold select-none">
                      <th className="py-2.5 px-5 font-bold">Date Log</th>
                      <th className="py-2.5 px-3 font-bold text-center">Planned Shift</th>
                      <th className="py-2.5 px-3 font-bold">Type</th>
                      <th className="py-2.5 px-3 font-bold">Actual Clocks (In-Out)</th>
                      <th className="py-2.5 px-3 font-bold text-center">Net hrs</th>
                      <th className="py-2.5 px-3 font-bold">Auditor Alerts</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {cycleDates.map(dateStr => {
                      const day = currentInspectTimesheet.days[dateStr];
                      if (!day) return null;

                      const isSun = new Date(dateStr + 'T00:00:00').getDay() === 0;
                      const hasClocks = day.clockIn && day.clockOut;
                      
                      const plannedShiftCode = day.scheduledShift;
                      const plannedDef = SHIFTS[plannedShiftCode];

                      // Auditor validation logic alerts
                      let alertTagSelect = null;
                      if (plannedShiftCode === 'OFF' && hasClocks) {
                        alertTagSelect = <span className="text-[8.5px] px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-100 font-bold uppercase">Unscheduled attendance</span>;
                      } else if (plannedShiftCode !== 'OFF' && ['AL','SL','CO','MD','TRN','OS'].indexOf(plannedShiftCode) === -1 && !hasClocks && day.workType === 'Absent') {
                        alertTagSelect = <span className="text-[8.5px] px-2 py-0.5 rounded bg-red-100 text-red-800 border border-red-200 font-black uppercase">Staff Absent</span>;
                      } else if (day.overtimeHours > 0) {
                        alertTagSelect = <span className="text-[8.5px] px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-150 font-bold uppercase">+{day.overtimeHours}h Overclock</span>;
                      }

                      return (
                        <tr key={dateStr} className={`hover:bg-slate-50/50 ${day.isModified ? 'bg-amber-50/15' : ''}`}>
                          <td className="py-3 px-5 font-bold text-slate-800 font-sans">
                            {new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span 
                              style={{ backgroundColor: plannedDef?.bg, color: plannedDef?.fg }}
                              className="font-mono font-bold text-[9px] uppercase px-1.5 py-0.5 rounded border border-black/5"
                            >
                              {plannedShiftCode}
                            </span>
                          </td>
                          <td className="py-3 px-3 font-medium text-slate-600 capitalize">
                            {day.workType === 'Leave Taken' ? `${day.actualShift} Leave` : day.workType}
                          </td>
                          <td className="py-3 px-3 font-mono font-bold text-[10.5px] text-slate-700">
                            {hasClocks ? (
                              <div className="flex items-center gap-1.5">
                                <span>{day.clockIn}</span>
                                <ArrowRight className="w-3 h-3 text-slate-400" />
                                <span>{day.clockOut}</span>
                              </div>
                            ) : (
                              <span className="text-slate-450 italic">- - : - -</span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-center font-bold font-mono text-slate-900">
                            {day.regularWorkedHours + day.sundayWorkedHours + day.overtimeHours + day.holidayWorkedHours + day.leaveHours > 0 ? (
                              <span>{(day.regularWorkedHours + day.sundayWorkedHours + day.overtimeHours + day.holidayWorkedHours + day.leaveHours).toFixed(1)}h</span>
                            ) : '-'}
                          </td>
                          <td className="py-3 px-3 font-sans">
                            {alertTagSelect || <span className="text-slate-350 italic text-[10px]">- Match -</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Supervisor Actions terminal footer */}
              <div className="bg-slate-50 border-t border-slate-100 p-5 flex flex-col gap-4">
                
                {/* Comments box */}
                <div>
                  <label className="text-[10px] text-slate-400 font-bold uppercase font-mono tracking-wider block mb-1.5 flex items-center gap-1">
                    <MessageSquare className="w-3.5 h-3.5 text-slate-500" /> Supervisor Critique Remarks (Required if returned/rejected)
                  </label>
                  <textarea
                    value={managerCommentText}
                    onChange={(e) => setManagerCommentText(e.target.value)}
                    rows={2}
                    placeholder="e.g. Kasoka, please review your clock log on June 20, you clocked standard hours on scheduled rest without a corresponding OT approval ticket."
                    className="w-full text-xs font-semibold bg-white border border-slate-200 rounded-xl p-3 focus:border-[#009EE2] outline-none transition-colors placeholder-slate-400 leading-relaxed text-slate-800"
                  />
                </div>

                {/* Primary Authorization Decision line */}
                <div className="flex gap-3 justify-end items-center">
                  <span className="text-xs text-slate-500 font-semibold font-sans italic shrink-0">Authorization Stamp Terminal</span>
                  <button
                    onClick={handleRejectTimesheet}
                    className="py-2.5 px-4.5 border border-rose-200 hover:bg-rose-50 text-rose-700 font-bold text-xs rounded-xl cursor-pointer shadow-xs whitespace-nowrap"
                  >
                    Disapprove & Return
                  </button>
                  <button
                    onClick={handleApproveTimesheet}
                    className="py-2.5 px-6.5 bg-[#005c93] hover:bg-[#003764] text-white font-extrabold text-xs rounded-xl shadow-md cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <CheckCircle2 className="w-4 h-4 text-sky-200" /> Authorize & Sign Timesheet
                  </button>
                </div>

              </div>

            </div>
          ) : (
            <div className="bg-slate-100 border border-slate-150 border-dashed rounded-3xl p-10 flex flex-col items-center justify-center text-center gap-3">
              <UserCheck className="w-12 h-12 text-slate-300 animate-pulse" />
              <div>
                <h4 className="font-extrabold text-slate-700 text-sm uppercase">Audit inspector terminal offline</h4>
                <p className="text-xs text-slate-500 max-w-sm mt-1">Select a candidate pharmacist or submitted timesheet from the ledger on the left to initiate the compliance side-by-side audit.</p>
              </div>
            </div>
          )}
        </div>

      </div>

    </div>
  );
}
