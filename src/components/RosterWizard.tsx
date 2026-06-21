import React, { useState } from 'react';
import { StaffMember, ShiftDef, Department, AbsenceLog, RosterCycle } from '../types';
import { useToast } from './ui/ToastProvider';
import {
  X, Check, ChevronLeft, ChevronRight, Users, Clock, Calendar,
  CalendarOff, Sparkles, UserPlus, Plus, Trash2, ArrowRight, ListChecks,
} from 'lucide-react';

interface RosterWizardProps {
  isOpen: boolean;
  onClose: () => void;
  staffList: StaffMember[];
  onAddStaff: (s: StaffMember) => void; // routes through App so the new staff syncs to the cloud
  shifts: { [code: string]: ShiftDef };
  setShifts: (s: { [code: string]: ShiftDef }) => void;
  departments: Department[];
  selectedFacilityId: string;
  onGenerate: (absences: AbsenceLog[], scTeamSize: number, dateRange?: { startDate: string; endDate: string }) => void;
  onOpenRoster: () => void;
  // For light in-wizard tweaks after building
  activeCycle: RosterCycle | null;
  cycleDates: string[];
  updateShift: (staffId: string, dayIdx: number, code: string) => void;
}

const COLOR_PRESETS = [
  { bg: '#dbeafe', fg: '#1d4ed8' },
  { bg: '#dcfce7', fg: '#15803d' },
  { bg: '#fef3c7', fg: '#b45309' },
  { bg: '#fae8ff', fg: '#a21caf' },
  { bg: '#ffe4e6', fg: '#be123c' },
  { bg: '#e2e8f0', fg: '#334155' },
];

const STEPS = [
  { id: 1, label: 'Team', icon: Users },
  { id: 2, label: 'Shifts', icon: Clock },
  { id: 3, label: 'Dates', icon: Calendar },
  { id: 4, label: 'Leave & needs', icon: CalendarOff },
  { id: 5, label: 'Review', icon: ListChecks },
];

export default function RosterWizard({
  isOpen, onClose, staffList, onAddStaff, shifts, setShifts,
  departments, selectedFacilityId, onGenerate, onOpenRoster,
  activeCycle, cycleDates, updateShift,
}: RosterWizardProps) {
  const toast = useToast();
  const [step, setStep] = useState(1);

  // Step 1 — staff
  const [sName, setSName] = useState('');
  const [sRole, setSRole] = useState('Team Member');
  const [sDept, setSDept] = useState(departments[0]?.id || '');
  const [sHours, setSHours] = useState(40);

  // Step 2 — shifts
  const [shCode, setShCode] = useState('');
  const [shName, setShName] = useState('');
  const [shStart, setShStart] = useState('08:00');
  const [shEnd, setShEnd] = useState('17:00');
  const [shHours, setShHours] = useState(8);
  const [shColor, setShColor] = useState(0);

  // Step 3 — dates
  const [startDate, setStartDate] = useState('2026-06-15');
  const [endDate, setEndDate] = useState('2026-07-14');

  // Step 4 — leave & needs
  const [absences, setAbsences] = useState<AbsenceLog[]>([]);
  const [absStaff, setAbsStaff] = useState('');
  const [absType, setAbsType] = useState<'AL' | 'SL' | 'CO' | 'TRN' | 'OS'>('AL');
  const [absStart, setAbsStart] = useState('2026-06-15');
  const [absEnd, setAbsEnd] = useState('2026-06-18');
  const [perShift, setPerShift] = useState(3);

  // Step 5
  const [built, setBuilt] = useState(false);

  React.useEffect(() => {
    if (staffList.length > 0 && !absStaff) setAbsStaff(staffList[0].name);
  }, [staffList, absStaff]);

  if (!isOpen) return null;

  const activeShifts = Object.entries(shifts).filter(([code, d]) => d.active !== false && code !== 'OFF');

  const handleAddStaff = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sName.trim()) { toast.error('Enter a name.'); return; }
    const dept = departments.find(d => d.id === sDept) || departments[0];
    const newStaff: StaffMember = {
      id: `staff-${Date.now()}`,
      facilityId: selectedFacilityId,
      departmentId: dept?.id || undefined,
      name: sName.trim(),
      fullName: sName.trim(),
      email: `${sName.toLowerCase().replace(/\s+/g, '.')}@${selectedFacilityId || 'workspace'}.local`,
      phone: '',
      role: sRole,
      contractedHours: Number(sHours),
      employeeNo: `EMP-${Date.now().toString().slice(-5)}`,
      gender: 'M',
      isManager: false,
    };
    onAddStaff(newStaff); // persists locally AND to the cloud via App
    setSName('');
    toast.success(`Added ${newStaff.name}.`);
  };

  const handleAddShift = (e: React.FormEvent) => {
    e.preventDefault();
    const code = shCode.toUpperCase().trim();
    if (!code || !shName.trim()) { toast.error('Enter a code and a name.'); return; }
    if (shifts[code]) { toast.error(`Shift "${code}" already exists.`); return; }
    const c = COLOR_PRESETS[shColor];
    setShifts({
      ...shifts,
      [code]: { code, name: shName.trim(), time: `${shStart} – ${shEnd}`, hours: Number(shHours), bg: c.bg, fg: c.fg, active: true },
    });
    setShCode(''); setShName('');
    toast.success(`Added shift ${code}.`);
  };

  const handleAddAbsence = () => {
    const name = absStaff || staffList[0]?.name;
    if (!name) { toast.error('Select a staff member.'); return; }
    if (new Date(absStart) > new Date(absEnd)) { toast.error('End date must be on or after start.'); return; }
    setAbsences([...absences, { id: `abs-${Date.now()}`, staffName: name, startDate: absStart, endDate: absEnd, type: absType }]);
  };

  const handleBuild = () => {
    if (staffList.length === 0) { toast.error('Add at least one team member first.'); setStep(1); return; }
    onGenerate(absences, perShift, { startDate, endDate });
    setBuilt(true);
  };

  const labelCls = 'text-[10px] font-bold text-slate-500 uppercase tracking-wide block';
  const inputCls = 'w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg p-2.5 mt-1 outline-none focus:border-[#7A1230]';

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-3xl max-w-2xl w-full p-6 md:p-8 shadow-2xl border border-gray-150 relative max-h-[90vh] flex flex-col">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-2 hover:bg-slate-50 rounded-xl cursor-pointer">
          <X className="w-5 h-5" />
        </button>

        {/* Header + stepper */}
        <div className="mb-5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-amber-100 p-2.5 rounded-2xl text-amber-800"><Sparkles className="w-6 h-6" /></div>
            <div>
              <h2 className="font-sans font-black text-lg text-slate-900 tracking-tight">Build your roster</h2>
              <p className="text-xs text-slate-500 mt-0.5">A quick, guided setup — team, shifts, dates, then generate.</p>
            </div>
          </div>
          <div className="grid grid-cols-5 gap-1.5 mt-5">
            {STEPS.map(st => {
              const Icon = st.icon;
              const done = st.id < step;
              const active = st.id === step;
              return (
                <button key={st.id} onClick={() => setStep(st.id)}
                  className={`py-1.5 px-1 rounded-lg border text-center cursor-pointer transition-all ${active ? 'border-amber-500 bg-amber-50/60' : done ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-100 bg-slate-50/50'}`}>
                  <div className={`flex items-center justify-center gap-1 text-[10px] font-extrabold ${active ? 'text-amber-900' : done ? 'text-emerald-700' : 'text-slate-400'}`}>
                    {done ? <Check className="w-3 h-3" /> : <Icon className="w-3 h-3" />}
                    <span className="hidden sm:inline">{st.label}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
          {/* STEP 1 — TEAM */}
          {step === 1 && (
            <div className="space-y-4">
              <form onSubmit={handleAddStaff} className="bg-white border border-slate-200 p-4 rounded-2xl space-y-3">
                <h3 className="text-xs font-black text-slate-900 flex items-center gap-1.5"><UserPlus className="w-4 h-4 text-[#7A1230]" /> Add a team member</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div><label className={labelCls}>Full name</label><input value={sName} onChange={e => setSName(e.target.value)} placeholder="e.g. Alex Banda" className={inputCls} /></div>
                  <div><label className={labelCls}>Role</label><input value={sRole} onChange={e => setSRole(e.target.value)} placeholder="e.g. Nurse" className={inputCls} /></div>
                  <div><label className={labelCls}>Department</label>
                    <select value={sDept} onChange={e => setSDept(e.target.value)} className={inputCls}>
                      {departments.length === 0 && <option value="">(none)</option>}
                      {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                  <div><label className={labelCls}>Weekly hours</label><input type="number" value={sHours} onChange={e => setSHours(Number(e.target.value))} className={inputCls} /></div>
                </div>
                <button type="submit" className="w-full py-2.5 bg-[#4C0B1E] hover:bg-[#7A1230] text-white text-xs font-black rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"><Plus className="w-4 h-4" /> Add to team</button>
              </form>
              <div>
                <h4 className="text-[10px] font-bold text-slate-400 mb-2">Your team ({staffList.length})</h4>
                <div className="flex flex-wrap gap-1.5">
                  {staffList.map(s => <span key={s.id} className="text-[11px] font-bold bg-[#7A1230]/5 text-[#7A1230] border border-[#7A1230]/15 px-2.5 py-1 rounded-lg">{s.name} <span className="opacity-60">({s.role})</span></span>)}
                  {staffList.length === 0 && <span className="text-xs text-slate-400 italic">No one yet — add your first team member above.</span>}
                </div>
              </div>
            </div>
          )}

          {/* STEP 2 — SHIFTS */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h4 className="text-[10px] font-bold text-slate-400 mb-2">Your shifts</h4>
                <div className="flex flex-wrap gap-1.5">
                  {activeShifts.map(([code, d]) => (
                    <span key={code} className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 px-2 py-1 rounded-lg border border-slate-150 bg-slate-50">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: d.bg || d.fg }} /><strong className="text-slate-800">{code}</strong> {d.name}{d.time ? ` · ${d.time}` : ''}
                    </span>
                  ))}
                  {activeShifts.length === 0 && <span className="text-xs text-slate-400 italic">No shifts yet — add one below.</span>}
                </div>
              </div>
              <form onSubmit={handleAddShift} className="bg-white border border-slate-200 p-4 rounded-2xl space-y-3">
                <h3 className="text-xs font-black text-slate-900 flex items-center gap-1.5"><Clock className="w-4 h-4 text-[#7A1230]" /> Add / define a shift</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div><label className={labelCls}>Code</label><input value={shCode} onChange={e => setShCode(e.target.value)} placeholder="A" maxLength={3} className={inputCls} /></div>
                  <div className="col-span-1 md:col-span-3"><label className={labelCls}>Name</label><input value={shName} onChange={e => setShName(e.target.value)} placeholder="Morning" className={inputCls} /></div>
                  <div><label className={labelCls}>Start</label><input type="time" value={shStart} onChange={e => setShStart(e.target.value)} className={inputCls} /></div>
                  <div><label className={labelCls}>End</label><input type="time" value={shEnd} onChange={e => setShEnd(e.target.value)} className={inputCls} /></div>
                  <div><label className={labelCls}>Hours</label><input type="number" value={shHours} onChange={e => setShHours(Number(e.target.value))} className={inputCls} /></div>
                  <div><label className={labelCls}>Colour</label>
                    <div className="flex gap-1.5 mt-1.5">
                      {COLOR_PRESETS.map((c, i) => (
                        <button key={i} type="button" onClick={() => setShColor(i)} className={`w-6 h-6 rounded-lg border-2 ${shColor === i ? 'border-slate-800' : 'border-transparent'}`} style={{ background: c.bg }} />
                      ))}
                    </div>
                  </div>
                </div>
                <button type="submit" className="w-full py-2.5 bg-[#4C0B1E] hover:bg-[#7A1230] text-white text-xs font-black rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"><Plus className="w-4 h-4" /> Add shift</button>
              </form>
            </div>
          )}

          {/* STEP 3 — DATES */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="bg-slate-50/60 p-4 border border-slate-100 rounded-2xl text-xs text-slate-600 font-semibold flex gap-2">
                <Calendar className="w-5 h-5 text-amber-600 shrink-0" /> Choose the period this roster covers. A standard cycle is about a month.
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className={labelCls}>Start date</label><input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={inputCls} /></div>
                <div><label className={labelCls}>End date</label><input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className={inputCls} /></div>
              </div>
            </div>
          )}

          {/* STEP 4 — LEAVE & NEEDS */}
          {step === 4 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white border border-slate-200 p-4 rounded-2xl space-y-3">
                <h3 className="text-xs font-black text-slate-900">Planned leave</h3>
                <div><label className={labelCls}>Staff member</label>
                  <select value={absStaff} onChange={e => setAbsStaff(e.target.value)} className={inputCls}>
                    {staffList.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                  </select>
                </div>
                <div><label className={labelCls}>Type</label>
                  <select value={absType} onChange={e => setAbsType(e.target.value as any)} className={inputCls}>
                    <option value="AL">Annual Leave</option>
                    <option value="SL">Sick Leave</option>
                    <option value="CO">Compassionate</option>
                    <option value="TRN">Training</option>
                    <option value="OS">Off-site</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className={labelCls}>From</label><input type="date" value={absStart} onChange={e => setAbsStart(e.target.value)} className={inputCls} /></div>
                  <div><label className={labelCls}>To</label><input type="date" value={absEnd} onChange={e => setAbsEnd(e.target.value)} className={inputCls} /></div>
                </div>
                <button onClick={handleAddAbsence} className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-extrabold rounded-lg cursor-pointer">+ Add leave period</button>
              </div>
              <div className="space-y-4">
                <div className="bg-slate-50/60 border border-slate-200/50 p-4 rounded-2xl space-y-2">
                  <label className="text-xs font-extrabold text-slate-700 flex items-center gap-1.5"><Users className="w-4 h-4 text-[#7A1230]" /> People needed on shift</label>
                  <input type="number" min={1} value={perShift} onChange={e => setPerShift(Math.max(1, parseInt(e.target.value) || 1))} className="w-20 text-xs font-black bg-white border border-slate-200 rounded-xl p-2.5 text-center text-[#7A1230]" />
                  <p className="text-[10px] text-slate-400">How many people you want on the busiest shifts.</p>
                </div>
                {absences.length > 0 && (
                  <div className="border border-amber-200 bg-amber-50/20 rounded-2xl p-3 max-h-32 overflow-y-auto">
                    <h4 className="text-[10px] font-bold text-amber-800 mb-1">Leave added ({absences.length})</h4>
                    <div className="flex flex-col gap-1 text-[10px] font-bold text-slate-600">
                      {absences.map(a => (
                        <div key={a.id} className="flex justify-between items-center bg-white border border-slate-100 px-2 py-1 rounded">
                          <span>{a.staffName} · {a.type} · {a.startDate}→{a.endDate}</span>
                          <button onClick={() => setAbsences(absences.filter(x => x.id !== a.id))} className="text-rose-500 hover:text-rose-700 cursor-pointer"><Trash2 className="w-3 h-3" /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 5 — REVIEW */}
          {step === 5 && (
            <div className="space-y-4">
              {!built ? (
                <>
                  <div className="bg-slate-50/60 p-4 border border-slate-100 rounded-2xl">
                    <h3 className="text-xs font-black text-slate-900 mb-3">Ready to build</h3>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="flex items-center gap-2"><Users className="w-4 h-4 text-slate-400" /> <strong>{staffList.length}</strong> team members</div>
                      <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-slate-400" /> <strong>{activeShifts.length}</strong> shifts</div>
                      <div className="flex items-center gap-2"><Calendar className="w-4 h-4 text-slate-400" /> {startDate} → {endDate}</div>
                      <div className="flex items-center gap-2"><CalendarOff className="w-4 h-4 text-slate-400" /> <strong>{absences.length}</strong> leave periods</div>
                      <div className="flex items-center gap-2"><Users className="w-4 h-4 text-slate-400" /> <strong>{perShift}</strong> needed on busy shifts</div>
                    </div>
                  </div>
                  {staffList.length === 0 && <p className="text-[11px] text-rose-600 font-semibold">Add at least one team member (step 1) before building.</p>}
                  <p className="text-[11px] text-slate-500">We'll auto-build a balanced roster. You can review coverage gaps and fine-tune any cell afterward.</p>
                </>
              ) : (
                <div className="space-y-4">
                  <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 flex items-center gap-3">
                    <div className="inline-flex bg-emerald-500 text-white p-2.5 rounded-2xl shrink-0"><Check className="w-5 h-5" strokeWidth={3} /></div>
                    <div>
                      <h3 className="text-base font-black text-slate-900">Roster built 🎉</h3>
                      <p className="text-xs text-slate-500">Quick-adjust the first week below, or open the full roster to review coverage gaps.</p>
                    </div>
                  </div>

                  {/* Light in-wizard tweak: first-week editable mini-grid */}
                  {activeCycle && cycleDates.length > 0 && (() => {
                    const days = cycleDates.slice(0, 7);
                    const codes = ['OFF', ...Object.keys(shifts).filter(c => c !== 'OFF' && shifts[c].active !== false)];
                    return (
                      <div className="border border-slate-200 rounded-2xl overflow-x-auto">
                        <table className="w-full text-[11px]">
                          <thead>
                            <tr className="bg-slate-50 text-slate-500">
                              <th className="text-left p-2 font-bold sticky left-0 bg-slate-50">Staff</th>
                              {days.map((d, i) => <th key={i} className="p-1 font-bold whitespace-nowrap">{d.slice(8)}/{d.slice(5, 7)}</th>)}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {staffList.map(s => (
                              <tr key={s.id}>
                                <td className="p-2 font-bold text-slate-700 whitespace-nowrap sticky left-0 bg-white">{s.name}</td>
                                {days.map((_, dIdx) => {
                                  const val = activeCycle.shifts[s.id]?.[dIdx] || 'OFF';
                                  return (
                                    <td key={dIdx} className="p-1">
                                      <select
                                        value={val}
                                        onChange={e => updateShift(s.id, dIdx, e.target.value)}
                                        className="w-full text-[11px] font-bold bg-slate-50 border border-slate-200 rounded p-1 outline-none cursor-pointer"
                                        style={{ color: shifts[val]?.fg }}
                                      >
                                        {codes.map(c => <option key={c} value={c}>{c}</option>)}
                                      </select>
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  })()}

                  <div className="flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm rounded-xl cursor-pointer">Done</button>
                    <button onClick={() => { onOpenRoster(); onClose(); }} className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl cursor-pointer inline-flex items-center gap-1.5">Open full roster <ArrowRight className="w-4 h-4" /></button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {!built && (
          <div className="flex justify-between items-center gap-3 border-t border-slate-100 pt-4 mt-4 shrink-0">
            <button onClick={() => step === 1 ? onClose() : setStep(step - 1)} className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl flex items-center gap-1 cursor-pointer">
              <ChevronLeft className="w-4 h-4" /> {step === 1 ? 'Cancel' : 'Back'}
            </button>
            {step < 5 ? (
              <button onClick={() => setStep(step + 1)} className="py-2.5 px-4 bg-[#7A1230] hover:bg-[#4C0B1E] text-white font-bold text-xs rounded-xl flex items-center gap-1 cursor-pointer">
                Next <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button onClick={handleBuild} className="py-2.5 px-5 bg-gradient-to-r from-[#4C0B1E] via-[#7A1230] to-[#E29E25] text-white font-black text-xs rounded-xl flex items-center gap-1.5 shadow-md cursor-pointer">
                <Sparkles className="w-4 h-4 text-amber-200" /> Build roster
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
