import React from 'react';
import { Home, Calendar, ClipboardCheck, Database, Sliders, BarChart3, Clock, Settings } from 'lucide-react';

interface NavigationProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  isManagerView: boolean;
  taxonomy: {
    taskSingular: string;
    taskPlural: string;
    [key: string]: string;
  };
}

export default function Navigation({ currentTab, setCurrentTab, isManagerView, taxonomy }: NavigationProps) {
  const tabs = [
    { id: 'home', label: 'Dashboard', icon: Home },
    { id: 'roster', label: 'Roster & Schedule', icon: Calendar },
    { id: 'timesheets', label: 'My Timesheet Log', icon: Clock },
    { id: 'tasks', label: `${taxonomy.taskSingular} Board`, icon: ClipboardCheck },
    { id: 'register', label: 'Task Register', icon: Database },
    ...(isManagerView ? [
      { id: 'manager', label: 'Approvals Desk', icon: Sliders },
      { id: 'admin', label: 'Enterprise Setup', icon: Settings }
    ] : []),
    { id: 'analytics', label: 'Payroll & Analytics', icon: BarChart3 }
  ];

  return (
    <nav className="bg-white border-r border-gray-200 w-full md:w-64 md:min-h-[calc(100vh-68px)] p-4 shrink-0 flex md:flex-col justify-between gap-1 overflow-x-auto md:overflow-x-visible shadow-sm">
      <div className="flex md:flex-col gap-1 w-full">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setCurrentTab(tab.id)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all whitespace-nowrap w-full cursor-pointer ${
                isActive
                  ? 'bg-sky-50 text-[#005c93] shadow-sm border border-[#009EE2]/25'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-[#009EE2]' : 'text-gray-400'}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      <div className="hidden md:flex flex-col gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100 text-[10px] text-slate-500 mt-auto font-mono">
        <div className="flex justify-between items-center">
          <span>Status:</span>
          <span className="flex items-center gap-1 font-semibold text-emerald-600">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            CONNECTED
          </span>
        </div>
        <div className="flex justify-between">
          <span>TZ Location:</span>
          <span className="font-semibold text-slate-700">Zambia (CAT)</span>
        </div>
      </div>
    </nav>
  );
}
