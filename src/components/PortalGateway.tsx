import React, { useState } from 'react';
import { 
  ShieldCheck, 
  User, 
  Building2, 
  MapPin, 
  Fingerprint, 
  HeartHandshake, 
  UserPlus, 
  Lock, 
  Sparkles, 
  Plus, 
  ChevronRight, 
  ArrowRight, 
  CheckCircle2, 
  Network,
  Users
} from 'lucide-react';
import { StaffMember, Facility, Department } from '../types';
import { useToast } from './ui/ToastProvider';

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
  onCreateFacility: (newFac: Facility) => void;
  onCreateDepartment?: (newDept: Department) => void;
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
  onCreateFacility,
  onCreateDepartment,
  taxonomy,
}: PortalGatewayProps) {
  const toast = useToast();

  // Onboarding form states
  const [fullName, setFullName] = useState(firebaseUser?.displayName || '');
  const [employeeNo, setEmployeeNo] = useState(() => `EMP-${Math.floor(1000 + Math.random() * 9000)}`);
  const [phone, setPhone] = useState('');
  const [selectedDeptId, setSelectedDeptId] = useState('');
  const [role, setRole] = useState('');
  const [isManager, setIsManager] = useState(false);
  const [gender, setGender] = useState<'F' | 'M' | ''>('');
  const [selectedFacId, setSelectedFacId] = useState(selectedFacilityId || (facilities[0]?.id || ''));
  const [isDemoUserSelectOpen, setIsDemoUserSelectOpen] = useState(false);

  // New custom facility registration states
  const [newFacName, setNewFacName] = useState('');
  const [newFacLocation, setNewFacLocation] = useState('');
  const [newFacManager, setNewFacManager] = useState('');

  // New custom department registration states
  const [newDeptName, setNewDeptName] = useState('');
  const [newDeptDesc, setNewDeptDesc] = useState('');

  // Active facility lists
  const activeFacilityDepartments = departments.filter(d => d.facilityId === selectedFacId);

  // Form validations - includes dynamic workspace fields check if creating a new workspace/department
  const isFormValid = 
    fullName.trim().length > 2 && 
    role.trim().length > 2 && 
    employeeNo.trim().length > 2 &&
    (selectedFacId !== 'new_fac_option' || (newFacName.trim().length > 1 && newFacLocation.trim().length > 1)) &&
    (selectedDeptId !== 'new_dept_option' || newDeptName.trim().length > 1);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid || !firebaseUser) return;

    let finalFacId = selectedFacId;
    if (selectedFacId === 'new_fac_option') {
      if (!newFacName.trim() || !newFacLocation.trim()) {
        toast.error('Please enter a name and location for your new workspace.');
        return;
      }
      const parsedId = newFacName.toLowerCase().replace(/[^a-z0-9]/g, '-');
      const customFac: Facility = {
        id: parsedId,
        name: newFacName.trim(),
        location: newFacLocation.trim(),
        leadManager: newFacManager.trim() || fullName,
        facilitiesType: 'Primary Care',
        fridgeTargetTemp: '2.0% – 8.0% SLA',
        dailyKpiWordCheck: 'Checklist compliance',
        ipDevice: '192.168.10.12'
      };
      
      // Provision the Workspace dynamically
      onCreateFacility(customFac);
      finalFacId = parsedId;
    }

    let finalDeptId = selectedDeptId;
    if (selectedDeptId === 'new_dept_option') {
      if (!newDeptName.trim()) {
        toast.error('Please enter a name for your new department.');
        return;
      }
      const parsedDeptId = `${finalFacId}-${newDeptName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
      const customDept: Department = {
        id: parsedDeptId,
        facilityId: finalFacId,
        name: newDeptName.trim(),
        description: newDeptDesc.trim() || 'Custom department/team.'
      };
      if (onCreateDepartment) {
        onCreateDepartment(customDept);
      }
      finalDeptId = parsedDeptId;
    }

    const shortName = fullName.split(' ')[0] || fullName;
    const newStaff: StaffMember = {
      id: `staff-${Math.random().toString(36).substring(2, 11)}`,
      name: shortName,
      email: firebaseUser.email,
      phone: phone || '+260 970 000 000',
      role: role,
      contractedHours: 168,
      gender: gender,
      fullName: fullName,
      employeeNo: employeeNo,
      isManager: isManager,
      facilityId: finalFacId,
      departmentId: finalDeptId && finalDeptId !== 'new_dept_option' ? finalDeptId : undefined
    };

    onSelfOnboard(newStaff);
  };

  // Rendering Standard Entrance View (Unauthenticated)
  if (!firebaseUser && !isSandboxBypassActive) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 md:p-8 overflow-hidden relative selection:bg-indigo-500/30 selection:text-white">
        
        {/* Abstract Ambient Glow Blobs */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl -z-10 animate-pulse duration-[6000ms]"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-slate-800/20 rounded-full blur-3xl -z-10 animate-pulse duration-[8000ms]"></div>

        <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-12 bg-slate-950/40 border border-slate-800/80 rounded-[2.5rem] shadow-2xl overflow-hidden backdrop-blur-xl animate-in fade-in duration-500">
          
          {/* Left Panel: High impact brand showcase */}
          <div className="lg:col-span-5 bg-gradient-to-br from-indigo-900 via-slate-900 to-indigo-950 p-8 md:p-12 flex flex-col justify-between text-white relative">
            <div className="absolute inset-0 bg-radial-gradient(from_center,_rgba(0,0,0,0)_60%,_rgba(0,0,0,0.5))"></div>
            
            <div className="relative z-10">
              {/* Custom Medical Cross / Network Icon */}
              <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 shadow-lg shadow-indigo-500/10">
                <Network className="w-6 h-6 text-indigo-300" />
              </div>
              
              <div className="mt-8">
                <span className="text-[10px] font-mono font-bold tracking-widest text-indigo-300 uppercase block">Team Rostering</span>
                <h1 className="text-3xl font-black tracking-tight leading-none text-white mt-1">
                  {taxonomy.appName} <br />
                  Connected Workspace
                </h1>
                <p className="text-sm p-0 m-0 text-slate-300 mt-4 leading-relaxed font-semibold">
                  Plan rosters, track hours, set work rules, and manage your team's daily tasks — all in one place.
                </p>
              </div>
            </div>

            <div className="relative z-10 space-y-4 pt-10 border-t border-white/10 mt-12 lg:mt-0">
              <div className="flex items-start gap-3">
                <ShieldCheck className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                <div className="text-xs">
                  <strong className="block text-white font-bold font-sans">Private by default</strong>
                  <span className="text-slate-300">Each team only sees its own schedules and tasks.</span>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Network className="w-4 h-4 text-sky-400 mt-0.5 shrink-0" />
                <div className="text-xs">
                  <strong className="block text-white font-bold font-sans">Built-in work rules</strong>
                  <span className="text-slate-300">Set hour limits, leave, and rest periods in a few clicks.</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Panel: Interactive Form Auth options */}
          <div className="lg:col-span-7 p-8 md:p-12 bg-[#090d16] flex flex-col justify-center border-t lg:border-t-0 lg:border-l border-slate-800/80">
            <div className="max-w-md w-full mx-auto space-y-8">
              
              <div>
                <span className="px-2.5 py-1 bg-indigo-500/10 border border-indigo-400/20 text-indigo-400 text-[10px] font-bold uppercase rounded-full tracking-wider inline-block">
                  🔒 CONTROL GATEWAY
                </span>
                <h2 className="text-2xl font-black text-white mt-3">Welcome to your Portal</h2>
                <p className="text-sm text-slate-400 mt-1 leading-relaxed">
                  Sign in with your Google account to see your roster and log your tasks.
                </p>
              </div>

              {/* AUTH GATEWAY BUTTONS */}
              <div className="space-y-4 pt-2">
                
                {/* Real Google Auth */}
                <button
                  onClick={onGoogleSignIn}
                  className="w-full py-4 px-5 bg-white text-slate-900 rounded-2xl hover:bg-slate-100 font-extrabold flex items-center justify-center gap-3 active:scale-[0.99] transition-all cursor-pointer shadow-lg shadow-white/5 group border border-transparent"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.85z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.85c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                  <span className="text-sm">Sign In with Google SSO</span>
                  <ArrowRight className="w-4 h-4 ml-1 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                </button>

                {/* DEMO / REVIEWER GATEWAY BYPASS */}
                <div className="relative pt-4 text-center">
                  <div className="absolute inset-0 flex items-center" aria-hidden="true">
                    <div className="w-full border-t border-slate-800"></div>
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-[#090d16] px-3 font-semibold text-slate-500 font-mono tracking-widest">quick simulator bypass</span>
                  </div>
                </div>

                <div className="bg-slate-900/45 border border-slate-800 p-5 rounded-2xl space-y-4">
                  <div className="flex items-start gap-2.5">
                    <Sparkles className="w-4 h-4 text-indigo-400 mt-0.5 shrink-0" />
                    <p className="text-[11px] text-slate-400 font-medium leading-relaxed">
                      <strong>Just exploring?</strong> Try the app without signing in — preview it as a sample manager or team member.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {/* Supervisor bypass */}
                    <button
                      onClick={() => {
                        const supervisor = staffList.find(s => s.isManager) || staffList[0];
                        if (supervisor) {
                          onSelectSandboxBypass(supervisor.id);
                        } else {
                          onBypassAsGuestManager();
                        }
                      }}
                      className="py-2.5 px-3 bg-slate-800/80 hover:bg-slate-700/80 rounded-xl text-left text-xs border border-slate-700/50 flex flex-col justify-between hover:border-indigo-500/40 transition-all cursor-pointer group"
                    >
                      <span className="text-[9px] text-indigo-400 uppercase font-mono tracking-wider block mb-1">Manager Access</span>
                      <strong className="text-slate-100 block truncate group-hover:text-indigo-300">
                        {staffList.find(s => s.isManager)?.name || "Default Manager"}
                      </strong>
                      <span className="text-[10px] text-slate-400 truncate">Create rosters & edit rules</span>
                    </button>

                    {/* General Staff member bypass */}
                    <button
                      onClick={() => {
                        const staffMember = staffList.find(s => !s.isManager) || staffList[1] || staffList[0];
                        if (staffMember) {
                          onSelectSandboxBypass(staffMember.id);
                        } else {
                          onSelectSandboxBypass('demo-member');
                        }
                      }}
                      className="py-2.5 px-3 bg-slate-800/80 hover:bg-slate-700/80 rounded-xl text-left text-xs border border-slate-700/50 flex flex-col justify-between hover:border-sky-500/40 transition-all cursor-pointer group"
                    >
                      <span className="text-[9px] text-sky-400 uppercase font-mono tracking-wider block mb-1">Standard member</span>
                      <strong className="text-slate-100 block truncate group-hover:text-sky-300">
                        {staffList.find(s => !s.isManager)?.name || "Default Operator"}
                      </strong>
                      <span className="text-[10px] text-slate-400 truncate">Personal task list</span>
                    </button>
                  </div>

                  <div className="pt-2 text-center">
                    <button
                      onClick={() => setIsDemoUserSelectOpen(!isDemoUserSelectOpen)}
                      className="text-[11px] font-black text-indigo-300 hover:text-white transition-colors flex items-center gap-1 mx-auto"
                    >
                      <span>Show all ({staffList.length}) preconfigured members</span>
                      <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isDemoUserSelectOpen ? 'rotate-90' : ''}`} />
                    </button>

                    {isDemoUserSelectOpen && (
                      <div className="mt-3 bg-slate-950 border border-slate-800 p-2.5 rounded-xl max-h-40 overflow-y-auto space-y-1 text-left scrollbar-thin">
                        {staffList.map(s => (
                          <button
                            key={s.id}
                            onClick={() => onSelectSandboxBypass(s.id)}
                            className="w-full text-left p-2 rounded-lg hover:bg-slate-900 transition-colors flex items-center justify-between gap-2 border border-transparent hover:border-slate-800/60"
                          >
                            <div className="flex flex-col">
                              <span className="text-xs font-bold text-slate-200">{s.fullName || s.name}</span>
                              <span className="text-[10px] text-slate-500">{s.role} • {s.isManager ? 'Manager' : 'Team member'}</span>
                            </div>
                            <span className="text-[9px] font-mono font-black text-[#009EE2] uppercase">Preview</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

              </div>

            </div>
          </div>

        </div>

        {/* Footer info banner */}
        <div className="mt-8 text-center text-slate-500 text-[11px] font-semibold max-w-sm tracking-wide">
          Your sign-in is secured by Google.
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
            <span className="px-2.5 py-0.8 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-extrabold rounded-full uppercase tracking-wider block w-max">
              ✨ PROFILE REGISTRATION
            </span>
            <h2 className="text-2xl font-black text-white mt-2">Finish Setting Up Your Profile</h2>
            <p className="text-slate-400 text-xs">
              We authenticated your session as <strong className="text-slate-200">{firebaseUser?.email}</strong>. Create your {taxonomy.memberSingular.toLowerCase()} profile to claim your workspace tasks.
            </p>
          </div>
          
          <button
            onClick={onSignOut}
            className="text-[10px] font-black text-slate-400 hover:text-indigo-400 border border-slate-700 hover:border-indigo-400/30 px-3 py-1.5 rounded-xl transition-all uppercase tracking-wider cursor-pointer"
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
                  <option value="new_fac_option" className="text-emerald-400 font-bold">
                    + Register a New {taxonomy.workspaceSingular}...
                  </option>
                </select>
              </div>

              {selectedFacId === 'new_fac_option' && (
                <div className="mt-4 p-4 bg-slate-950/60 border border-slate-850 rounded-xl space-y-4 text-left animate-[fadeIn_0.15s_ease-out]">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <h4 className="text-[10.5px] font-black uppercase text-slate-200 tracking-wider">Dynamic Workspace Customization</h4>
                  </div>
                  <p className="text-[10px] text-slate-400 font-medium leading-relaxed m-0">
                    To connect your real workspace, specify your corporate site details below. They will dynamically register in the workspace switcher database.
                  </p>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-[fadeIn_0.1s_ease-out]">
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest font-mono">Workspace Name *</label>
                      <input
                        type="text"
                        required={selectedFacId === 'new_fac_option'}
                        placeholder="e.g. Mary Begg Clinic"
                        value={newFacName}
                        onChange={(e) => setNewFacName(e.target.value)}
                        className="w-full text-xs bg-slate-950 border border-slate-800 text-slate-100 rounded-xl p-2.5 outline-none focus:border-[#009EE2]"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest font-mono">Location / Region *</label>
                      <input
                        type="text"
                        required={selectedFacId === 'new_fac_option'}
                        placeholder="e.g. Lusaka, Zambia"
                        value={newFacLocation}
                        onChange={(e) => setNewFacLocation(e.target.value)}
                        className="w-full text-xs bg-slate-950 border border-slate-800 text-slate-100 rounded-xl p-2.5 outline-none focus:border-[#009EE2]"
                      />
                    </div>
                  </div>

                  <div className="space-y-1 animate-[fadeIn_0.1s_ease-out]">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest font-mono">Lead Supervisor *</label>
                    <input
                      type="text"
                      placeholder="Supervisor or Operations Director"
                      value={newFacManager}
                      onChange={(e) => setNewFacManager(e.target.value)}
                      className="w-full text-xs bg-slate-950 border border-slate-800 text-slate-100 rounded-xl p-2.5 outline-none focus:border-[#009EE2]"
                    />
                    <p className="text-[8px] text-slate-500 m-0 p-0 font-sans mt-0.5">Defaults to your full official name if left empty.</p>
                  </div>
                </div>
              )}
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
                  <option value="new_dept_option" className="text-[#009EE2] font-bold">
                    + Register a New Department...
                  </option>
                </select>
              </div>
              <span className="text-[9.5px] text-slate-500 font-medium block">
                Maps your daily duties into the appropriate departmental workspaces.
              </span>

              {/* Dynamic Department Creation Fields */}
              {selectedDeptId === 'new_dept_option' && (
                <div className="mt-4 p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-4 text-left animate-[fadeIn_0.15s_ease-out]">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <h4 className="text-[10.5px] font-black uppercase text-slate-200 tracking-wider">Configure Custom Department</h4>
                  </div>
                  <p className="text-[10px] text-slate-400 font-medium leading-relaxed m-0">
                    Define and configure your own custom department or operational team for this workspace.
                  </p>
                  
                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest font-mono">Department Name *</label>
                      <input
                        type="text"
                        required={selectedDeptId === 'new_dept_option'}
                        placeholder="e.g. Inpatient Ward, Emergency, ICU"
                        value={newDeptName}
                        onChange={(e) => setNewDeptName(e.target.value)}
                        className="w-full text-xs bg-slate-950 border border-slate-800 text-slate-100 rounded-xl p-2.5 outline-none focus:border-[#009EE2]"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest font-mono">Description / Objectives</label>
                      <textarea
                        placeholder="e.g. Core nursing shift roster group for inpatient unit"
                        value={newDeptDesc}
                        onChange={(e) => setNewDeptDesc(e.target.value)}
                        rows={2}
                        className="w-full text-xs bg-slate-950 border border-slate-800 text-slate-100 rounded-xl p-2.5 outline-none focus:border-[#009EE2]"
                      />
                    </div>
                  </div>
                </div>
              )}
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
                placeholder="e.g. +260 970 000 000"
              />
            </div>

            {/* Privilege Level Selection (Manager vs Staff) */}
            <div className="space-y-1.5">
              <label className="text-[10.5px] uppercase font-mono tracking-wider font-extrabold text-slate-400">Roster Access Mode</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setIsManager(false)}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all ${
                    !isManager 
                      ? 'bg-indigo-505/10 border-indigo-500 text-indigo-400' 
                      : 'border-slate-800 text-slate-400 hover:bg-slate-800/40'
                  }`}
                >
                  General Member
                </button>
                <button
                  type="button"
                  onClick={() => setIsManager(true)}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all ${
                    isManager 
                      ? 'bg-rose-500/10 border-rose-500 text-rose-400' 
                      : 'border-slate-800 text-slate-400 hover:bg-slate-800/40'
                  }`}
                >
                  Admin / Supervisor
                </button>
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
