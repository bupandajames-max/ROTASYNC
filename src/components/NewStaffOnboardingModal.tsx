import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { StaffMember, Department } from '../types';
import { 
  X, 
  UserPlus, 
  Briefcase, 
  ShieldCheck, 
  Clock, 
  MapPin, 
  Sparkles, 
  User, 
  Calendar, 
  Activity, 
  Phone, 
  Mail, 
  Building2,
  Trash2,
  BadgeAlert,
  ChevronRight,
  ChevronLeft,
  Settings
} from 'lucide-react';
import { useToast } from './ui/ToastProvider';

interface NewStaffOnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddStaff: (newStaff: StaffMember) => void;
  departments: Department[];
  selectedFacilityId: string;
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

export default function NewStaffOnboardingModal({
  isOpen,
  onClose,
  onAddStaff,
  departments,
  selectedFacilityId,
  taxonomy,
}: NewStaffOnboardingModalProps) {
  const toast = useToast();
  const [activeStep, setActiveStep] = useState<number>(1);
  const totalSteps = 3;

  // Form State - Step 1: Core Profile
  const [name, setName] = useState('');
  const [fullName, setFullName] = useState('');
  const [gender, setGender] = useState<'M' | 'F' | ''>('M');
  const [role, setRole] = useState('Pharmacist');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [employeeNo, setEmployeeNo] = useState('');
  const [isManager, setIsManager] = useState(false);

  // Form State - Step 2: Department Placement
  const [departmentId, setDepartmentId] = useState(departments[0]?.id || '');
  const [contractedHours, setContractedHours] = useState<number>(40);

  // Form State - Step 3: Roster Track & Availability
  // Tracks can be: 'Rotating 24/7', 'Days Only Specialist', 'Night Specialist', 'Flexible Support'
  const [rosterTrack, setRosterTrack] = useState<string>('Rotating 24/7');
  const [rosterNotes, setRosterNotes] = useState<string>('');

  // Auto-generate employee number and email during keystrokes
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setName(val);
    if (!fullName) {
      setFullName(val);
    }
    // Auto email
    const prefix = val.trim().toLowerCase().replace(/\s+/g, '.');
    setEmail(prefix ? `${prefix}@beggclinic.com` : '');
  };

  // Re-generate clinical values if empty on setup
  const generateRandomEmployeeNo = () => {
    const num = Math.floor(100000 + Math.random() * 900000);
    setEmployeeNo(`MBCH-${num}`);
  };

  const handleNext = () => {
    if (activeStep === 1) {
      if (!name.trim()) {
        toast.error('Please enter a short display name.');
        return;
      }
      if (!fullName.trim()) {
        toast.error('Please enter a full professional name.');
        return;
      }
      if (!gender) {
        toast.error('Please select a gender.');
        return;
      }
      if (!employeeNo.trim()) {
        generateRandomEmployeeNo();
      }
    }
    if (activeStep === 2) {
      if (!departmentId) {
        toast.error('Please assign an initial department.');
        return;
      }
      if (contractedHours < 10 || contractedHours > 60) {
        toast.error('Contracted hours must be between 10 and 60 hours.');
        return;
      }
    }
    setActiveStep(prev => Math.min(prev + 1, totalSteps));
  };

  const handleBack = () => {
    setActiveStep(prev => Math.max(prev - 1, 1));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !fullName.trim() || !gender || !departmentId) {
      toast.error('Missing required fields. Please check the previous steps.');
      return;
    }

    const finalStaff: StaffMember = {
      id: `staff-${Date.now()}`,
      name: name.trim(),
      fullName: fullName.trim(),
      email: email.trim() || `${name.toLowerCase()}@beggclinic.com`,
      phone: phone.trim() || '+260 970 000 000',
      role,
      contractedHours: Number(contractedHours),
      gender,
      employeeNo: employeeNo.trim() || `MBCH-${Math.floor(100000 + Math.random() * 900000)}`,
      isManager,
      facilityId: selectedFacilityId,
      departmentId,
      rosterTrack,
      rosterNotes: rosterNotes.trim()
    };

    onAddStaff(finalStaff);
    
    // Reset state & close
    setName('');
    setFullName('');
    setGender('M');
    setRole('Pharmacist');
    setEmail('');
    setPhone('');
    setEmployeeNo('');
    setIsManager(false);
    setDepartmentId(departments[0]?.id || '');
    setContractedHours(40);
    setRosterTrack('Rotating 24/7');
    setRosterNotes('');
    setActiveStep(1);
    
    onClose();
  };

  // Setup preview shift rosters based on track choice
  const getMockSchedulePreview = () => {
    switch (rosterTrack) {
      case 'Rotating 24/7':
        return [
          { day: 'Mon', shift: 'A', desc: 'Morning Shift', hours: '9h', bg: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
          { day: 'Tue', shift: 'B', desc: 'Mid-Day Shift', hours: '9h', bg: 'bg-teal-50 text-teal-800 border-teal-200' },
          { day: 'Wed', shift: 'C', desc: 'Afternoon Shift', hours: '8h', bg: 'bg-amber-50 text-amber-800 border-amber-200' },
          { day: 'Thu', shift: 'N', desc: 'Night Shift', hours: '12h', bg: 'bg-slate-900 text-slate-100 border-slate-700' },
          { day: 'Fri', shift: 'OFF', desc: 'Rest Day', hours: '0h', bg: 'bg-slate-100 text-slate-400 border-slate-200' },
        ];
      case 'Days Only Specialist':
        return [
          { day: 'Mon', shift: 'A', desc: 'Morning Shift', hours: '9h', bg: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
          { day: 'Tue', shift: 'A+', desc: 'Morning Ext', hours: '12h', bg: 'bg-cyan-50 text-cyan-800 border-cyan-200' },
          { day: 'Wed', shift: 'B', desc: 'Mid-Day Shift', hours: '9h', bg: 'bg-teal-50 text-teal-800 border-teal-200' },
          { day: 'Thu', shift: 'C', desc: 'Afternoon Shift', hours: '8h', bg: 'bg-amber-50 text-amber-800 border-amber-200' },
          { day: 'Fri', shift: 'OFF', desc: 'Rest Day', hours: '0h', bg: 'bg-slate-100 text-slate-400 border-slate-200' },
        ];
      case 'Night Specialist':
        return [
          { day: 'Mon', shift: 'OFF', desc: 'Rest Day', hours: '0h', bg: 'bg-slate-100 text-slate-400 border-slate-200' },
          { day: 'Tue', shift: 'N', desc: 'Night Shift', hours: '12h', bg: 'bg-slate-900 text-slate-100 border-slate-700' },
          { day: 'Wed', shift: 'N', desc: 'Night Shift', hours: '12h', bg: 'bg-slate-900 text-slate-100 border-slate-700' },
          { day: 'Thu', shift: 'OFF', desc: 'Post-Night Rest', hours: '0h', bg: 'bg-slate-100 text-slate-400 border-slate-200' },
          { day: 'Fri', shift: 'OFF', desc: 'Post-Night Rest', hours: '0h', bg: 'bg-slate-100 text-slate-400 border-slate-200' },
        ];
      case 'Flexible Support':
      default:
        return [
          { day: 'Mon', shift: 'B', desc: 'Mid-Day Shift', hours: '9h', bg: 'bg-teal-50 text-teal-800 border-teal-200' },
          { day: 'Tue', shift: 'OFF', desc: 'On-Call Rest', hours: '0h', bg: 'bg-slate-100 text-slate-400 border-slate-200' },
          { day: 'Wed', shift: 'C', desc: 'Afternoon Shift', hours: '8h', bg: 'bg-amber-50 text-amber-800 border-amber-200' },
          { day: 'Thu', shift: 'OFF', desc: 'Rest Day', hours: '0h', bg: 'bg-slate-100 text-slate-400 border-slate-200' },
          { day: 'Fri', shift: 'B', desc: 'Mid-Day Shift', hours: '9h', bg: 'bg-teal-50 text-teal-800 border-teal-200' },
        ];
    }
  };

  if (!isOpen) return null;

  const currentAssignedDept = departments.find(d => d.id === departmentId);

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-4xl w-full shadow-2xl border border-gray-150 relative overflow-hidden flex flex-col md:flex-row h-auto md:max-h-[85vh]">
        
        {/* Left Aspect: Dynamic Live badge preview */}
        <div className="md:w-5/12 bg-gradient-to-br from-[#4C0B1E] to-[#7A1230] p-6 text-white flex flex-col justify-between relative border-b md:border-b-0 md:border-r border-[#E29E25]/10 shrink-0">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="p-1 px-2.5 bg-white/10 rounded-full font-mono text-[9px] font-black tracking-widest text-[#E29E25] uppercase">
                SYSTEM PORTAL
              </span>
            </div>
            <div>
              <h3 className="text-xl font-light tracking-tight text-white leading-tight">
                New {taxonomy.memberSingular} <span className="font-extrabold text-amber-400">Onboarding</span>
              </h3>
              <p className="text-xs text-rose-100/70 mt-1 leading-relaxed">
                Step-by-step assistant for registering {taxonomy.memberSingular.toLowerCase()} talent, scheduling placement, and assigning duty tracks.
              </p>
            </div>
          </div>

          {/* Dynamic Badging Preview Card */}
          <div className="my-8 relative">
            <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-amber-400 to-[#E29E25] opacity-20 blur-sm"></div>
            <div className="bg-[#5c0e24] p-5 rounded-2xl border border-rose-900/40 space-y-4 relative">
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <span className="text-[9px] font-black uppercase bg-[#E29E25] text-amber-950 px-2 py-0.5 rounded-full inline-block">
                    {role || 'Role Open'}
                  </span>
                  <div className="text-base font-extrabold tracking-tight leading-none mt-2 text-white">
                    {name || 'Candidate Name'}
                  </div>
                  <div className="text-[10px] text-rose-200/80 italic font-medium">
                    {fullName || 'No registered full name'}
                  </div>
                </div>
                {/* Simulated Photo Avatar representation */}
                <div className="w-12 h-12 bg-rose-950/80 rounded-xl border border-rose-300/20 flex items-center justify-center font-black text-rose-200 text-lg">
                  {name ? name.slice(0, 2).toUpperCase() : <User className="w-6 h-6 stroke-[1.5]" />}
                </div>
              </div>

              {/* Roster Track badge */}
              <div className="pt-3 border-t border-rose-900/50 flex justify-between items-center text-[11px]">
                <div className="space-y-0.5">
                  <span className="text-[9px] text-rose-300/60 uppercase block font-bold">Roster Preference Track</span>
                  <span className="font-bold text-amber-300">{rosterTrack}</span>
                </div>
                <div className="text-right space-y-0.5">
                  <span className="text-[9px] text-rose-300/60 uppercase block font-bold">Dept. Assignment</span>
                  <span className="font-semibold text-rose-100">{currentAssignedDept?.name || 'Unassigned'}</span>
                </div>
              </div>

              {/* Identification details */}
              <div className="grid grid-cols-2 gap-2 text-[10px] text-rose-200/70 pt-2 font-mono">
                <div>
                  <span className="block font-bold opacity-65 uppercase text-[8px]">ID NO</span>
                  <span className="font-semibold text-white">{employeeNo || 'GEN-PENDING'}</span>
                </div>
                <div className="text-right">
                  <span className="block font-bold opacity-65 uppercase text-[8px]">Weekly Target</span>
                  <span className="font-semibold text-white">{contractedHours} Hours</span>
                </div>
              </div>
            </div>
          </div>

          {/* Guidelines info */}
          <div className="text-[10px] text-rose-200/50 font-sans border-t border-rose-950 pt-4 flex gap-2">
            <ShieldCheck className="w-4.5 h-4.5 shrink-0 text-amber-400" />
            <span>
              Onboarding automatically registers the employee ID under Zambia Labor guidelines, configuring baseline timesheet compliance rules.
            </span>
          </div>
        </div>

        {/* Right Aspect: Form fields stepper wizard */}
        <div className="md:w-7/12 p-6 md:p-8 flex flex-col justify-between overflow-y-auto">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors p-2 hover:bg-slate-50 rounded-xl cursor-pointer z-10"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Stepper Navigation Tracker */}
          <div className="flex items-center gap-2 mb-6">
            <span className="text-xs font-black text-[#7A1230]">STEP {activeStep} OF {totalSteps}</span>
            <div className="flex gap-1 flex-1">
              {[1, 2, 3].map(stepNum => (
                <div 
                  key={stepNum} 
                  className={`h-1.5 rounded-full transition-all ${
                    stepNum <= activeStep ? 'bg-[#7A1230] flex-1' : 'bg-slate-100 w-4'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Dynamic forms step views */}
          <div className="flex-1 min-h-[300px]">
            <AnimatePresence mode="wait">
              
              {/* STEP 1: Medical Staff Profile Information */}
              {activeStep === 1 && (
                <motion.div
                  key="step1"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-4 text-left"
                >
                  <div>
                    <h4 className="text-base font-black text-slate-900 tracking-tight">{taxonomy.memberSingular} Profile Details</h4>
                    <p className="text-xs text-slate-500">Record basic profile identifiers and functional system designations.</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2 md:col-span-1">
                      <label className="text-[10px] font-black text-slate-500 block">Short Name / Call Sign <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        required
                        value={name}
                        onChange={handleNameChange}
                        placeholder="e.g. Getrude"
                        className="w-full text-xs font-bold bg-slate-50 border border-slate-150 rounded-xl p-3 focus:bg-white focus:ring-1 focus:ring-[#7A1230] outline-none mt-1.5"
                      />
                      <span className="text-[9px] text-slate-400 mt-1 block">Used for roster grid layout.</span>
                    </div>

                    <div className="col-span-2 md:col-span-1">
                      <label className="text-[10px] font-black text-slate-500 block">Full Professional Name <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="e.g. Getrude Mwansa"
                        className="w-full text-xs font-bold bg-slate-50 border border-slate-150 rounded-xl p-3 focus:bg-white focus:ring-1 focus:ring-[#7A1230] outline-none mt-1.5"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-black text-slate-500 block">Gender <span className="text-red-500">*</span></label>
                      <div className="grid grid-cols-2 gap-2 mt-1.5">
                        <button
                          type="button"
                          onClick={() => setGender('M')}
                          className={`py-2 text-xs font-extrabold rounded-xl border text-center cursor-pointer transition-all ${
                            gender === 'M' 
                              ? 'border-[#7A1230] bg-[#7A1230]/5 text-[#7A1230]' 
                              : 'border-slate-150 bg-white text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          Male (M)
                        </button>
                        <button
                          type="button"
                          onClick={() => setGender('F')}
                          className={`py-2 text-xs font-extrabold rounded-xl border text-center cursor-pointer transition-all ${
                            gender === 'F' 
                              ? 'border-[#7A1230] bg-[#7A1230]/5 text-[#7A1230]' 
                              : 'border-slate-150 bg-white text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          Female (F)
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-black text-slate-500 block">Employee ID No.</label>
                      <div className="flex gap-1.5 mt-1.5">
                        <input
                          type="text"
                          value={employeeNo}
                          onChange={(e) => setEmployeeNo(e.target.value)}
                          placeholder="e.g. MBCH-923812"
                          className="w-full text-xs font-mono font-bold bg-slate-50 border border-slate-150 rounded-xl p-2 focus:bg-white focus:ring-1 focus:ring-[#7A1230] outline-none"
                        />
                        <button
                          type="button"
                          onClick={generateRandomEmployeeNo}
                          className="px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-[10px] rounded-xl tracking-wider uppercase border border-slate-200 shrink-0 cursor-pointer"
                        >
                          Gen
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-black text-slate-500 block">Title / Primary Role</label>
                      <select
                        value={role}
                        onChange={(e) => setRole(e.target.value)}
                        className="w-full text-xs font-extrabold select bg-slate-50 border border-slate-150 rounded-xl p-3 focus:bg-white focus:ring-1 focus:ring-[#7A1230] outline-none mt-1.5"
                      >
                        <option value="Pharmacist">Pharmacist</option>
                        <option value="Lead Pharmacist">Lead Pharmacist</option>
                        <option value="Clinical Officer">Clinical Officer</option>
                        <option value="Laboratory Technician">Laboratory Technician</option>
                        <option value="Registered Nurse">Registered Nurse</option>
                        <option value="Assistant Operator">Assistant Operator</option>
                        <option value="Site Supervisor">Site Supervisor</option>
                      </select>
                    </div>

                    <div className="flex items-center pt-5">
                      <label className="relative flex items-center gap-3 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={isManager}
                          onChange={(e) => setIsManager(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#7A1230]"></div>
                        <div>
                          <span className="text-[11px] font-black text-slate-800 block">Manager Account</span>
                          <span className="text-[10px] text-slate-400 block font-medium leading-none">Permit site configuration access</span>
                        </div>
                      </label>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-1">
                    <div>
                      <label className="text-[10px] font-black text-slate-500 block">Corporate Email</label>
                      <div className="relative mt-1.5">
                        <Mail className="absolute left-3 top-3.5 text-slate-400 w-4 h-4" />
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="doctor@beggclinic.com"
                          className="w-full text-xs font-bold bg-slate-50 border border-slate-150 rounded-xl p-3 pl-9 focus:bg-white focus:ring-1 focus:ring-[#7A1230] outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-black text-slate-500 block">Phone Contact</label>
                      <div className="relative mt-1.5">
                        <Phone className="absolute left-3 top-3.5 text-slate-400 w-4 h-4" />
                        <input
                          type="text"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="+260 970 000000"
                          className="w-full text-xs font-bold bg-slate-50 border border-slate-150 rounded-xl p-3 pl-9 focus:bg-white focus:ring-1 focus:ring-[#7A1230] outline-none"
                        />
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* STEP 2: Department Assignment and Contract Parameters */}
              {activeStep === 2 && (
                <motion.div
                  key="step2"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-5 text-left animate-[fadeIn_0.15s_ease-out]"
                >
                  <div>
                    <h4 className="text-base font-black text-slate-900 tracking-tight">System & Department Placement</h4>
                    <p className="text-xs text-slate-500">Determine initial workspace assignment and labor contract targets.</p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] font-black text-slate-500 block mb-1.5">Assigned Facility Workspace</label>
                      <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-150 flex items-center gap-3">
                        <Building2 className="text-[#7A1230] w-5 h-5" />
                        <div>
                          <div className="text-xs font-black text-slate-800 uppercase tracking-wide">
                            Active Facility Profile
                          </div>
                          <div className="text-[11px] text-slate-500 font-semibold mt-0.5">
                            Auto-mapped to Workspace ID: <span className="font-mono">{selectedFacilityId}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-black text-slate-500 block">Initial Department Assignment <span className="text-red-500">*</span></label>
                      <select
                        value={departmentId}
                        onChange={(e) => setDepartmentId(e.target.value)}
                        className="w-full text-xs font-extrabold select bg-slate-50 border border-slate-150 rounded-xl p-3 focus:bg-white focus:ring-1 focus:ring-[#7A1230] outline-none mt-1.5"
                      >
                        <option value="" disabled>-- Select Active Department --</option>
                        {departments.map(dept => (
                          <option key={dept.id} value={dept.id}>
                            {dept.name} ({dept.description})
                          </option>
                        ))}
                      </select>
                      {departments.length === 0 && (
                        <div className="text-[10px] text-rose-600 font-bold bg-rose-50 p-2 rounded-xl mt-1.5 flex items-center gap-1.5">
                          <BadgeAlert className="w-4 h-4" /> Warning: No departments defined for this facility workspace. Create one first inside Administrative Setup.
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-black text-slate-500 block">Contracted Weekly Target Hours</label>
                        <span className="text-xs font-black text-[#7A1230] bg-[#7A1230]/5 px-2.5 py-0.5 rounded-full">{contractedHours} Hours / Week</span>
                      </div>
                      
                      <div className="mt-3 flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-150">
                        <Clock className="text-slate-400 w-5 h-5 shrink-0" />
                        <div className="flex-1 space-y-1">
                          <input
                            type="range"
                            min="20"
                            max="60"
                            step="4"
                            value={contractedHours}
                            onChange={(e) => setContractedHours(Number(e.target.value))}
                            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#7A1230]"
                          />
                          <div className="flex justify-between text-[9px] font-extrabold text-slate-400 font-mono mt-1">
                            <span>20h (Part-time)</span>
                            <span>40h (Standard Labor)</span>
                            <span>48h (Zambia Standard)</span>
                            <span>60h (Overtime/Peak)</span>
                          </div>
                        </div>
                      </div>
                      <span className="text-[10px] text-slate-400 mt-1.5 block font-medium">Used to flag over- or under-scheduling against their hours.</span>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* STEP 3: Roster Track Configuration */}
              {activeStep === 3 && (
                <motion.div
                  key="step3"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-4 text-left animate-[fadeIn_0.15s_ease-out]"
                >
                  <div>
                    <h4 className="text-base font-black text-slate-900 tracking-tight">Default Shift Pattern</h4>
                    <p className="text-xs text-slate-500">Sets the shifts the scheduler gives this person by default.</p>
                  </div>

                  {/* Radio tracks selection card */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {[
                      {
                        title: 'Rotating 24/7 Schedule',
                        desc: 'Rotates among mornings, afternoons, mid-days, and nights. Matches standard 24-hr operations models.',
                        val: 'Rotating 24/7'
                      },
                      {
                        title: 'Days Only Specialist',
                        desc: 'Fitted exclusively on Morning/Mid/Afternoon coverage slots. Strictly no night rosters.',
                        val: 'Days Only Specialist'
                      },
                      {
                        title: 'Night Specialist',
                        desc: 'Predominantly scheduled on Night Shifts (N) with dedicated recoup rest cycles.',
                        val: 'Night Specialist'
                      },
                      {
                        title: 'Flexible Support Track',
                        desc: 'On-demand custom scheduling. Good for trainees, part-timers, and consulting officers.',
                        val: 'Flexible Support'
                      }
                    ].map(trackOpt => (
                      <div
                        key={trackOpt.val}
                        onClick={() => setRosterTrack(trackOpt.val)}
                        className={`p-3 rounded-2xl border transition-all cursor-pointer select-none text-left flex flex-col justify-between ${
                          rosterTrack === trackOpt.val 
                            ? 'border-[#7A1230] bg-[#7A1230]/5 text-[#7A1230]' 
                            : 'border-slate-150 bg-white text-slate-600 hover:border-slate-350'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <span className={`text-[11px] font-black tracking-tight ${
                            rosterTrack === trackOpt.val ? 'text-[#7A1230]' : 'text-slate-800'
                          }`}>
                            {trackOpt.title}
                          </span>
                          <div className={`w-4.5 h-4.5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                            rosterTrack === trackOpt.val ? 'border-[#7A1230]' : 'border-slate-300'
                          }`}>
                            {rosterTrack === trackOpt.val && (
                              <div className="w-2.5 h-2.5 rounded-full bg-[#7A1230]" />
                            )}
                          </div>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1 leading-normal font-semibold">
                          {trackOpt.desc}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Scheduled preview card */}
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-150 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] uppercase font-black tracking-widest text-[#7A1230] flex items-center gap-1">
                        <Activity className="w-3.5 h-3.5 text-[#E29E25]" /> Shift pattern preview:
                      </span>
                    </div>
                    <div className="grid grid-cols-5 gap-1.5 pt-1">
                      {getMockSchedulePreview().map((sm, idx) => (
                        <div key={idx} className={`p-2 rounded-xl border text-center ${sm.bg}`}>
                          <div className="text-[9px] uppercase font-mono font-bold block leading-none">{sm.day}</div>
                          <div className="text-xs font-black tracking-tight mt-1 leading-none block">{sm.shift}</div>
                          <div className="text-[8px] opacity-75 mt-1 font-semibold leading-none">{sm.hours}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Special roster notes */}
                  <div>
                    <label className="text-[10px] font-black text-slate-500 block">Special scheduling preferences / notes</label>
                    <textarea
                      value={rosterNotes}
                      onChange={(e) => setRosterNotes(e.target.value)}
                      placeholder="e.g. Prefers Sunday off-shifts for family commitments, or is currently on study leave release..."
                      rows={2}
                      className="w-full text-xs font-semibold bg-slate-50 border border-slate-150 rounded-xl p-3 focus:bg-white focus:ring-1 focus:ring-[#7A1230] outline-none mt-1.5 resize-none"
                    />
                  </div>
                </motion.div>
              )}

            </AnimatePresence>
          </div>

          {/* Stepper Wizard Controls */}
          <div className="flex justify-between items-center border-t border-slate-100 pt-5 mt-6 shrink-0 font-sans">
            <div>
              {activeStep > 1 && (
                <button
                  type="button"
                  onClick={handleBack}
                  className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs rounded-xl flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" /> Back
                </button>
              )}
            </div>

            <div className="flex gap-2">
              {activeStep < totalSteps ? (
                <button
                  type="button"
                  onClick={handleNext}
                  className="py-2.5 px-5 bg-[#7A1230] hover:bg-[#4C0B1E] text-white font-black text-xs rounded-xl flex items-center gap-1 cursor-pointer transition-all shadow-sm"
                >
                  Continue <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  className="py-2.5 px-5 bg-gradient-to-r from-[#4C0B1E] via-[#7A1230] to-[#E29E25] hover:opacity-95 text-white font-sans font-black text-xs rounded-xl flex items-center gap-1.5 shadow-md cursor-pointer transition-all"
                >
                  <Sparkles className="w-4 h-4 text-amber-200 animate-spin" /> Complete Onboarding
                </button>
              )}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
