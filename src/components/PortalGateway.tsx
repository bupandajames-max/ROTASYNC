import React, { useState } from 'react';
import {
  User,
  Building2,
  Fingerprint,
  UserPlus,
  Lock,
  ChevronRight,
  ArrowRight,
  Network,
} from 'lucide-react';
import { StaffMember, Facility, Department } from '../types';

interface PortalGatewayProps {
  firebaseUser: any;
  onGoogleSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
  staffList: StaffMember[];
  facilities: Facility[];
  departments: Department[];
  selectedFacilityId: string;
  onSelfOnboard: (newStaff: StaffMember) => void;
  onSelectSandboxBypass: (staffId: string) => void;
  isSandboxBypassActive: boolean;
  onBypassAsGuestManager: () => void;
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

export default function PortalGateway({
  firebaseUser,
  onGoogleSignIn,
  onSignOut,
  staffList,
  facilities,
  departments,
  selectedFacilityId,
  onSelfOnboard,
  onSelectSandboxBypass,
  isSandboxBypassActive,
  onBypassAsGuestManager,
  taxonomy,
}: PortalGatewayProps) {
  // Onboarding form states
  const [fullName, setFullName] = useState(firebaseUser?.displayName || '');
  const [employeeNo, setEmployeeNo] = useState(() => `EMP-${Math.floor(1000 + Math.random() * 9000)}`);
  const [phone, setPhone] = useState('');
  const [selectedDeptId, setSelectedDeptId] = useState('');
  const [role, setRole] = useState('');
  const [gender, setGender] = useState<'F' | 'M' | ''>('');
  const [selectedFacId, setSelectedFacId] = useState(selectedFacilityId || (facilities[0]?.id || ''));
  const [isDemoUserSelectOpen, setIsDemoUserSelectOpen] = useState(false);

  // Active facility lists
  const activeFacilityDepartments = departments.filter(d => d.facilityId === selectedFacId);

  // Joining always targets an existing facility — a brand-new user has no
  // Firestore permission to create a facility or department (rules require
  // facility_manager+/superuser for those), so the form can only ever offer
  // facilities/departments that already exist. See PortalGateway audit notes.
  const isFormValid =
    fullName.trim().length > 2 &&
    role.trim().length > 2 &&
    employeeNo.trim().length > 2 &&
    !!selectedFacId;

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid || !firebaseUser) return;

    const shortName = fullName.split(' ')[0] || fullName;
    const newStaff: StaffMember = {
      id: `staff-${Math.random().toString(36).substring(2, 11)}`,
      name: shortName,
      email: firebaseUser.email,
      phone: phone,
      role: role,
      contractedHours: 168,
      gender: gender,
      fullName: fullName,
      employeeNo: employeeNo,
      // Always joins as a general member — admin access can only be granted
      // afterward by an existing manager (see firestore.rules users/{uid}).
      isManager: false,
      facilityId: selectedFacId,
      departmentId: selectedDeptId || undefined,
    };

    onSelfOnboard(newStaff);
  };

  // Rendering Standard Entrance View (Unauthenticated)
  if (!firebaseUser && !isSandboxBypassActive) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50 flex flex-col items-center justify-center p-4 md:p-8 selection:bg-indigo-100">
        <div className="w-full max-w-sm">

          {/* Brand */}
          <div className="flex flex-col items-center text-center mb-8">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center border border-indigo-100">
              <Network className="w-6 h-6 text-indigo-500" />
            </div>
            <h1 className="text-xl font-extrabold text-slate-800 mt-4">{taxonomy.appName}</h1>
            <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">
              Plan rosters, track hours, and manage your team's daily tasks.
            </p>
          </div>

          {/* Main card */}
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 md:p-8">
            <button
              onClick={onGoogleSignIn}
              className="w-full py-3.5 px-5 bg-white text-slate-700 rounded-xl hover:bg-slate-50 font-bold flex items-center justify-center gap-3 active:scale-[0.99] transition-all cursor-pointer border border-slate-200 shadow-xs"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.85z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.85c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              <span className="text-sm">Sign in with Google</span>
            </button>

            <p className="text-center text-[11px] text-slate-400 mt-3">Your sign-in is secured by Google.</p>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center" aria-hidden="true">
                <div className="w-full border-t border-slate-100"></div>
              </div>
              <div className="relative flex justify-center">
                <span className="bg-white px-3 text-[11px] font-semibold text-slate-400">or just exploring?</span>
              </div>
            </div>

            {/* Secondary: demo / preview access — visually quieter than sign-in */}
            <div className="space-y-2.5">
              <button
                onClick={() => {
                  const supervisor = staffList.find(s => s.isManager) || staffList[0];
                  if (supervisor) {
                    onSelectSandboxBypass(supervisor.id);
                  } else {
                    onBypassAsGuestManager();
                  }
                }}
                className="w-full py-2.5 px-3.5 bg-slate-50 hover:bg-slate-100 rounded-xl text-left border border-slate-100 flex items-center justify-between transition-colors cursor-pointer group"
              >
                <span>
                  <strong className="text-xs font-bold text-slate-700 block">{staffList.find(s => s.isManager)?.name || "Sample manager"}</strong>
                  <span className="text-[11px] text-slate-400">Preview as a manager</span>
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500 group-hover:translate-x-0.5 transition-all shrink-0" />
              </button>

              <button
                onClick={() => {
                  const staffMember = staffList.find(s => !s.isManager) || staffList[1] || staffList[0];
                  if (staffMember) {
                    onSelectSandboxBypass(staffMember.id);
                  } else {
                    onSelectSandboxBypass('demo-member');
                  }
                }}
                className="w-full py-2.5 px-3.5 bg-slate-50 hover:bg-slate-100 rounded-xl text-left border border-slate-100 flex items-center justify-between transition-colors cursor-pointer group"
              >
                <span>
                  <strong className="text-xs font-bold text-slate-700 block">{staffList.find(s => !s.isManager)?.name || "Sample team member"}</strong>
                  <span className="text-[11px] text-slate-400">Preview as a team member</span>
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500 group-hover:translate-x-0.5 transition-all shrink-0" />
              </button>

              <button
                onClick={() => setIsDemoUserSelectOpen(!isDemoUserSelectOpen)}
                className="w-full text-[11px] font-bold text-slate-400 hover:text-slate-600 transition-colors flex items-center justify-center gap-1 pt-1 cursor-pointer"
              >
                <span>Show all {staffList.length} preview profiles</span>
                <ChevronRight className={`w-3 h-3 transition-transform ${isDemoUserSelectOpen ? 'rotate-90' : ''}`} />
              </button>

              {isDemoUserSelectOpen && (
                <div className="bg-slate-50 border border-slate-100 p-2 rounded-xl max-h-40 overflow-y-auto space-y-1 scrollbar-thin">
                  {staffList.map(s => (
                    <button
                      key={s.id}
                      onClick={() => onSelectSandboxBypass(s.id)}
                      className="w-full text-left p-2 rounded-lg hover:bg-white transition-colors flex items-center justify-between gap-2 border border-transparent hover:border-slate-200 cursor-pointer"
                    >
                      <span className="flex flex-col">
                        <span className="text-xs font-bold text-slate-700">{s.fullName || s.name}</span>
                        <span className="text-[10px] text-slate-400">{s.role} · {s.isManager ? 'Manager' : 'Team member'}</span>
                      </span>
                      <span className="text-[9px] font-bold text-indigo-500 uppercase shrink-0">Preview</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    );
  }

  // Rendering Self-Onboarding Setup View (User has signed in, but no profile was mapped)
  return (
    <div className="min-h-screen bg-slate-950/95 flex items-center justify-center p-4 py-12 md:p-8 selection:bg-indigo-500/30">
      <div className="w-full max-w-2xl bg-slate-900/60 border border-slate-800/80 rounded-[2rem] shadow-2xl p-6 md:p-10 backdrop-blur-xl animate-in zoom-in-95 duration-200">
        
        {/* Header containing name and auth details */}
        <div className="flex items-start justify-between border-b border-slate-800 pb-6 mb-8">
          <div className="space-y-1">
            <span className="px-2.5 py-0.8 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-extrabold rounded-full block w-max">
              ✨ PROFILE REGISTRATION
            </span>
            <h2 className="text-2xl font-black text-white mt-2">Finish Setting Up Your Profile</h2>
            <p className="text-slate-400 text-xs">
              We authenticated your session as <strong className="text-slate-200">{firebaseUser?.email}</strong>. Create your {taxonomy.memberSingular.toLowerCase()} profile to claim your workspace tasks.
            </p>
          </div>
          
          <button
            onClick={onSignOut}
            className="text-[10px] font-black text-slate-400 hover:text-indigo-400 border border-slate-700 hover:border-indigo-400/30 px-3 py-1.5 rounded-xl transition-all cursor-pointer"
          >
            Sign Out
          </button>
        </div>

        <form onSubmit={handleFormSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            
            {/* Full Name */}
            <div className="space-y-1.5">
              <label className="text-[10.5px] uppercase font-mono tracking-wider font-extrabold text-slate-400">Full Official Name</label>
              <div className="relative">
                <User className="absolute left-3 top-3.5 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full text-xs pl-10 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl focus:border-[#009EE2] text-slate-100 focus:outline-none"
                  placeholder="e.g. Gertrude Mwamba"
                />
              </div>
            </div>

            {/* Employment Registry ID */}
            <div className="space-y-1.5">
              <label className="text-[10.5px] uppercase font-mono tracking-wider font-extrabold text-slate-400">Personnel ID / Register Code</label>
              <div className="relative">
                <Fingerprint className="absolute left-3 top-3.5 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  required
                  value={employeeNo}
                  onChange={(e) => setEmployeeNo(e.target.value)}
                  className="w-full text-xs pl-10 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl focus:border-[#009EE2] text-slate-100 focus:outline-none"
                  placeholder="e.g. EMP-2405"
                />
              </div>
            </div>

            {/* Workplace Facility Workspace */}
            <div className="space-y-1.5 col-span-1 md:col-span-2 bg-slate-950/25 p-4 rounded-2xl border border-slate-800/80">
              <label className="text-[10.5px] uppercase font-mono tracking-wider font-extrabold text-slate-400 font-bold block mb-1">Target {taxonomy.workspaceSingular}</label>
              <div className="relative">
                <Building2 className="absolute left-3 top-3.5 w-4 h-4 text-slate-500" />
                <select
                  value={selectedFacId}
                  onChange={(e) => {
                    setSelectedFacId(e.target.value);
                    setSelectedDeptId(''); // reset dept
                  }}
                  className="w-full text-xs pl-10 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl focus:border-[#009EE2] text-slate-100 focus:outline-none appearance-none font-semibold"
                >
                  <option value="">-- Choose {taxonomy.workspaceSingular} --</option>
                  {facilities.map(f => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.location})
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-[9.5px] text-slate-500 font-medium mt-2">
                Don't see your {taxonomy.workspaceSingular.toLowerCase()}? Ask an existing manager there to set it up first.
              </p>
            </div>

            {/* Department selector */}
            <div className="space-y-1.5">
              <label className="text-[10.5px] uppercase font-mono tracking-wider font-extrabold text-slate-400 block mb-1">Assigned Department / Team</label>
              <div className="relative">
                <Network className="absolute left-3 top-3.5 w-4 h-4 text-slate-500" />
                <select
                  required
                  value={selectedDeptId}
                  onChange={(e) => setSelectedDeptId(e.target.value)}
                  className="w-full text-xs pl-10 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl focus:border-[#009EE2] text-slate-100 focus:outline-none appearance-none font-semibold"
                >
                  <option value="">-- Choose Assigned Group --</option>
                  {activeFacilityDepartments.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <span className="text-[9.5px] text-slate-500 font-medium block">
                Maps your daily duties into the appropriate departmental workspaces.
              </span>
            </div>

            {/* Designation / Role */}
            <div className="space-y-1.5 col-span-1 md:col-span-2">
              <label className="text-[10.5px] uppercase font-mono tracking-wider font-extrabold text-slate-400">Designation / Functional Role</label>
              <input
                type="text"
                required
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full text-xs px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl focus:border-[#009EE2] text-slate-100 focus:outline-none"
                placeholder="e.g. Operations Coordinator, Quality Analyst, Supervisor"
              />
            </div>

            {/* Contact details */}
            <div className="space-y-1.5">
              <label className="text-[10.5px] uppercase font-mono tracking-wider font-extrabold text-slate-400">Contact Number</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full text-xs px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl focus:border-[#009EE2] text-slate-100 focus:outline-none"
                placeholder="e.g. +1 555 0100"
              />
            </div>

            {/* Access level is no longer self-selected here — every new join starts
                as a general member. An existing manager grants admin access from
                inside the workspace afterward, so it can't be self-asserted at
                sign-up. */}
            <div className="space-y-1.5 col-span-1 md:col-span-2">
              <div className="text-[11px] text-slate-400 bg-slate-950/60 border border-slate-800 rounded-xl p-3 leading-relaxed">
                You'll join as a general member. If you need admin/supervisor access, ask an existing manager in this workspace to grant it once you're in.
              </div>
            </div>

          </div>

          <div className="bg-slate-950/40 border border-slate-800/80 p-4 rounded-2xl flex items-start gap-3 mt-4">
            <Lock className="w-5 h-5 text-indigo-300 mt-0.5 shrink-0" />
            <div className="text-xs text-slate-400 leading-relaxed font-semibold">
              <strong className="text-slate-200 block mb-0.5 font-bold">Secure Verification</strong>
              <span>
                Your authenticated Google email address <strong className="text-[#009EE2] font-semibold">{firebaseUser.email}</strong> is permanently linked to this profile. You can transition workspaces freely or switch simulation tracks instantly once recorded.
              </span>
            </div>
          </div>

          <div className="flex md:flex-row flex-col justify-between items-center gap-4 pt-6 mt-4 border-t border-slate-800">
            <span className="text-[10px] text-slate-500 font-bold font-mono">Session ID: {firebaseUser.uid.substring(0, 16).toUpperCase()}</span>
            
            <button
              type="submit"
              disabled={!isFormValid}
              className={`md:w-auto w-full py-4 px-8 rounded-2xl font-extrabold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                isFormValid
                  ? 'bg-indigo-650 hover:bg-indigo-600 text-white shadow-lg active:scale-98 bg-indigo-600'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-50'
              }`}
            >
              <UserPlus className="w-4 h-4" />
              <span>Complete Profile & Enter</span>
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
