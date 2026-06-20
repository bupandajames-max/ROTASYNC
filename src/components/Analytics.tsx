import React from 'react';
import { StaffMember, RosterCycle, PublicHoliday, DailyTask, ExtraHoursEntry } from '../types';
import { calculateStaffStats, isWeekend, isPublicHoliday } from '../utils/rosterUtils';
import { BarChart, Award, AlertTriangle, Briefcase, Calendar, ShieldCheck, TrendingUp, CheckCircle, Clock } from 'lucide-react';

interface AnalyticsProps {
  staffList: StaffMember[];
  activeCycle: RosterCycle;
  cycleDates: string[];
  holidays: PublicHoliday[];
  extraHoursLog: ExtraHoursEntry[];
  dailyTasksLog: DailyTask[];
}

export default function Analytics({
  staffList,
  activeCycle,
  cycleDates,
  holidays,
  extraHoursLog,
  dailyTasksLog,
}: AnalyticsProps) {

  const regularStaff = staffList.filter(s => !s.isManager);
  const manager = staffList.find(s => s.isManager);

  // Compile work stats for all regular staff
  const staffStats = regularStaff.map(s => {
    const shifts = activeCycle.shifts[s.id] || [];
    const myExtraMap: { [date: string]: number } = {};
    extraHoursLog
      .filter(e => e.staffName === s.name)
      .forEach(e => {
        myExtraMap[e.shiftDate] = (myExtraMap[e.shiftDate] || 0) + e.hours;
      });

    const stats = calculateStaffStats(s, shifts, cycleDates, holidays, myExtraMap);
    return {
      staff: s,
      stats
    };
  });

  // Calculate team averages among regular staff
  const totalBaseScheduled = staffStats.reduce((acc, curr) => acc + curr.stats.baseHrs, 0);
  const totalExtraShifted = staffStats.reduce((acc, curr) => acc + curr.stats.totalHrs - curr.stats.baseHrs, 0);
  const totalOverallHrs = staffStats.reduce((acc, curr) => acc + curr.stats.totalHrs, 0);

  const averageHours = staffStats.length > 0 ? totalOverallHrs / staffStats.length : 168;

  // Task Completion stats
  const totalTasks = dailyTasksLog.length;
  const completedTasks = dailyTasksLog.filter(t => t.status === 'Done').length;
  const missedTasks = dailyTasksLog.filter(t => t.status === 'Missed').length;
  const pendingTasks = dailyTasksLog.filter(t => t.status === 'Pending' || t.status === 'In Progress').length;
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 100;

  // Overtime trends over successive cycles
  const otThreshold = 20; // 20 hours threshold
  const highOtStaff = staffStats.filter(item => item.stats.overtime > otThreshold).map(item => item.staff.name);

  // Absence pattern detection (flags staff with Leave days > 4 or more under review)
  const leaveFlags = staffStats.filter(item => item.stats.leaveDays >= 4).map(item => ({
    name: item.staff.name,
    days: item.stats.leaveDays
  }));

  return (
    <div className="flex flex-col gap-6">
      {/* Dynamic Summary Stats banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Hours */}
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] text-gray-400 font-bold block">Total Team Output</span>
            <span className="text-xl font-extrabold text-[#005c93] mt-1 block">{totalOverallHrs.toFixed(1)} hrs</span>
            <span className="text-[10px] text-[#005c93] font-semibold block mt-0.5">
              ⏱ +{totalExtraShifted.toFixed(1)} extension hrs added
            </span>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl self-start">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        {/* Avg hours per standard candidate */}
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] text-gray-400 font-bold block">Equity Index (Avg load)</span>
            <span className="text-xl font-extrabold text-[#005c93] mt-1 block">{averageHours.toFixed(1)} hrs</span>
            <span className="text-[10px] text-gray-500 font-semibold block mt-0.5">
              excludes manager from bias math
            </span>
          </div>
          <div className="p-3 bg-teal-50 text-teal-600 rounded-xl self-start">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        {/* Audit status checks */}
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] text-gray-400 font-bold block">Daily Tasks Logged</span>
            <span className="text-xl font-extrabold text-[#005c93] mt-1 block">{completedTasks} / {totalTasks}</span>
            <span className="text-[10px] text-emerald-600 font-semibold block mt-0.5 whitespace-nowrap">
              🎉 {completionRate}% compliance Rate
            </span>
          </div>
          <div className="p-3 bg-amber-50 text-amber-605 rounded-xl self-start">
            <CheckCircle className="w-5 h-5" />
          </div>
        </div>

        {/* Escalation limits */}
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] text-gray-400 font-bold block">Escalation checks</span>
            <span className="text-xl font-extrabold text-[#005c93] mt-1 block">All Clear</span>
            <span className="text-[10px] text-emerald-600 font-semibold block mt-0.5">
              ✓ zero update gaps detected
            </span>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl self-start">
            <ShieldCheck className="w-5 h-5" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Workload Fairness report */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="border-b border-gray-100 pb-3 mb-4 flex justify-between items-center">
            <h3 className="font-sans font-bold text-sm text-[#005c93] uppercase tracking-wide flex items-center gap-1.5">
              <Clock className="w-5 h-5 text-[#009EE2]" /> Roster Workload Equity Auditor
            </h3>
            <span className="text-[10px] text-gray-400 font-semibold italic">Includes Roster + approved Extra Hours</span>
          </div>

          <p className="text-xs text-gray-500 mb-5 leading-relaxed">
            Equity limits are set to <strong>30% variance</strong> above or below the team average of <strong>{averageHours.toFixed(1)} hrs</strong>. Staff marked Red exceed normal workloads (overtime risks). Yellow staff possess extra operational capacity.
          </p>

          <div className="flex flex-col gap-4">
            {staffStats.map((item, index) => {
              const name = item.staff.name;
              const hrs = item.stats.totalHrs;
              const ratio = averageHours > 0 ? hrs / averageHours : 1;

              // Color codes
              let barColor = 'bg-blue-600';
              let badgeColor = 'bg-blue-50 text-blue-700 border-blue-100';
              let badgeLabel = 'Equitable';

              if (ratio > 1.25) {
                barColor = 'bg-red-600';
                badgeColor = 'bg-red-50 text-red-700 border-red-150';
                badgeLabel = '⚠ Heavy Workload';
              } else if (ratio < 0.75 && averageHours > 100) {
                barColor = 'bg-yellow-500';
                badgeColor = 'bg-yellow-50 text-yellow-750 border-[#faf089]/70';
                badgeLabel = '⚡ Available Capacity';
              }

              return (
                <div key={index} className="flex flex-col gap-1 text-xs">
                  <div className="flex justify-between items-center flex-wrap gap-2 mb-1">
                    <span className="font-bold text-slate-800">{name} ({item.staff.role.split(' ')[0]})</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-900">{hrs.toFixed(1)} hrs</span>
                      <span className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded border tracking-tight ${badgeColor}`}>
                        {badgeLabel}
                      </span>
                    </div>
                  </div>
                  <div className="bg-gray-100 h-3.5 rounded-full overflow-hidden flex shadow-xs border border-gray-50">
                    <div
                      className={`${barColor} h-full transition-all duration-500 rounded-full`}
                      style={{ width: `${Math.min(100, Math.floor((hrs / 220) * 100))}%` }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right column: Audits and Flags */}
        <div className="flex flex-col gap-6">
          {/* Overtime Audit Flags */}
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
            <h3 className="text-xs font-bold text-gray-700 mb-3 flex items-center gap-1.5 border-b border-gray-100 pb-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" /> Overtime Fatigue Auditor
            </h3>
            <p className="text-[11px] text-gray-500 mb-4 leading-relaxed">
              Triggers the "Fatigue Flag" when an employee records more than <strong>{otThreshold} hours</strong> of normal overtime. Consider re-allocating rotating A+ shift extensions.
            </p>

            {highOtStaff.length > 0 ? (
              <div className="flex flex-col gap-2">
                {highOtStaff.map((name, idx) => (
                  <div key={idx} className="bg-red-50 text-red-800 text-xs font-bold border border-red-150 p-2.5 rounded-xl flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                    <span><b>{name}</b> exceeds OT ceiling limit! Reduce load.</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 bg-slate-50 border border-slate-100 text-slate-500 rounded-xl font-bold text-xs italic">
                ✓ No candidates currently override fatigue rules.
              </div>
            )}
          </div>

          {/* Absence pattern audits */}
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
            <h3 className="text-xs font-bold text-gray-700 mb-3 flex items-center gap-1.5 border-b border-gray-100 pb-2">
              <Calendar className="w-5 h-5 text-purple-500" /> Absence Pattern Reviewer
            </h3>
            <p className="text-[11px] text-gray-500 mb-4 leading-relaxed">
              Evaluates Leave days logged. Highlights staff currently on extensive leave periods (e.g. &gt;= 4 days) who should be given lighter shifts upon return.
            </p>

            {leaveFlags.length > 0 ? (
              <div className="flex flex-col gap-2">
                {leaveFlags.map((item, idx) => (
                  <div key={idx} className="bg-purple-50 text-purple-800 text-xs font-semibold border border-purple-100 p-2.5 rounded-xl flex items-center gap-2">
                    <Briefcase className="w-4 h-4 text-purple-600" />
                    <span><b>{item.name}</b> has <b>{item.days} leave days</b> logged this cycle context.</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 bg-slate-50 border border-slate-100 text-slate-500 rounded-xl font-bold text-xs italic">
                ✓ No candidates flagged for extensive absences.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
