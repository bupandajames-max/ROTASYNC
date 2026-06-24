import React from 'react';
import { Loader2 } from 'lucide-react';

export default function LoadingScreen() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 flex items-center justify-center p-4">
      <div className="flex flex-col items-center gap-3 text-indigo-200">
        <Loader2 className="w-8 h-8 animate-spin" />
        <p className="text-xs font-bold tracking-wide">Loading your workspace…</p>
      </div>
    </div>
  );
}
