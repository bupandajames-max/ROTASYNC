import React, { useState, useEffect, useRef } from 'react';
import { StaffMember, Facility } from '../types';
import { 
  Clock, 
  ShieldCheck, 
  User, 
  Building2, 
  Plus, 
  X, 
  Server, 
  Check, 
  ChevronDown, 
  Search, 
  Key, 
  Lock, 
  Fingerprint, 
  ShieldAlert, 
  SlidersHorizontal,
  Network,
  LogOut
} from 'lucide-react';
import { useToast } from './ui/ToastProvider';

interface HeaderProps {
  staffList: StaffMember[];
  activeStaffId: string;
  setActiveStaffId: (id: string) => void;
  isManagerView: boolean;
  setIsManagerView: (val: boolean) => void;
  accessLevel?: string;
  facilities: Facility[];
  selectedFacilityId: string;
  setSelectedFacilityId: (id: string) => void;
  onCreateFacility: (newFac: Facility) => void;
  firebaseUser?: any;
  onGoogleSignIn?: () => void;
  onSignOut?: () => void;
  taxonomy: {
    appName: string;
    organizationName?: string;
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

export default function Header({
  staffList,
  activeStaffId,
  setActiveStaffId,
  isManagerView,
  setIsManagerView,
  accessLevel,
  facilities,
  selectedFacilityId,
  setSelectedFacilityId,
  onCreateFacility,
  firebaseUser,
  onGoogleSignIn,
  onSignOut,
  taxonomy,
}: HeaderProps) {
  const toast = useToast();
  const [time, setTime] = useState(new Date());
  const [showProvisionModal, setShowProvisionModal] = useState(false);

  // Custom dropdown states for Facility switcher and Staff Identity selector
  const [isFacilityDropdownOpen, setIsFacilityDropdownOpen] = useState(false);
  const [facilitySearchQuery, setFacilitySearchQuery] = useState('');
  
  const [isStaffDropdownOpen, setIsStaffDropdownOpen] = useState(false);
  const [staffSearchQuery, setStaffSearchQuery] = useState('');

  const facilityRef = useRef<HTMLDivElement>(null);
  const staffRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (facilityRef.current && !facilityRef.current.contains(event.target as Node)) {
        setIsFacilityDropdownOpen(false);
      }
      if (staffRef.current && !staffRef.current.contains(event.target as Node)) {
        setIsStaffDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);
  
  // New facility form state
  const [newFacName, setNewFacName] = useState('');
  const [newFacLoc, setNewFacLoc] = useState('');
  const [newFacManager, setNewFacManager] = useState('');
  const [newFacType, setNewFacType] = useState('Branch');

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const activeStaff = staffList.find(s => s.id === activeStaffId);
  const activeFacility = facilities.find(f => f.id === selectedFacilityId) || facilities[0];

  const handleProvisionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFacName || !newFacLoc || !newFacManager) {
      toast.error('Please fill out all required fields.');
      return;
    }

    const newId = newFacName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const newFac: Facility = {
      id: newId,
      name: newFacName,
      location: newFacLoc,
      leadManager: newFacManager,
      facilitiesType: newFacType as any
    };

    onCreateFacility(newFac);
    
    // Reset form
    setNewFacName('');
    setNewFacLoc('');
    setNewFacManager('');
    setNewFacType('Branch');
    setShowProvisionModal(false);
  };

  // Only super users may switch between / create facilities. Everyone else is
  // pinned to the facility they belong to (the currently selected one).
  const canSwitchFacilities = accessLevel === 'superuser';
  const scopedFacilities = canSwitchFacilities
    ? facilities
    : facilities.filter(f => f.id === selectedFacilityId);
  const filteredFacilities = scopedFacilities.filter(f =>
    f.name.toLowerCase().includes(facilitySearchQuery.toLowerCase()) ||
    f.location.toLowerCase().includes(facilitySearchQuery.toLowerCase()) ||
    (f.facilitiesType && f.facilitiesType.toLowerCase().includes(facilitySearchQuery.toLowerCase()))
  );

  const filteredStaff = staffList.filter(s =>
    s.name.toLowerCase().includes(staffSearchQuery.toLowerCase()) ||
    s.role.toLowerCase().includes(staffSearchQuery.toLowerCase()) ||
    (s.employeeNo && s.employeeNo.toLowerCase().includes(staffSearchQuery.toLowerCase()))
  );

  return (
    <header className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white py-3.5 px-6 shadow-md border-b border-indigo-500/10 flex flex-col xl:flex-row justify-between items-center gap-4 sticky top-0 z-50">
      <div className="flex items-center gap-3 w-full xl:w-auto">
        {/* RotaSync Abstract Minimalist Emblem */}
        <div className="relative bg-[#009EE2] w-11 h-11 rounded-xl shadow-[0_4px_12px_rgba(0,158,226,0.3)] border border-indigo-400/30 flex justify-center items-center shrink-0 leading-none select-none">
          <Network className="w-6 h-6 text-sky-200" />
        </div>
        <div>
          <h1 className="font-sans font-black tracking-wider text-base md:text-lg flex items-center gap-2 flex-wrap text-white">
            {taxonomy.appName.toUpperCase()} <span className="text-[10px] bg-indigo-500/20 text-indigo-200 border border-indigo-400/35 px-2 py-0.5 rounded-full font-mono font-medium tracking-wide uppercase">ONLINE</span>
          </h1>
          {taxonomy.organizationName && (
            <p className="text-[10px] md:text-xs text-white/90 mt-0.5 font-bold tracking-wide">
              {taxonomy.organizationName}
            </p>
          )}
          <p className="text-[10px] md:text-xs text-indigo-200/80 mt-0.5 font-semibold tracking-wide">
            {activeFacility?.name} — {activeFacility?.location} {taxonomy.workspaceSingular}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto justify-end">
        
        {/* Firebase Live Cloud Auth Sync Indicator */}
        <div className="flex items-center gap-2 select-none">
          {firebaseUser ? (
            <div className="flex items-center gap-2 bg-[#0d1527] px-3 py-1.5 rounded-xl border border-emerald-500/40 text-[11px] font-bold shadow-inner text-emerald-300" title="Connected to cloud sync. Sign out from the Account menu.">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse border border-emerald-100 shrink-0" />
              <span className="hidden md:inline truncate max-w-[120px]">Signed in: {firebaseUser.email?.split('@')[0]}</span>
            </div>
          ) : (
            <button
              onClick={onGoogleSignIn}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black tracking-wide uppercase transition-all shadow-md bg-indigo-600 hover:bg-indigo-550 block text-white border border-indigo-400/35 cursor-pointer"
            >
              <Server className="w-3.5 h-3.5 text-sky-200" />
              Sign in
            </button>
          )}
        </div>
        
        {/* Dynamic Workspace Switcher */}
        <div className="relative select-none" ref={facilityRef}>
          <button
            onClick={() => setIsFacilityDropdownOpen(!isFacilityDropdownOpen)}
            className="flex items-center gap-2 bg-[#090d16] hover:bg-slate-950 active:bg-[#00213b] px-3 py-1.5 rounded-xl border border-indigo-500/20 shadow-inner text-left transition-all cursor-pointer text-white"
          >
            <Building2 className="w-3.5 h-3.5 text-sky-300 shrink-0" />
            <div className="flex flex-col leading-none">
              <span className="text-[11px] text-[#009EE2] font-bold block">Active {taxonomy.workspaceSingular.toLowerCase()}</span>
              <span className="text-xs font-black text-white flex items-center gap-1.5 mt-0.5 animate-none">
                {activeFacility?.name}
                <ChevronDown className={`w-3 h-3 text-sky-400 transition-transform ${isFacilityDropdownOpen ? 'rotate-180' : ''}`} />
              </span>
            </div>
          </button>

          {isFacilityDropdownOpen && (
            <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 p-3.5 text-slate-800 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="flex items-center gap-2 px-1 pb-2 border-b border-slate-100">
                <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-600" />
                <span className="text-[10px] font-bold text-slate-500">Switch {taxonomy.workspaceSingular.toLowerCase()}</span>
              </div>
              <div className="relative mt-2">
                <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder={`Search ${taxonomy.workspacePlural.toLowerCase()}...`}
                  value={facilitySearchQuery}
                  onChange={(e) => setFacilitySearchQuery(e.target.value)}
                  className="w-full text-xs pl-8 pr-3 py-2 border border-slate-200 bg-slate-50 rounded-lg text-slate-800 focus:outline-none focus:border-[#009EE2]"
                />
                {facilitySearchQuery && (
                  <button onClick={() => setFacilitySearchQuery('')} className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="max-h-56 overflow-y-auto mt-2 space-y-1.5 scrollbar-thin">
                {filteredFacilities.length === 0 ? (
                  <p className="text-center py-4 text-xs text-slate-400 font-medium">None found</p>
                ) : (
                  filteredFacilities.map((f) => {
                    const isActive = f.id === selectedFacilityId;
                    return (
                      <button
                        key={f.id}
                        onClick={() => {
                          setSelectedFacilityId(f.id);
                          setIsFacilityDropdownOpen(false);
                          setFacilitySearchQuery('');
                        }}
                        className={`w-full text-left p-2 rounded-xl flex items-center justify-between gap-2.5 transition-all text-slate-800 border ${
                          isActive 
                            ? 'bg-indigo-50/70 border-indigo-100' 
                            : 'hover:bg-slate-50 border-transparent'
                        }`}
                      >
                        <div className="flex items-start gap-2 max-w-[85%]">
                          <Building2 className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${isActive ? 'text-indigo-650' : 'text-slate-400'}`} />
                          <div className="flex flex-col leading-tight">
                            <span className="text-xs font-black truncate text-slate-900">{f.name}</span>
                            <span className="text-[10px] font-mono text-slate-500 truncate mt-0.5 uppercase tracking-tight">{f.location} • {f.facilitiesType}</span>
                          </div>
                        </div>
                        {isActive ? (
                          <div className="bg-sky-500/10 text-indigo-650 p-1 rounded-full shrink-0">
                            <Check className="w-3.5 h-3.5" />
                          </div>
                        ) : (
                          <span className="text-[11px] font-bold text-slate-400 shrink-0 hover:text-indigo-700">Switch</span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
              <div className="border-t border-slate-100 pt-2.5 mt-2.5 flex items-center justify-between">
                <span className="text-[10px] text-slate-450 font-medium font-sans">© {taxonomy.appName}</span>
                {canSwitchFacilities && (
                  <button
                    onClick={() => {
                      setIsFacilityDropdownOpen(false);
                      setShowProvisionModal(true);
                    }}
                    className="flex items-center gap-1 text-[10.5px] font-black text-indigo-600 hover:text-indigo-800 transition-colors"
                  >
                    <Plus className="w-3 h-3" /> Add {taxonomy.workspaceSingular}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
 
        {/* Profile Operator Picker */}
        <div className="relative select-none" ref={staffRef}>
          <button
            onClick={() => setIsStaffDropdownOpen(!isStaffDropdownOpen)}
            className="flex items-center gap-2 bg-[#090d16] px-3 py-1.5 rounded-xl border border-indigo-500/20 shadow-inner text-left transition-all text-white hover:bg-[#002d53] active:bg-[#00213b] cursor-pointer"
          >
            <User className="w-3.5 h-3.5 text-sky-300 shrink-0" />
            <div className="flex flex-col leading-none">
              <span className="text-[11px] text-sky-400 font-bold block">Account</span>
              <span className="text-xs font-black text-white flex items-center gap-1.5 mt-0.5 animate-none">
                {activeStaff?.name}
                <ChevronDown className={`w-3 h-3 text-sky-450 transition-transform ${isStaffDropdownOpen ? 'rotate-180' : ''}`} />
              </span>
            </div>
          </button>

          {isStaffDropdownOpen && (
            <div className="absolute right-0 mt-2 w-85 bg-white rounded-2xl shadow-2xl border border-slate-200 p-4 text-slate-800 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
              {/* Account + sign out — available to everyone */}
              <div className="flex flex-col gap-2 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Fingerprint className="w-4 h-4 text-indigo-900" />
                  <span className="text-[10px] font-bold text-slate-500">Account</span>
                </div>
                {firebaseUser ? (
                  <p className="text-[10px] text-slate-400 font-semibold truncate">
                    Signed in as <strong className="text-slate-600 font-bold">{firebaseUser.email}</strong>
                  </p>
                ) : (
                  <p className="text-[10px] text-slate-400 font-medium leading-relaxed mt-0.5">
                    Demo session — not signed in.
                  </p>
                )}
                <button
                  onClick={() => { setIsStaffDropdownOpen(false); onSignOut && onSignOut(); }}
                  className="mt-1 w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-bold border transition-colors cursor-pointer text-rose-600 bg-rose-50 hover:bg-rose-100 border-rose-200"
                >
                  <LogOut className="w-3.5 h-3.5" /> {firebaseUser ? 'Sign out' : 'Exit demo session'}
                </button>
              </div>

              {/* Inspect another member's view — managers only, when there are others to inspect */}
              {isManagerView && staffList.length > 1 && (
              <>
                <div className="flex items-center gap-1.5 mt-3 bg-indigo-50 rounded-xl p-2.5 border border-indigo-200 text-[10px] leading-relaxed text-indigo-900 font-semibold">
                  <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span><strong>Inspect staff view.</strong> Preview another member's schedule, tasks &amp; timesheet — view only; your own access is unchanged.</span>
                </div>

              <div className="relative mt-3">
                <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder={`Filter ${taxonomy.memberPlural.toLowerCase()}`}
                  value={staffSearchQuery}
                  onChange={(e) => setStaffSearchQuery(e.target.value)}
                  className="w-full text-xs pl-8 pr-3 py-2 border border-slate-200 bg-slate-50 rounded-lg text-slate-800 focus:outline-none focus:border-indigo-650"
                />
                {staffSearchQuery && (
                  <button onClick={() => setStaffSearchQuery('')} className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="max-h-56 overflow-y-auto mt-2.5 space-y-1.5 scrollbar-thin">
                {filteredStaff.length === 0 ? (
                  <p className="text-center py-4 text-xs text-slate-450 font-medium">None found</p>
                ) : (
                  filteredStaff.map((s) => {
                    const isActive = s.id === activeStaffId;
                    const initials = s.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
                    return (
                      <button
                        key={s.id}
                        onClick={() => {
                          // Operator delegation only changes whose schedule you're
                          // viewing — it does not change your own privileges.
                          setActiveStaffId(s.id);
                          setIsStaffDropdownOpen(false);
                          setStaffSearchQuery('');
                        }}
                        className={`w-full text-left p-2 rounded-xl flex items-center justify-between gap-2.5 transition-all text-slate-800 border ${
                          isActive 
                            ? 'bg-indigo-50/70 border-indigo-150' 
                            : 'hover:bg-slate-50 border-transparent'
                        }`}
                      >
                        <div className="flex items-start gap-2 max-w-[85%]">
                          <div className={`w-7 h-7 rounded-lg shrink-0 flex items-center justify-center text-[10px] font-black font-mono tracking-wide ${
                            isActive ? 'bg-indigo-950 text-white' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {initials}
                          </div>
                          <div className="flex flex-col leading-tight">
                            <span className="text-xs font-black text-slate-900 truncate flex items-center gap-1">
                              {s.name}
                              {s.isManager && (
                                <span className="text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-200 px-1 rounded font-black uppercase">Admin</span>
                              )}
                            </span>
                            <span className="text-[10px] text-slate-500 font-semibold truncate mt-0.5">{s.role} ({s.employeeNo})</span>
                          </div>
                        </div>
                        {isActive ? (
                          <div className="bg-indigo-100 text-indigo-950 p-1 rounded-full shrink-0">
                            <Check className="w-3.5 h-3.5" />
                          </div>
                        ) : (
                          <span className="text-[11px] font-bold text-slate-400 shrink-0 hover:text-indigo-700">Select</span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
              </>
              )}
            </div>
          )}
        </div>

        {/* Read-only role badge — privileges come from the authenticated account,
            not a toggle. */}
        {(() => {
          const ROLE_LABELS: Record<string, string> = {
            superuser: 'Super User',
            facility_manager: 'Facility Manager',
            dept_head: 'Department Head',
            staff: 'Staff',
          };
          // When signed in, the badge reflects the account's resolved tier. In the
          // no-login demo (sandbox) path there is no tier to resolve, so reflect the
          // active simulator view instead of always showing "Staff".
          const signedIn = !!firebaseUser;
          const label = signedIn
            ? (ROLE_LABELS[accessLevel || 'staff'] || 'Staff')
            : (isManagerView ? 'Manager · Demo' : 'Staff · Demo');
          const elevated = signedIn ? (accessLevel && accessLevel !== 'staff') : isManagerView;
          return (
            <div
              title={signedIn
                ? `You are signed in as ${label}. Access is set by your account, not switchable here.`
                : 'Demo session — sign in for your real access tier.'}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black tracking-wide uppercase shadow-md border ${
                elevated
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white border-emerald-400/40'
                  : 'bg-[#090d16] text-sky-200 border-indigo-500/20'
              }`}
            >
              <ShieldCheck className="w-3 h-3" />
              {label}
            </div>
          );
        })()}
      </div>

      {/* Provisioning Workspace Modal */}
      {showProvisionModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-[fadeIn_0.15s_ease-out]">
          <div className="bg-white text-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-indigo-150 relative">
            
            <button
              type="button"
              onClick={() => setShowProvisionModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-2 hover:bg-slate-50 rounded-xl"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 border-b border-slate-100 pb-4 mb-4">
              <div className="bg-[#005c93]/10 p-2.5 rounded-2xl text-[#005c93]">
                <Server className="w-5.5 h-5.5" />
              </div>
              <div>
                <h3 className="font-sans font-black text-base text-slate-900">Add {taxonomy.workspaceSingular}</h3>
                <p className="text-[10px] text-slate-500 mt-0.5">Set up a new workspace for your team</p>
              </div>
            </div>

            <form onSubmit={handleProvisionSubmit} className="space-y-3.5">
              <div>
                <label className="text-[11px] font-black text-slate-400 font-mono">{taxonomy.workspaceSingular} Name *</label>
                <input
                  type="text"
                  required
                  placeholder={`e.g. Trinco Operations Base`}
                  value={newFacName}
                  onChange={(e) => setNewFacName(e.target.value)}
                  className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl p-2.5 outline-none focus:border-[#009EE2] mt-1"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-black text-slate-400 font-mono">Location Province *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Copperbelt Division"
                    value={newFacLoc}
                    onChange={(e) => setNewFacLoc(e.target.value)}
                    className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl p-2.5 outline-none focus:border-[#009EE2] mt-1"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-black text-slate-400 font-mono">Lead Supervisor *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Davies Tembo"
                    value={newFacManager}
                    onChange={(e) => setNewFacManager(e.target.value)}
                    className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl p-2.5 outline-none focus:border-[#009EE2] mt-1"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-black text-slate-400 font-mono">Type</label>
                <input
                  type="text"
                  placeholder="e.g. Branch"
                  value={newFacType}
                  onChange={(e) => setNewFacType(e.target.value)}
                  className="w-full md:w-1/2 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl p-2.5 outline-none focus:border-[#009EE2] mt-1"
                />
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-50">
                <button
                  type="button"
                  onClick={() => setShowProvisionModal(false)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs rounded-xl transition-colors cursor-pointer text-center"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-indigo-650 hover:bg-indigo-600 text-white font-black text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" /> Initialize
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </header>
  );
}
