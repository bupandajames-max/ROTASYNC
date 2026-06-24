import React, { useState } from 'react';
import { Facility, Department, StaffMember, WorkspaceConfig, Taxonomy } from '../types';
import {
  buildDefaultWorkspaceConfig,
  HOLIDAY_PRESETS,
  getHolidayPreset,
} from '../data/initialData';
import {
  Network,
  Building2,
  Layers,
  Users,
  Globe,
  Check,
  ChevronRight,
  ChevronLeft,
  Plus,
  Trash2,
  Sparkles,
} from 'lucide-react';

interface SetupWizardProps {
  onComplete: (data: {
    facility: Facility;
    config: WorkspaceConfig;
    departments: Department[];
    staff: StaffMember[];
  }) => void;
  suggestedManagerName?: string;
  suggestedManagerEmail?: string;
  suggestedManagerRole?: string;
  onSignOut?: () => void;
}

const STEPS = [
  { id: 'org', label: 'Organization', icon: Building2 },
  { id: 'labels', label: 'Terminology', icon: Sparkles },
  { id: 'rules', label: 'Roster Rules', icon: Layers },
  { id: 'teams', label: 'Departments & Team', icon: Users },
  { id: 'regional', label: 'Regional', icon: Globe },
];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

export default function SetupWizard({ onComplete, suggestedManagerName = '', suggestedManagerEmail = '', suggestedManagerRole = 'Manager', onSignOut }: SetupWizardProps) {
  const [stepIdx, setStepIdx] = useState(0);

  // Step: Organization
  const [appName, setAppName] = useState('RotaSync');
  const [facName, setFacName] = useState('');
  const [facLocation, setFacLocation] = useState('');
  const [facType, setFacType] = useState('Branch');
  const [leadManager, setLeadManager] = useState(suggestedManagerName);

  // Step: Terminology (taxonomy)
  const [workspaceSingular, setWorkspaceSingular] = useState('Facility');
  const [groupSingular, setGroupSingular] = useState('Department');
  const [memberSingular, setMemberSingular] = useState('Staff Member');
  const [taskSingular, setTaskSingular] = useState('Task');

  // Step: Roster rules (high-level toggles; full editing lives in Enterprise Setup)
  const [personalDayOffEnabled, setPersonalDayOffEnabled] = useState(true);
  const [maxConsecutive, setMaxConsecutive] = useState(6);
  const [stockCountCount, setStockCountCount] = useState(3);

  // Step: Departments & Team
  const [departments, setDepartments] = useState<{ name: string; description: string }[]>([
    { name: '', description: '' },
  ]);
  const [team, setTeam] = useState<{ fullName: string; role: string; email: string; gender: 'F' | 'M' | ''; isManager: boolean }[]>([
    { fullName: suggestedManagerName, role: suggestedManagerRole, email: suggestedManagerEmail, gender: '', isManager: true },
  ]);

  // Step: Regional
  const [regionPresetId, setRegionPresetId] = useState<string>('none');
  const [timezoneLabel, setTimezoneLabel] = useState('');

  const pluralize = (s: string) => {
    const t = s.trim();
    if (!t) return t;
    if (/[^aeiou]y$/i.test(t)) return t.slice(0, -1) + 'ies';
    if (/(s|x|z|ch|sh)$/i.test(t)) return t + 'es';
    return t + 's';
  };

  const orgValid = facName.trim().length > 1 && facLocation.trim().length > 0 && leadManager.trim().length > 1;
  const teamValid = team.some(t => t.fullName.trim().length > 1) ;

  const canAdvance = () => {
    const id = STEPS[stepIdx].id;
    if (id === 'org') return orgValid;
    if (id === 'teams') return teamValid;
    return true;
  };

  const handleFinish = () => {
    const facId = slug(facName) || `workspace-${Date.now()}`;
    const facility: Facility = {
      id: facId,
      name: facName.trim(),
      location: facLocation.trim(),
      leadManager: leadManager.trim(),
      fridgeTargetTemp: '',
      dailyKpiWordCheck: '',
      ipDevice: '',
      facilitiesType: facType.trim() || 'Branch',
    };

    const taxonomy: Taxonomy = {
      appName: appName.trim() || 'RotaSync',
      workspaceSingular: workspaceSingular.trim() || 'Facility',
      workspacePlural: pluralize(workspaceSingular.trim() || 'Facility'),
      memberSingular: memberSingular.trim() || 'Staff Member',
      memberPlural: pluralize(memberSingular.trim() || 'Staff Member'),
      groupSingular: groupSingular.trim() || 'Department',
      groupPlural: pluralize(groupSingular.trim() || 'Department'),
      taskSingular: taskSingular.trim() || 'Task',
      taskPlural: pluralize(taskSingular.trim() || 'Task'),
    };

    const base = buildDefaultWorkspaceConfig();
    // Apply high-level rule choices to the default ruleset.
    base.ruleSet.restConstraints.maxConsecutiveWorkDays = Number(maxConsecutive) || 0;
    if (base.ruleSet.personalDayOff) base.ruleSet.personalDayOff.enabled = personalDayOffEnabled;
    base.ruleSet.autoAssignments = base.ruleSet.autoAssignments.map(a =>
      a.trigger === 'last-day' ? { ...a, count: Number(stockCountCount) || a.count } : a
    );

    const year = new Date().getFullYear();
    const preset = getHolidayPreset(regionPresetId);
    const holidays = preset ? preset.build(year) : [];

    const config: WorkspaceConfig = {
      ...base,
      holidays,
      timezoneLabel: timezoneLabel.trim(),
      regionPresetId: regionPresetId === 'none' ? undefined : regionPresetId,
      taxonomy,
    };

    const depts: Department[] = departments
      .filter(d => d.name.trim().length > 0)
      .map((d, i) => ({
        id: `${facId}-${slug(d.name) || `dept-${i}`}`,
        facilityId: facId,
        name: d.name.trim(),
        description: d.description.trim() || 'No description provided.',
      }));

    const staff: StaffMember[] = team
      .filter(t => t.fullName.trim().length > 0)
      .map((t, i) => {
        const display = t.fullName.trim().split(' ')[0];
        return {
          id: `staff-${facId}-${i}-${Date.now()}`,
          name: t.fullName.trim(),
          fullName: t.fullName.trim(),
          email: t.email.trim() || `${slug(display) || 'member'}@${facId}.workspace`,
          phone: '',
          role: t.role.trim() || 'Member',
          contractedHours: 168,
          gender: t.gender,
          employeeNo: `EMP-${1000 + i}`,
          isManager: t.isManager,
          facilityId: facId,
          departmentId: depts[0]?.id,
        };
      });

    // Guarantee at least one manager exists.
    if (staff.length && !staff.some(s => s.isManager)) staff[0].isManager = true;

    onComplete({ facility, config, departments: depts, staff });
  };

  const StepIcon = STEPS[stepIdx].icon;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white p-6 flex items-center gap-4">
          <div className="bg-[#009EE2] w-12 h-12 rounded-2xl flex items-center justify-center shrink-0">
            <Network className="w-6 h-6 text-sky-100" />
          </div>
          <div className="flex-1">
            <h1 className="text-lg font-black tracking-wide">Welcome — let's set up your workspace</h1>
            <p className="text-xs text-indigo-200/80 mt-0.5">No data yet. A few quick steps and you're ready to roster.</p>
          </div>
          {onSignOut && (
            <button
              onClick={onSignOut}
              className="text-[10px] font-bold text-indigo-200/80 hover:text-white border border-indigo-300/30 rounded-lg px-2.5 py-1.5 shrink-0"
            >
              Sign out
            </button>
          )}
        </div>

        {/* Stepper */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/60">
          {STEPS.map((s, i) => {
            const Ico = s.icon;
            const done = i < stepIdx;
            const current = i === stepIdx;
            return (
              <div key={s.id} className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black transition-colors ${
                  current ? 'bg-indigo-600 text-white' : done ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'
                }`}>
                  {done ? <Check className="w-4 h-4" /> : <Ico className="w-4 h-4" />}
                </div>
                <span className={`text-[10px] font-bold hidden sm:block ${current ? 'text-indigo-700' : 'text-slate-400'}`}>{s.label}</span>
              </div>
            );
          })}
        </div>

        {/* Body */}
        <div className="p-6 min-h-[300px]">
          <div className="flex items-center gap-2 mb-4">
            <StepIcon className="w-5 h-5 text-indigo-600" />
            <h2 className="text-base font-black text-slate-800">{STEPS[stepIdx].label}</h2>
          </div>

          {STEPS[stepIdx].id === 'org' && (
            <div className="space-y-4">
              <Field label="App / Product name">
                <input value={appName} onChange={e => setAppName(e.target.value)} className={inputCls} placeholder="e.g. RotaSync" />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Workspace name *">
                  <input value={facName} onChange={e => setFacName(e.target.value)} className={inputCls} placeholder="e.g. Acme Logistics – Lusaka" />
                </Field>
                <Field label="Location / Region *">
                  <input value={facLocation} onChange={e => setFacLocation(e.target.value)} className={inputCls} placeholder="e.g. Lusaka, Zambia" />
                </Field>
                <Field label="Workspace type">
                  <input value={facType} onChange={e => setFacType(e.target.value)} className={inputCls} placeholder="e.g. Branch, Warehouse, Clinic" />
                </Field>
                <Field label="Lead manager *">
                  <input value={leadManager} onChange={e => setLeadManager(e.target.value)} className={inputCls} placeholder="e.g. Davies Tembo" />
                </Field>
              </div>
            </div>
          )}

          {STEPS[stepIdx].id === 'labels' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-500">Rename the core concepts to match how your organization talks. These appear throughout the app.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="A workspace is called…"><input value={workspaceSingular} onChange={e => setWorkspaceSingular(e.target.value)} className={inputCls} placeholder="Facility / Site / Branch" /></Field>
                <Field label="A group is called…"><input value={groupSingular} onChange={e => setGroupSingular(e.target.value)} className={inputCls} placeholder="Department / Team / Unit" /></Field>
                <Field label="A person is called…"><input value={memberSingular} onChange={e => setMemberSingular(e.target.value)} className={inputCls} placeholder="Staff Member / Employee" /></Field>
                <Field label="A job is called…"><input value={taskSingular} onChange={e => setTaskSingular(e.target.value)} className={inputCls} placeholder="Task / Duty / Job" /></Field>
              </div>
            </div>
          )}

          {STEPS[stepIdx].id === 'rules' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-500">Sensible defaults are applied. You can fine-tune every rule later in Settings → Roster Rules.</p>
              <label className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-xl p-4">
                <span className="text-xs font-bold text-slate-700">Grant an optional personal day off mid-cycle</span>
                <input type="checkbox" checked={personalDayOffEnabled} onChange={e => setPersonalDayOffEnabled(e.target.checked)} className="w-5 h-5 accent-indigo-600" />
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Max consecutive working days">
                  <input type="number" min={0} max={14} value={maxConsecutive} onChange={e => setMaxConsecutive(Number(e.target.value))} className={inputCls} />
                </Field>
                <Field label="People auto-assigned to end-of-cycle count">
                  <input type="number" min={0} max={20} value={stockCountCount} onChange={e => setStockCountCount(Number(e.target.value))} className={inputCls} />
                </Field>
              </div>
            </div>
          )}

          {STEPS[stepIdx].id === 'teams' && (
            <div className="space-y-5">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-black text-slate-500">{groupSingular || 'Department'}s</span>
                  <button onClick={() => setDepartments([...departments, { name: '', description: '' }])} className="text-[11px] font-bold text-indigo-600 flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Add</button>
                </div>
                <div className="space-y-2">
                  {departments.map((d, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input value={d.name} onChange={e => setDepartments(departments.map((x, xi) => xi === i ? { ...x, name: e.target.value } : x))} className={inputCls} placeholder={`e.g. Dispatch, Warehouse`} />
                      {departments.length > 1 && (
                        <button onClick={() => setDepartments(departments.filter((_, xi) => xi !== i))} className="text-slate-400 hover:text-rose-600 p-2"><Trash2 className="w-4 h-4" /></button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-black text-slate-500">Team (at least one manager) *</span>
                  <button onClick={() => setTeam([...team, { fullName: '', role: 'Member', email: '', gender: '', isManager: false }])} className="text-[11px] font-bold text-indigo-600 flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Add</button>
                </div>
                <div className="space-y-2">
                  {team.map((t, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2 items-center bg-slate-50 border border-slate-100 rounded-xl p-2">
                      <input value={t.fullName} onChange={e => setTeam(team.map((x, xi) => xi === i ? { ...x, fullName: e.target.value } : x))} className={inputCls + ' col-span-4'} placeholder="Full name" />
                      <input value={t.role} onChange={e => setTeam(team.map((x, xi) => xi === i ? { ...x, role: e.target.value } : x))} className={inputCls + ' col-span-3'} placeholder="Role" />
                      <input value={t.email} onChange={e => setTeam(team.map((x, xi) => xi === i ? { ...x, email: e.target.value } : x))} className={inputCls + ' col-span-3'} placeholder="email" />
                      <label className="col-span-2 flex items-center gap-1 text-[10px] font-bold text-slate-600 justify-center">
                        <input type="checkbox" checked={t.isManager} onChange={e => setTeam(team.map((x, xi) => xi === i ? { ...x, isManager: e.target.checked } : x))} className="w-4 h-4 accent-indigo-600" />
                        Mgr
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {STEPS[stepIdx].id === 'regional' && (
            <div className="space-y-4">
              <Field label="Public holiday set">
                <select value={regionPresetId} onChange={e => setRegionPresetId(e.target.value)} className={inputCls}>
                  {HOLIDAY_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </Field>
              <Field label="Timezone label (display only)">
                <input value={timezoneLabel} onChange={e => setTimezoneLabel(e.target.value)} className={inputCls} placeholder="e.g. Zambia (CAT)" />
              </Field>
              <p className="text-[11px] text-slate-400">You can edit individual holidays anytime in Settings → Regional.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center px-6 py-4 border-t border-slate-100 bg-slate-50/60">
          <button
            onClick={() => setStepIdx(Math.max(0, stepIdx - 1))}
            disabled={stepIdx === 0}
            className="px-4 py-2 text-xs font-bold text-slate-500 disabled:opacity-40 flex items-center gap-1"
          >
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
          {stepIdx < STEPS.length - 1 ? (
            <button
              onClick={() => canAdvance() && setStepIdx(stepIdx + 1)}
              disabled={!canAdvance()}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-black text-xs rounded-xl flex items-center gap-1.5"
            >
              Continue <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleFinish}
              disabled={!teamValid}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-black text-xs rounded-xl flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" /> Create workspace
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const inputCls = 'w-full text-xs font-semibold bg-white border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-600';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] font-black text-slate-400">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
