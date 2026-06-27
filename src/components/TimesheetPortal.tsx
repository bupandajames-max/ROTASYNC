import React, { useState } from 'react';
import { Timesheet, TimesheetDay, StaffMember, RosterCycle, PublicHoliday, ShiftDef } from '../types';
import { SHIFTS } from '../data/initialData';
import { reevaluateTimesheetDay, sumTimesheetTotals } from '../utils/timesheetUtils';
import { isPublicHoliday } from '../utils/rosterUtils';
import { useConfirm } from './ui/ConfirmProvider';
import { 
  Clock, 
  Calendar, 
  Printer, 
  CheckCircle2, 
  AlertCircle, 
  Edit, 
  Save, 
  FileSpreadsheet, 
  UserCheck, 
  X, 
  Send, 
  Lock, 
  Unlock, 
  ArrowRight
} from 'lucide-react';

interface TimesheetPortalProps {
  timesheets: Timesheet[];
  activeStaffId: string;
  staffList: StaffMember[];
  cycleDates: string[];
  holidays: PublicHoliday[];
  activeCycle: RosterCycle;
  onUpdateTimesheet: (updated: Timesheet) => void;
  selectedFacilityId: string;
  facilities: any[];
  taxonomy: {
    memberSingular: string;
    [key: string]: string;
  };
  shifts?: { [code: string]: ShiftDef };
}

export default function TimesheetPortal({
  timesheets,
  activeStaffId,
  staffList,
  cycleDates,
  holidays,
  activeCycle,
  onUpdateTimesheet,
  selectedFacilityId,
  facilities,
  shifts,
  taxonomy,
}: TimesheetPortalProps) {
  const confirm = useConfirm();
  const activeStaff = staffList.find(s => s.id === activeStaffId);
  const activeFacility = facilities.find((f: any) => f.id === activeStaff?.facilityId) || facilities.find((f: any) => f.id === selectedFacilityId) || facilities[0];
  // Leave types come from the workspace's actual shift registry, not a fixed
  // list — so this always matches what Settings > Shift Planner defines,
  // instead of drifting out of sync with names/codes that change or get removed.
  const shiftDefs = { ...SHIFTS, ...(shifts || {}) };
  const activeLeaveTypes = Object.entries(shiftDefs).filter(([, d]) => d.isLeave && d.active !== false);

  // Find or auto-initialize timesheet
  const myTimesheet = timesheets.find(t => t.staffId === activeStaffId);

  const [selectedDay, setSelectedDay] = useState<TimesheetDay | null>(null);
  const [editWorkType, setEditWorkType] = useState<TimesheetDay['workType']>('Worked Shift');
  const [editActualShift, setEditActualShift] = useState('A');
  const [editClockIn, setEditClockIn] = useState('07:00');
  const [editClockOut, setEditClockOut] = useState('16:00');
  const [editLunchBreak, setEditLunchBreak] = useState<string>('60');
  const [editDeviation, setEditDeviation] = useState('');
  const [showPrintView, setShowPrintView] = useState(false);

  if (!activeStaff || !myTimesheet) {
    return (
      <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm text-center">
        <AlertCircle className="w-12 h-12 text-rose-500 mx-auto animate-bounce mb-3" />
        <h3 className="font-extrabold text-slate-800 text-base">Timesheet Not Pre-Loaded</h3>
        <p className="text-xs text-slate-500 mt-1">Please ensure your scheduled roster is set up before logging clockings.</p>
      </div>
    );
  }

  const totals = sumTimesheetTotals(myTimesheet);
  const isLocked = myTimesheet.status === 'Submitted' || myTimesheet.status === 'Approved';

  // Open Edit Dialog for a Day
  const handleEditDayClick = (day: TimesheetDay) => {
    if (isLocked) return;
    setSelectedDay(day);
    setEditWorkType(day.workType);
    setEditActualShift(day.actualShift);
    setEditClockIn(day.clockIn || '07:00');
    setEditClockOut(day.clockOut || '16:00');
    setEditLunchBreak(String(day.lunchBreakMinutes));
    setEditDeviation(day.deviationReason || '');
  };

  // Save Day Clockings
  const handleSaveDay = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDay) return;

    let updatedDay: TimesheetDay = {
      ...selectedDay,
      workType: editWorkType,
      actualShift: editActualShift,
      clockIn: editWorkType === 'Worked Shift' || editWorkType === 'Overtime Duty' || editWorkType === 'On-Call Callout' ? editClockIn : '',
      clockOut: editWorkType === 'Worked Shift' || editWorkType === 'Overtime Duty' || editWorkType === 'On-Call Callout' ? editClockOut : '',
      lunchBreakMinutes: editWorkType === 'Worked Shift' ? Math.max(0, parseInt(editLunchBreak) || 0) : 0,
      deviationReason: editDeviation || undefined,
      isModified: true
    };

    // Reevaluate hours according to Zambian business rules
    updatedDay = reevaluateTimesheetDay(updatedDay, selectedDay.date, holidays);

    const updatedDays = { ...myTimesheet.days, [selectedDay.date]: updatedDay };
    const updatedTimesheet: Timesheet = {
      ...myTimesheet,
      days: updatedDays,
      status: myTimesheet.status === 'Rejected' ? 'Draft' : myTimesheet.status // Back to Draft on adjustment
    };

    onUpdateTimesheet(updatedTimesheet);
    setSelectedDay(null);
  };

  // Submit whole cycle timesheet
  const handleSubmitTimesheet = async () => {
    if (myTimesheet.status === 'Submitted' || myTimesheet.status === 'Approved') return;

    if (await confirm({ title: 'Submit your timesheet?', message: 'Locks the full cycle and sends it to your manager for payroll review. You won’t be able to edit hours after this.', confirmLabel: 'Submit' })) {
      const updated: Timesheet = {
        ...myTimesheet,
        status: 'Submitted',
        submittedAt: new Date().toISOString().substring(0, 16).replace('T', ' ')
      };
      onUpdateTimesheet(updated);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      
      {/* Upper Status Panel */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        
        {/* Status Tracker */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[10px] text-gray-400 font-bold">Timesheet State</span>
              <h3 className="text-xl font-black mt-1 flex items-center gap-1.5">
                {myTimesheet.status === 'Draft' && <span className="text-slate-500 font-sans">📄 Draft Mode</span>}
                {myTimesheet.status === 'Submitted' && <span className="text-indigo-600 font-sans">⏳ Pending Review</span>}
                {myTimesheet.status === 'Approved' && <span className="text-emerald-700 font-sans">✓ Certified Approved</span>}
                {myTimesheet.status === 'Rejected' && <span className="text-rose-600 font-sans">⚠️ Disapproved</span>}
              </h3>
            </div>
            <span className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase font-black tracking-wider ${
              myTimesheet.status === 'Approved' ? 'bg-emerald-100 text-emerald-800' :
              myTimesheet.status === 'Submitted' ? 'bg-indigo-100 text-indigo-700' :
              myTimesheet.status === 'Rejected' ? 'bg-rose-100 text-rose-800 animate-pulse' : 'bg-slate-100 text-slate-700'
            }`}>
              {myTimesheet.status}
            </span>
          </div>

          <div className="mt-3 text-[10.5px]">
            {isLocked ? (
              <p className="text-slate-500 flex items-center gap-1"><Lock className="w-3.5 h-3.5" /> Log locked for payroll protection.</p>
            ) : (
              <p className="text-[#005c93] flex items-center gap-1 font-semibold"><Unlock className="w-3.5 h-3.5" /> Edits open. Clock adjustments active.</p>
            )}
          </div>
        </div>

        {/* Regular standard hours */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between">
          <div>
            <span className="text-[10px] text-gray-400 font-bold">Regular net worked</span>
            <h3 className="text-slate-800 text-2xl font-black mt-1">{totals.regular} h</h3>
            <p className="text-[11px] text-slate-500 font-medium mt-1">Capped standard: {activeStaff.contractedHours} h</p>
          </div>
          <div className="p-3.5 bg-slate-50 text-slate-400 rounded-xl">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
        </div>

        {/* sunday worked */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between">
          <div>
            <span className="text-[10px] text-gray-400 font-bold">Sunday hours worked</span>
            <h3 className="text-[#005c93] text-2xl font-black mt-1">{totals.sunday} h</h3>
            <p className="text-[11px] text-[#005c93]/70 font-semibold mt-1">1.5x Premium rate</p>
          </div>
          <div className="p-3.5 bg-sky-50 text-[#005c93] rounded-xl">
            <Clock className="w-5 h-5 animate-[pulse_3s_infinite]" />
          </div>
        </div>

        {/* Approved Overtime & Holiday */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between">
          <div>
            <span className="text-[10px] text-gray-400 font-bold">OT & Holiday Premium</span>
            <h3 className="text-amber-600 text-2xl font-black mt-1">+{totals.overtime + totals.holiday} h</h3>
            <p className="text-[11px] text-slate-500 font-medium mt-1">OT: {totals.overtime}h · Holiday: {totals.holiday}h</p>
          </div>
          <div className="p-3.5 bg-amber-50 text-amber-500 rounded-xl">
            <Clock className="w-5 h-5" />
          </div>
        </div>

      </div>

      {/* Critiques and Rejections Alert Panel */}
      {myTimesheet.status === 'Rejected' && (
        <div className="bg-rose-50 border border-rose-250 rounded-2xl p-5 text-rose-800 flex items-start gap-4">
          <AlertCircle className="w-6 h-6 shrink-0 mt-0.5 text-rose-600 animate-[bounce_1s_infinite_alternate]" />
          <div className="flex-1">
            <h4 className="font-extrabold text-sm text-[rgb(122,18,48)] font-sans">Supervisor Review Return Checklist</h4>
            <p className="text-xs mt-1 leading-relaxed text-slate-700">
              Your timesheet has been returned for corrections by <strong className="font-bold underline text-slate-800">{myTimesheet.approvedBy || "the workspace director"}</strong>:
            </p>
            <div className="mt-2 bg-white/70 rounded-xl p-3 border border-rose-150 text-[11px] font-mono leading-relaxed text-slate-800 max-h-20 overflow-y-auto italic shadow-inner">
              "{myTimesheet.managerComment || "No diagnostic details left. Please review logs and rectify overlapping clock discrepancies."}"
            </div>
            <p className="text-[10.5px] text-rose-700 mt-2.5 font-bold">⚠️ Instructions: Select returned dates, modify clock-in/out registers, and re-submit entire timesheet.</p>
          </div>
        </div>
      )}

      {/* Main Timesheet Records Table */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
        
        {/* Table Upper Header */}
        <div className="p-5 border-b border-gray-100 bg-slate-50/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h3 className="text-slate-800 font-black text-sm uppercase">Active Cycle Timesheet Journals</h3>
            <p className="text-[11px] text-gray-400 mt-0.5">Continuous logging grid from {cycleDates[0]} to {cycleDates[cycleDates.length-1]}</p>
          </div>
          
          <div className="flex gap-2">
            <button
              onClick={() => setShowPrintView(true)}
              className="py-2 px-4 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-black text-xs rounded-xl cursor-pointer shadow-xs flex items-center gap-1.5"
            >
              <Printer className="w-4 h-4 text-[#005c93]" /> Print Pay Record
            </button>
            
            {!isLocked && (
              <button
                onClick={handleSubmitTimesheet}
                className="py-2 px-4.5 bg-[#005c93] hover:bg-[#003764] text-white font-black text-xs rounded-xl cursor-pointer shadow-md flex items-center gap-1.5 animate-[pulse_6s_infinite] tracking-wider uppercase"
              >
                <Send className="w-4 h-4 text-sky-200" /> Submit To Supervisor
              </button>
            )}
          </div>
        </div>

        {/* Detailed Logs List */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-400 font-mono text-[11px] border-b border-gray-100 select-none">
                <th className="py-3.5 px-5 font-bold">Date of Month</th>
                <th className="py-3.5 px-3 font-bold">Scheduled Roster</th>
                <th className="py-3.5 px-3 font-bold">Classification type</th>
                <th className="py-3.5 px-3 font-bold">Actual Clocks</th>
                <th className="py-3.5 px-3 font-bold text-center">Unpaid Break</th>
                <th className="py-3.5 px-3 font-bold text-center">Regular (Std)</th>
                <th className="py-3.5 px-3 font-bold text-center">Sunday (1.5x)</th>
                <th className="py-3.5 px-3 font-bold text-center">Overtime</th>
                <th className="py-3.5 px-3 font-bold text-center">Holiday (2x)</th>
                <th className="py-3.5 px-4 font-bold text-center">Record edits</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {cycleDates.map(dateStr => {
                const day = myTimesheet.days[dateStr];
                if (!day) return null;

                const originalShift = SHIFTS[day.scheduledShift];
                const actualShift = SHIFTS[day.actualShift];
                
                const isPH = isPublicHoliday(dateStr, holidays);
                const isSun = new Date(dateStr + 'T00:00:00').getDay() === 0;

                const hasClocks = day.clockIn && day.clockOut;

                return (
                  <tr 
                    key={dateStr}
                    className={`hover:bg-slate-50/50 transition-colors ${
                      day.isModified ? 'bg-amber-50/20' : ''
                    } ${
                      isSun ? 'font-semibold' : ''
                    }`}
                  >
                    {/* Date */}
                    <td className="py-3.5 px-5 font-bold text-slate-800">
                      <div className="flex flex-col">
                        <span>
                          {new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                        </span>
                        {isPH && <span className="text-[10px] text-red-500 font-bold select-none mt-0.5">★ Public Holiday</span>}
                      </div>
                    </td>

                    {/* Scheduled shift */}
                    <td className="py-3.5 px-3">
                      <span 
                        style={{ backgroundColor: originalShift?.bg, color: originalShift?.fg }}
                        className="font-mono font-bold text-[11px] uppercase px-2 py-1 rounded inline-block border border-black/5"
                      >
                        {day.scheduledShift}
                      </span>
                    </td>

                    {/* Work Type classification */}
                    <td className="py-3.5 px-3">
                      <div className="flex flex-col">
                        <span className={`font-semibold ${
                          day.workType === 'Leave Taken' ? 'text-indigo-600' :
                          day.workType === 'Overtime Duty' ? 'text-amber-600' :
                          day.workType === 'Absent' ? 'text-slate-400 font-normal italic' : 'text-slate-800'
                        }`}>
                          {day.workType}
                        </span>
                        {day.leaveHours > 0 && (
                          <span className="text-[11px] text-slate-400 font-mono font-bold">Credited: +8h</span>
                        )}
                      </div>
                    </td>

                    {/* Actual Clocks */}
                    <td className="py-3.5 px-3 font-mono font-bold text-[11px] text-slate-700">
                      {hasClocks ? (
                        <div className="flex items-center gap-1 text-slate-900 bg-slate-100 border border-slate-200 py-1 px-2.5 rounded-lg w-max">
                          <span>{day.clockIn}</span>
                          <ArrowRight className="w-3 h-3 text-slate-400" />
                          <span>{day.clockOut}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic font-mono">- - : - -</span>
                      )}
                    </td>

                    {/* Lunch Break duration */}
                    <td className="py-3.5 px-3 text-center text-slate-500 font-mono text-[11px]">
                      {hasClocks && day.lunchBreakMinutes > 0 ? `${day.lunchBreakMinutes}m` : '-'}
                    </td>

                    {/* regular worked hours */}
                    <td className="py-3.5 px-3 text-center font-extrabold text-[#1f3864] font-mono select-all text-[11.5px]">
                      {day.regularWorkedHours > 0 ? `${day.regularWorkedHours}h` : '-'}
                    </td>

                    {/* sunday worked */}
                    <td className="py-3.5 px-3 text-center font-black text-[#005c93] font-mono text-[11.5px]">
                      {day.sundayWorkedHours > 0 ? `${day.sundayWorkedHours}h` : '-'}
                    </td>

                    {/* overtime hours */}
                    <td className="py-3.5 px-3 text-center font-black text-amber-600 font-mono text-[11.5px]">
                      {day.overtimeHours > 0 ? `+${day.overtimeHours}h` : '-'}
                    </td>

                    {/* holiday worked */}
                    <td className="py-3.5 px-3 text-center font-black text-emerald-600 font-mono text-[11.5px]">
                      {day.holidayWorkedHours > 0 ? `${day.holidayWorkedHours}h` : '-'}
                    </td>

                    {/* Edit control */}
                    <td className="py-3.5 px-4 text-center">
                      {!isLocked ? (
                        <button
                          onClick={() => handleEditDayClick(day)}
                          className="p-2 border border-slate-150 rounded-xl hover:bg-[#005c93]/5 hover:border-[#005c93]/30 hover:text-[#005c93] text-slate-500 transition-all cursor-pointer inline-flex items-center"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <Lock className="w-3.5 h-3.5 text-slate-300 mx-auto" />
                      )}
                    </td>
                    
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

      </div>

      {/* Side edit-day overlay modal drawer */}
      {selectedDay && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <form 
            onSubmit={handleSaveDay}
            className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-gray-150 relative"
          >
            
            {/* Modal Header */}
            <div className="flex justify-between items-center border-b border-slate-100 pb-3.5 mb-5">
              <div>
                <h3 className="font-sans font-black text-base text-[#005c93] flex items-center gap-1.5">
                  <span>✎</span> Log Actual Clock - {new Date(selectedDay.date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                </h3>
                <p className="text-[10px] text-slate-400 mt-0.5 font-bold font-mono">
                  Scheduled block: {selectedDay.scheduledShift} ({SHIFTS[selectedDay.scheduledShift]?.name})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDay(null)}
                className="p-1 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-col gap-4.5 mb-6">
              
              {/* Actual Work classification */}
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase font-mono tracking-wider block">Logged Duty classification</label>
                <select
                  value={editWorkType}
                  onChange={(e) => setEditWorkType(e.target.value as any)}
                  className="w-full text-xs font-semibold bg-slate-50 border border-slate-150 rounded-xl p-3 mt-1.5 outline-none focus:border-[#009EE2] transition-colors"
                >
                  <option value="Worked Shift">Worked Scheduled Shift</option>
                  <option value="Overtime Duty">Overtime Extra Duty</option>
                  <option value="On-Call Callout">Worked Call-out Active hours</option>
                  <option value="Leave Taken">Leave Taken (Paid Leave)</option>
                  <option value="Absent">Day Off (Rest / Absent)</option>
                </select>
              </div>

              {/* Dynamic inputs based on work classification */}
              {(editWorkType === 'Worked Shift' || editWorkType === 'Overtime Duty' || editWorkType === 'On-Call Callout') && (
                <div className="flex flex-col gap-4">
                  
                  {/* Actual Shift Code link */}
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase font-mono tracking-wider block">Duty category pattern</label>
                    <select
                      value={editActualShift}
                      onChange={(e) => setEditActualShift(e.target.value)}
                      className="w-full text-xs font-semibold bg-slate-50 border border-slate-150 rounded-xl p-3 mt-1.5 outline-none focus:border-[#009EE2] transition-colors"
                    >
                      {Object.entries(SHIFTS).filter(([c, def]) => def.hours > 0).map(([c, def]) => (
                        <option key={c} value={c}>{c} — {def.name} ({def.time})</option>
                      ))}
                    </select>
                  </div>

                  {/* Clock-In & Out Row */}
                  <div className="grid grid-cols-2 gap-3.5">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase font-mono tracking-wider block">Check-in Time</label>
                      <input
                        type="time"
                        value={editClockIn}
                        onChange={(e) => setEditClockIn(e.target.value)}
                        className="w-full text-xs font-mono font-bold bg-slate-50 border border-slate-150 rounded-xl p-3 mt-1.5 outline-none focus:border-[#009EE2] text-center"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase font-mono tracking-wider block">Check-out Time</label>
                      <input
                        type="time"
                        value={editClockOut}
                        onChange={(e) => setEditClockOut(e.target.value)}
                        className="w-full text-xs font-mono font-bold bg-slate-50 border border-slate-150 rounded-xl p-3 mt-1.5 outline-none focus:border-[#009EE2] text-center"
                        required
                      />
                    </div>
                  </div>

                  {/* Lunch Break deduction */}
                  {editWorkType === 'Worked Shift' && (
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase font-mono tracking-wider block">Unpaid meal deduction duration</label>
                      <select
                        value={editLunchBreak}
                        onChange={(e) => setEditLunchBreak(e.target.value)}
                        className="w-full text-xs font-semibold bg-slate-50 border border-slate-150 rounded-xl p-3 mt-1.5 outline-none focus:border-[#009EE2] transition-colors"
                      >
                        <option value="0">No lunch / Night break (0m)</option>
                        <option value="30">30 Minutes lunch break</option>
                        <option value="45">45 Minutes lunch break</option>
                        <option value="60">1 Hour unpaid lunch break (60m)</option>
                      </select>
                    </div>
                  )}

                </div>
              )}

              {/* Leave picker selection */}
              {editWorkType === 'Leave Taken' && (
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase font-mono tracking-wider block">Credited Leave Type</label>
                  <select
                    value={editActualShift}
                    onChange={(e) => setEditActualShift(e.target.value)}
                    className="w-full text-xs font-semibold bg-slate-50 border border-slate-150 rounded-xl p-3 mt-1.5 outline-none focus:border-[#009EE2] transition-colors"
                  >
                    {activeLeaveTypes.map(([code, def]) => (
                      <option key={code} value={code}>{code} — {def.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Absence picker */}
              {editWorkType === 'Absent' && (
                <div className="bg-slate-50 border border-slate-150 rounded-2xl p-4 text-[10.5px] text-slate-500 font-medium leading-relaxed">
                  📢 Committing this day as 'Absent/Day Off' zero-rates this day's net payroll calculations entirely. Scheduled off-shifts do not require clock logs.
                </div>
              )}

              {/* Deviation description */}
              {editWorkType !== 'Absent' && (
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase font-mono tracking-wider block">Deviation / Overtime comment details</label>
                  <textarea
                    value={editDeviation}
                    onChange={(e) => setEditDeviation(e.target.value)}
                    rows={2}
                    placeholder="e.g. Covered a late shift change, or finished tasks after the scheduled end time."
                    className="w-full text-xs font-medium bg-slate-50 border border-slate-150 rounded-xl p-3 mt-1.5 outline-none focus:border-[#009EE2] transition-colors leading-relaxed placeholder-slate-400"
                  />
                </div>
              )}

            </div>

            {/* Actions button row */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setSelectedDay(null)}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer text-center"
              >
                Dismiss
              </button>
              <button
                type="submit"
                className="flex-1 py-3 bg-[#005c93] hover:bg-[#003764] text-white font-bold text-xs rounded-xl shadow-md cursor-pointer flex items-center justify-center gap-1"
              >
                <Save className="w-4 h-4" /> Save Actual Log
              </button>
            </div>

          </form>
        </div>
      )}

      {/* Official Zambian Timesheet paperwork printing overlay */}
      {showPrintView && (
        <div className="fixed inset-0 bg-slate-900/85 backdrop-blur-md flex items-start justify-center p-4 z-[100] overflow-y-auto print:bg-white print:p-0 print:static print:block">
          {/* Printing only the dedicated #timesheetPrintable layout below —
              the live page (nav, modal backdrop, action buttons) never goes
              to paper, and the table gets its own landscape page sized to
              fit one sheet instead of however the on-screen scroll container
              happened to clip it. */}
          <style>{`
            @media print {
              @page { size: A4 landscape; margin: 10mm; }
              body * { visibility: hidden; }
              #timesheetPrintable, #timesheetPrintable * { visibility: visible; }
              #timesheetPrintable { position: absolute; top: 0; left: 0; width: 100%; }
            }
          `}</style>
          <div className="bg-white rounded-3xl max-w-4xl w-full p-6 shadow-2xl relative my-auto print:shadow-none print:rounded-none print:max-w-none print:p-0 print:my-0">

            {/* Action buttons on printing screen — never printed */}
            <div className="flex justify-between items-center pb-4 mb-4 border-b border-gray-100 select-none print:hidden">
              <span className="text-xs text-slate-500 font-mono font-bold uppercase">Official Payroll Stamp Template</span>
              <div className="flex gap-2">
                <button
                  onClick={() => window.print()}
                  className="py-2 px-4.5 bg-[#1f3864] hover:bg-[#13233e] text-white font-bold text-xs rounded-xl cursor-pointer flex items-center gap-1 shadow-md"
                >
                  <Printer className="w-4 h-4" /> Print Document
                </button>
                <button
                  onClick={() => setShowPrintView(false)}
                  className="py-2 px-4 border border-gray-200 bg-white hover:bg-gray-50 text-slate-700 font-semibold text-xs rounded-xl cursor-pointer"
                >
                  Close Preview
                </button>
              </div>
            </div>

            {/* Official Report Container */}
            <div id="timesheetPrintable" className="p-8 border border-gray-200 rounded-2xl bg-white font-sans max-h-[75vh] overflow-y-auto print:max-h-none print:overflow-visible print:p-0 print:border-none print:shadow-none">
              
              {/* Report Header Logo Section */}
              <div className="border-b-2 border-[#1f3864] pb-5 mb-5 text-center">
                <h2 className="text-[#009EE2] font-extrabold text-base">{activeFacility?.name}</h2>
                <h3 className="text-gray-800 text-xs font-bold uppercase mt-1">{activeFacility?.location}</h3>
                <p className="text-[10px] text-gray-500 mt-2 font-black text-rose-800">Official Cycle Timesheet Record</p>
              </div>

              {/* Master Data Grid Header */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs tracking-tight border-b border-gray-100 pb-5 mb-5">
                <div>
                  <span className="text-[11px] text-slate-400 font-mono font-bold uppercase block">Employee Name</span>
                  <span className="font-bold text-slate-900 uppercase">{activeStaff.fullName}</span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 font-mono font-bold uppercase block">Employee Number</span>
                  <span className="font-mono font-bold text-slate-800">{activeStaff.employeeNo || '—'}</span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 font-mono font-bold uppercase block">{taxonomy.memberSingular} Role</span>
                  <span className="font-semibold text-slate-700">{activeStaff.role}</span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 font-mono font-bold uppercase block">Roster Cycle Period</span>
                  <span className="font-mono font-semibold text-slate-600">
                    {cycleDates.length > 0
                      ? `${new Date(cycleDates[0] + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} – ${new Date(cycleDates[cycleDates.length - 1] + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
                      : '—'}
                  </span>
                </div>
              </div>

              {/* Paper table log */}
              <table className="w-full text-left text-[10px] border border-gray-200 uppercase">
                <thead>
                  <tr className="bg-slate-100 border-b border-gray-200 font-mono text-[10px] text-slate-600">
                    <th className="py-2.5 px-3 border-r border-gray-200 whitespace-nowrap">Date</th>
                    <th className="py-2.5 px-2 border-r border-gray-200 text-center">Scheduled</th>
                    <th className="py-2.5 px-3 border-r border-gray-200 text-center">Clocked In – Out</th>
                    <th className="py-2.5 px-2 border-r border-gray-200 text-center">Break</th>
                    <th className="py-2.5 px-2 border-r border-gray-200 text-center bg-blue-50/50">Std Net</th>
                    <th className="py-2.5 px-2 border-r border-gray-200 text-center bg-rose-50/50">Premium (Sun/PH)</th>
                    <th className="py-2.5 px-2 border-r border-gray-200 text-center">Overtime</th>
                    <th className="py-2.5 px-3">Log Audit Comments / Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-250 font-mono">
                  {cycleDates.map(dateStr => {
                    const d = myTimesheet.days[dateStr];
                    if (!d) return null;
                    return (
                      <tr key={dateStr} className="hover:bg-slate-50 border-b border-gray-200">
                        <td className="py-2 px-3 border-r border-gray-200 font-bold font-sans">
                          {new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' })} ({new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short' }).substring(0,2)})
                        </td>
                        <td className="py-2 px-2 border-r border-gray-200 text-center font-bold">
                          {d.scheduledShift}
                        </td>
                        <td className="py-2 px-3 border-r border-gray-200 text-center font-bold font-sans">
                          {d.clockIn ? `${d.clockIn} – ${d.clockOut}` : 'ABSENT / OFF'}
                        </td>
                        <td className="py-2 px-2 border-r border-gray-200 text-center">
                          {d.clockIn && d.lunchBreakMinutes > 0 ? `${d.lunchBreakMinutes}m` : '-'}
                        </td>
                        <td className="py-2 px-2 border-r border-gray-200 text-center bg-blue-50/20 font-sans font-bold text-slate-900">
                          {d.regularWorkedHours > 0 ? `${d.regularWorkedHours}h` : '-'}
                        </td>
                        <td className="py-2 px-2 border-r border-gray-200 text-center bg-rose-50/20 font-sans font-bold text-[#7A1230]">
                          {/* A day is never both Sunday-worked and a public holiday, so
                              one column can safely show whichever premium rate applies. */}
                          {d.holidayWorkedHours > 0 ? `${d.holidayWorkedHours}h (PH 2x)` : d.sundayWorkedHours > 0 ? `${d.sundayWorkedHours}h (Sun 1.5x)` : '-'}
                        </td>
                        <td className="py-2 px-2 border-r border-gray-200 text-center font-sans font-bold">
                          {d.overtimeHours > 0 ? `${d.overtimeHours}h` : '-'}
                        </td>
                        <td className="py-2 px-3 text-slate-500 max-w-xs truncate normal-case font-sans italic text-[11px]">
                          {d.workType === 'Leave Taken' ? `${d.actualShift} Leave Authorized` : d.deviationReason || '-'}
                        </td>
                      </tr>
                    );
                  })}

                  {/* Summary row */}
                  <tr className="bg-slate-100 font-sans font-extrabold border-t-2 border-gray-400 text-xs text-slate-800 select-all">
                    <td colSpan={4} className="py-3 px-3 text-right uppercase font-mono tracking-wider">Payroll totals:</td>
                    <td className="py-3 px-2 text-center bg-blue-100/70 text-slate-900">{totals.regular} h</td>
                    <td className="py-3 px-2 text-center bg-rose-100/70 text-[#7A1230] text-[10px]">
                      {/* Unlike the per-day cells, a full cycle can include both
                          Sunday and holiday work, so the total shows both parts. */}
                      Sun {totals.sunday}h · PH {totals.holiday}h
                    </td>
                    <td className="py-3 px-2 text-center bg-amber-100/50 text-slate-950">{totals.overtime} h</td>
                    <td className="py-3 px-3 italic font-semibold text-[#1f3864]">Aggregate worked: {totals.total} net hrs</td>
                  </tr>
                </tbody>
              </table>

              {/* Legal confirmation and Sign-offs slots bottom */}
              <div className="mt-8 pt-8 grid grid-cols-1 md:grid-cols-3 gap-6 text-xs border-t border-dashed border-gray-200 select-none">
                <div className="flex flex-col gap-6">
                  <div>
                    <span className="font-extrabold block text-slate-400 text-[10px] font-mono">Employee Signature</span>
                    <div className="border-b border-gray-300 w-44 mt-6"></div>
                    <span className="text-[10px] text-gray-500 font-mono italic mt-1.5 inline-block">Date Signed: ____/____/2026</span>
                  </div>
                  <p className="text-[11px] text-gray-400 capitalize hover:underline italic">I certify that the above worked clock-hours are true, accurate, and correct.</p>
                </div>

                <div className="flex flex-col gap-6">
                  <div>
                    <span className="font-extrabold block text-slate-400 text-[10px] font-mono">Supervisor Authorization</span>
                    <div className="border-b border-gray-300 w-44 mt-6"></div>
                    <span className="text-[10px] text-gray-400 font-mono italic mt-1.5 inline-block">{activeFacility?.leadManager ? `Authorized by: ${activeFacility.leadManager}` : ''}</span>
                  </div>
                  <p className="text-[11px] text-gray-400 lowercase italic">authorized pursuant to company guidelines.</p>
                </div>

                <div className="border border-slate-200 border-dashed rounded-xl p-4 flex flex-col justify-between h-28 w-44 bg-slate-50 text-center">
                  <span className="text-[10px] text-slate-400 font-mono uppercase font-bold text-center block">Site Officer Stamp</span>
                  <div className="border-2 border-slate-100 border-dashed bg-white h-12 w-12 rounded-full mx-auto flex items-center justify-center text-[10px] font-bold text-slate-300">
                    STAMP
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}
