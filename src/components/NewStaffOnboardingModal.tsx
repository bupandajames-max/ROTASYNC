import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { StaffMember, Department } from '../types';
import {
  X,
  ShieldCheck,
  Clock,
  User,
  Phone,
  Mail,
  Building2,
  ChevronRight,
  ChevronLeft,
  Check,
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
  const totalSteps = 2;

  const member = taxonomy.memberSingular;
  const group = taxonomy.groupSingular;

  // Step 1: profile
  const [name, setName] = useState('');
  const [fullName, setFullName] = useState('');
  const [gender, setGender] = useState<'M' | 'F' | ''>('M');
  const [role, setRole] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [employeeNo, setEmployeeNo] = useState('');
  const [isManager, setIsManager] = useState(false);

  // Step 2: placement
  const [departmentId, setDepartmentId] = useState('');
  const [contractedHours, setContractedHours] = useState<number>(40);

  const resetForm = () => {
    setName('');
    setFullName('');
    setGender('M');
    setRole('');
    setEmail('');
    setPhone('');
    setEmployeeNo('');
    setIsManager(false);
    setDepartmentId('');
    setContractedHours(40);
    setActiveStep(1);
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setName(val);
    if (!fullName) setFullName(val);
    const prefix = val.trim().toLowerCase().replace(/\s+/g, '.');
    setEmail(prefix ? `${prefix}@example.com` : '');
  };

  const generateRandomEmployeeNo = () => {
    setEmployeeNo(`EMP-${Math.floor(100000 + Math.random() * 900000)}`);
  };

  const handleNext = () => {
    if (activeStep === 1) {
      if (!name.trim()) { toast.error('Please enter a name.'); return; }
      if (!fullName.trim()) { toast.error('Please enter a full name.'); return; }
      if (!gender) { toast.error('Please select a gender.'); return; }
      if (!employeeNo.trim()) generateRandomEmployeeNo();
    }
    setActiveStep(prev => Math.min(prev + 1, totalSteps));
  };

  const handleBack = () => setActiveStep(prev => Math.max(prev - 1, 1));

  // Reset on close as well as on submit — otherwise closing the wizard
  // part-way through and reopening it shows the previous half-filled state.
  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !fullName.trim() || !gender) {
      toast.error('Missing required fields. Please check the previous step.');
      return;
    }

    const finalStaff: StaffMember = {
      id: `staff-${Date.now()}`,
      name: name.trim(),
      fullName: fullName.trim(),
      email: email.trim() || `${name.toLowerCase().replace(/\s+/g, '')}@example.com`,
      phone: phone.trim(),
      role,
      contractedHours: Number(contractedHours),
      gender,
      employeeNo: employeeNo.trim() || `EMP-${Math.floor(100000 + Math.random() * 900000)}`,
      // A manager here means facility-level access. Set BOTH accessLevel and
      // the legacy isManager flag (kept in sync), matching how the quick-add
      // and edit forms write staff records — so the record is self-consistent
      // instead of relying on every reader to fall back to isManager. Finer
      // tiers (e.g. Department Head) are set afterward from the People list.
      accessLevel: isManager ? 'facility_manager' : 'staff',
      isManager,
      facilityId: selectedFacilityId,
      // Department is optional in the data model — an empty value means "not
      // assigned to a specific department yet", which is valid.
      departmentId: departmentId || undefined,
    };

    onAddStaff(finalStaff);
    resetForm();
    onClose();
  };

  if (!isOpen) return null;

  const currentAssignedDept = departments.find(d => d.id === departmentId);
  const inputCls = 'w-full text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl p-3 focus:bg-white focus:ring-1 focus:ring-[#009EE2] focus:border-[#009EE2] outline-none';

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-4xl w-full shadow-2xl border border-slate-200 relative overflow-hidden flex flex-col md:flex-row h-auto md:max-h-[85vh]">

        {/* Left panel: live preview card (matches the app's deep-navy brand) */}
        <div className="md:w-5/12 bg-gradient-to-br from-slate-900 via-indigo-950 to-indigo-900 p-6 text-white flex flex-col justify-between relative border-b md:border-b-0 md:border-r border-white/10 shrink-0">
          <div className="space-y-2">
            <h3 className="text-xl font-black tracking-tight text-white leading-tight">
              Add a {member.toLowerCase()}
            </h3>
            <p className="text-xs text-indigo-200/80 leading-relaxed">
              A quick, guided way to add someone to your team and set their working hours.
            </p>
          </div>

          {/* Live preview card */}
          <div className="my-8 relative">
            <div className="bg-white/5 p-5 rounded-2xl border border-white/10 space-y-4 relative backdrop-blur-sm">
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <span className="text-[9px] font-black uppercase bg-[#009EE2] text-white px-2 py-0.5 rounded-full inline-block">
                    {role || 'Role'}
                  </span>
                  <div className="text-base font-extrabold tracking-tight leading-none mt-2 text-white">
                    {name || 'Name'}
                  </div>
                  <div className="text-[10px] text-indigo-200/70 italic font-medium">
                    {fullName || 'Full name'}
                  </div>
                </div>
                <div className="w-12 h-12 bg-indigo-950/80 rounded-xl border border-white/15 flex items-center justify-center font-black text-indigo-100 text-lg">
                  {name ? name.slice(0, 2).toUpperCase() : <User className="w-6 h-6 stroke-[1.5]" />}
                </div>
              </div>

              <div className="pt-3 border-t border-white/10 flex justify-between items-center text-[11px]">
                <div className="space-y-0.5">
                  <span className="text-[9px] text-indigo-300/60 uppercase block font-bold">{group}</span>
                  <span className="font-semibold text-indigo-50">{currentAssignedDept?.name || 'Not assigned'}</span>
                </div>
                <div className="text-right space-y-0.5">
                  <span className="text-[9px] text-indigo-300/60 uppercase block font-bold">Access</span>
                  <span className="font-semibold text-indigo-50">{isManager ? 'Manager' : 'Staff'}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[10px] text-indigo-200/70 pt-2 font-mono">
                <div>
                  <span className="block font-bold opacity-65 uppercase text-[8px]">Employee No.</span>
                  <span className="font-semibold text-white">{employeeNo || 'Not set'}</span>
                </div>
                <div className="text-right">
                  <span className="block font-bold opacity-65 uppercase text-[8px]">Weekly hours</span>
                  <span className="font-semibold text-white">{contractedHours} hrs</span>
                </div>
              </div>
            </div>
          </div>

          <div className="text-[10px] text-indigo-200/60 font-sans border-t border-white/10 pt-4 flex gap-2">
            <ShieldCheck className="w-4.5 h-4.5 shrink-0 text-[#009EE2]" />
            <span>Sets up their employee number and starting timesheet automatically.</span>
          </div>
        </div>

        {/* Right panel: form steps */}
        <div className="md:w-7/12 p-6 md:p-8 flex flex-col justify-between overflow-y-auto">
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors p-2 hover:bg-slate-50 rounded-xl cursor-pointer z-10"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Stepper */}
          <div className="flex items-center gap-2 mb-6">
            <span className="text-xs font-black text-indigo-700">Step {activeStep} of {totalSteps}</span>
            <div className="flex gap-1 flex-1">
              {Array.from({ length: totalSteps }, (_, i) => i + 1).map(stepNum => (
                <div
                  key={stepNum}
                  className={`h-1.5 rounded-full transition-all ${
                    stepNum <= activeStep ? 'bg-[#009EE2] flex-1' : 'bg-slate-100 w-4'
                  }`}
                />
              ))}
            </div>
          </div>

          <div className="flex-1 min-h-[300px]">
            <AnimatePresence mode="wait">

              {/* STEP 1: profile */}
              {activeStep === 1 && (
                <motion.div
                  key="step1"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-4 text-left"
                >
                  <div>
                    <h4 className="text-base font-black text-slate-900 tracking-tight">Their details</h4>
                    <p className="text-xs text-slate-500">Name, role, and how to reach them.</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2 md:col-span-1">
                      <label className="text-[10px] font-black text-slate-500 block">First name <span className="text-red-500">*</span></label>
                      <input type="text" required value={name} onChange={handleNameChange} placeholder="e.g. Jane" className={`${inputCls} mt-1.5`} />
                      <span className="text-[9px] text-slate-400 mt-1 block">Shown in the roster grid.</span>
                    </div>
                    <div className="col-span-2 md:col-span-1">
                      <label className="text-[10px] font-black text-slate-500 block">Full name <span className="text-red-500">*</span></label>
                      <input type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Jane Doe" className={`${inputCls} mt-1.5`} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-black text-slate-500 block">Gender <span className="text-red-500">*</span></label>
                      <div className="grid grid-cols-2 gap-2 mt-1.5">
                        {(['M', 'F'] as const).map(g => (
                          <button
                            key={g}
                            type="button"
                            onClick={() => setGender(g)}
                            className={`py-2 text-xs font-extrabold rounded-xl border text-center cursor-pointer transition-all ${
                              gender === g
                                ? 'border-[#009EE2] bg-[#009EE2]/5 text-[#005c93]'
                                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            {g === 'M' ? 'Male' : 'Female'}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-slate-500 block">Employee No.</label>
                      <div className="flex gap-1.5 mt-1.5">
                        <input type="text" value={employeeNo} onChange={(e) => setEmployeeNo(e.target.value)} placeholder="e.g. EMP-9231" className="w-full text-xs font-mono font-bold bg-slate-50 border border-slate-200 rounded-xl p-2 focus:bg-white focus:ring-1 focus:ring-[#009EE2] focus:border-[#009EE2] outline-none" />
                        <button type="button" onClick={generateRandomEmployeeNo} className="px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-[10px] rounded-xl tracking-wider uppercase border border-slate-200 shrink-0 cursor-pointer">
                          Auto
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-black text-slate-500 block">Job title / role</label>
                      <input type="text" placeholder="e.g. Pharmacist" value={role} onChange={(e) => setRole(e.target.value)} className={`${inputCls} mt-1.5`} />
                    </div>
                    <div className="flex items-center pt-5">
                      <label className="relative flex items-center gap-3 cursor-pointer select-none">
                        <input type="checkbox" checked={isManager} onChange={(e) => setIsManager(e.target.checked)} className="sr-only peer" />
                        <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#009EE2]"></div>
                        <div>
                          <span className="text-[11px] font-black text-slate-800 block">Give manager access</span>
                          <span className="text-[10px] text-slate-400 block font-medium leading-none">Can manage staff, rosters & settings</span>
                        </div>
                      </label>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-1">
                    <div>
                      <label className="text-[10px] font-black text-slate-500 block">Email</label>
                      <div className="relative mt-1.5">
                        <Mail className="absolute left-3 top-3.5 text-slate-400 w-4 h-4" />
                        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="e.g. jane@example.com" className={`${inputCls} pl-9`} />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-slate-500 block">Phone</label>
                      <div className="relative mt-1.5">
                        <Phone className="absolute left-3 top-3.5 text-slate-400 w-4 h-4" />
                        <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+260 970 000000" className={`${inputCls} pl-9`} />
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* STEP 2: department + hours */}
              {activeStep === 2 && (
                <motion.div
                  key="step2"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-5 text-left"
                >
                  <div>
                    <h4 className="text-base font-black text-slate-900 tracking-tight">{group} & hours</h4>
                    <p className="text-xs text-slate-500">Where they work and how many hours a week.</p>
                  </div>

                  <div className="space-y-4">
                    <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 flex items-center gap-3">
                      <Building2 className="text-[#009EE2] w-5 h-5 shrink-0" />
                      <div>
                        <div className="text-xs font-black text-slate-800">Added to your current {taxonomy.workspaceSingular.toLowerCase()}</div>
                        <div className="text-[11px] text-slate-500 font-semibold mt-0.5">You can move them later from the People list.</div>
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-black text-slate-500 block">{group} <span className="text-slate-300 font-semibold normal-case">(optional)</span></label>
                      <select
                        value={departmentId}
                        onChange={(e) => setDepartmentId(e.target.value)}
                        className="w-full text-xs font-extrabold bg-slate-50 border border-slate-200 rounded-xl p-3 focus:bg-white focus:ring-1 focus:ring-[#009EE2] focus:border-[#009EE2] outline-none mt-1.5"
                      >
                        <option value="">No specific {group.toLowerCase()}</option>
                        {departments.map(dept => (
                          <option key={dept.id} value={dept.id}>{dept.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-black text-slate-500 block">Weekly hours</label>
                        <span className="text-xs font-black text-[#005c93] bg-[#009EE2]/10 px-2.5 py-0.5 rounded-full">{contractedHours} hrs / week</span>
                      </div>
                      <div className="mt-3 flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                        <Clock className="text-slate-400 w-5 h-5 shrink-0" />
                        <div className="flex-1 space-y-1">
                          <input type="range" min="20" max="60" step="4" value={contractedHours} onChange={(e) => setContractedHours(Number(e.target.value))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#009EE2]" />
                          <div className="flex justify-between text-[9px] font-extrabold text-slate-400 font-mono mt-1">
                            <span>20h</span>
                            <span>40h</span>
                            <span>48h</span>
                            <span>60h</span>
                          </div>
                        </div>
                      </div>
                      <span className="text-[10px] text-slate-400 mt-1.5 block font-medium">Used to flag over- or under-scheduling against their hours.</span>
                    </div>
                  </div>
                </motion.div>
              )}

            </AnimatePresence>
          </div>

          {/* Controls */}
          <div className="flex justify-between items-center border-t border-slate-100 pt-5 mt-6 shrink-0 font-sans">
            <div>
              {activeStep > 1 && (
                <button type="button" onClick={handleBack} className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs rounded-xl flex items-center gap-1 cursor-pointer transition-colors">
                  <ChevronLeft className="w-4 h-4" /> Back
                </button>
              )}
            </div>
            <div className="flex gap-2">
              {activeStep < totalSteps ? (
                <button type="button" onClick={handleNext} className="py-2.5 px-5 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs rounded-xl flex items-center gap-1 cursor-pointer transition-all shadow-sm">
                  Continue <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button type="button" onClick={handleSubmit} className="py-2.5 px-5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl flex items-center gap-1.5 shadow-md cursor-pointer transition-all">
                  <Check className="w-4 h-4" /> Add {member.toLowerCase()}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
