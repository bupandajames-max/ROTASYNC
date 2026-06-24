import React, { useState } from 'react';
import { UserCircle2, ChevronRight } from 'lucide-react';

interface ConfirmIdentityProps {
  email: string;
  suggestedName: string;
  onConfirm: (name: string, role: string) => void;
  onSignOut: () => void;
}

export default function ConfirmIdentity({ email, suggestedName, onConfirm, onSignOut }: ConfirmIdentityProps) {
  const [name, setName] = useState(suggestedName);
  const [role, setRole] = useState('Manager');

  const valid = name.trim().length > 1;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white p-6 flex items-center gap-4">
          <div className="bg-[#009EE2] w-12 h-12 rounded-2xl flex items-center justify-center shrink-0">
            <UserCircle2 className="w-6 h-6 text-sky-100" />
          </div>
          <div className="flex-1">
            <h1 className="text-lg font-black tracking-wide">Confirm it's you</h1>
            <p className="text-xs text-indigo-200/80 mt-0.5">Signed in as {email}</p>
          </div>
          <button
            onClick={onSignOut}
            className="text-[10px] font-bold text-indigo-200/80 hover:text-white border border-indigo-300/30 rounded-lg px-2.5 py-1.5 shrink-0"
          >
            Sign out
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="text-[10px] font-black text-slate-400">Your name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full text-xs font-semibold bg-white border border-slate-200 rounded-xl p-2.5 mt-1 outline-none focus:border-indigo-600"
              placeholder="e.g. Davies Tembo"
            />
          </div>
          <div>
            <label className="text-[10px] font-black text-slate-400">Your role</label>
            <input
              value={role}
              onChange={e => setRole(e.target.value)}
              className="w-full text-xs font-semibold bg-white border border-slate-200 rounded-xl p-2.5 mt-1 outline-none focus:border-indigo-600"
              placeholder="e.g. Manager"
            />
          </div>
          <p className="text-[11px] text-slate-400">This becomes your profile in the workspace you're about to set up. You'll set up the workspace itself next.</p>
        </div>

        <div className="flex justify-end items-center px-6 py-4 border-t border-slate-100 bg-slate-50/60">
          <button
            onClick={() => valid && onConfirm(name.trim(), role.trim() || 'Manager')}
            disabled={!valid}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-black text-xs rounded-xl flex items-center gap-1.5"
          >
            Continue <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
