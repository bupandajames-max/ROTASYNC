import React from 'react';
import { Home, Calendar, ClipboardCheck, Database, Sliders, BarChart3, Clock, Settings } from 'lucide-react';

interface NavigationProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  isManagerView: boolean;
  accessLevel?: string;
  taxonomy: {
    taskSingular: string;
    taskPlural: string;
    [key: string]: string;
  };
  timezoneLabel?: string;
}

export default function Navigation({ currentTab, setCurrentTab, isManagerView, accessLevel, taxonomy, timezoneLabel }: NavigationProps) {
  // Anyone above 'staff' (or the bootstrap manager view) gets the management tabs.
  const canManage = (accessLevel && accessLevel !== 'staff') || isManagerView;

  // Grouped into hubs (Connecteam-style) instead of one flat list, so the
  // sidebar reads as a few clear destinations rather than 8 equal-weight tabs.
  const groups: { label: string; tabs: { id: string; label: string; icon: typeof Home }[] }[] = [
    {
      label: 'Today',
      tabs: [
        { id: 'home', label: 'Dashboard', icon: Home },
      ],
    },
    {
      label: 'Roster',
      tabs: [
        { id: 'roster', label: 'Roster & Schedule', icon: Calendar },
        { id: 'tasks', label: `${taxonomy.taskSingular} Board`, icon: ClipboardCheck },
      ],
    },
    {
      label: 'Pay & Time',
      tabs: [
        { id: 'timesheets', label: 'My Timesheet', icon: Clock },
        ...(canManage ? [{ id: 'analytics', label: 'Reports & Pay', icon: BarChart3 }] : []),
      ],
    },
    ...(canManage ? [{
      label: 'Setup',
      tabs: [
        { id: 'register', label: 'Manage Tasks', icon: Database },
        { id: 'manager', label: 'Approvals', icon: Sliders },
        { id: 'admin', label: 'Settings', icon: Settings },
      ],
    }] : []),
  ];

  return (
    <nav className="bg-white border-r border-gray-200 w-full md:w-64 md:min-h-[calc(100vh-68px)] p-4 shrink-0 flex md:flex-col justify-between gap-1 overflow-x-auto md:overflow-x-visible shadow-sm">
      <div className="flex md:flex-col gap-4 w-full">
        {groups.map((group) => (
          <div key={group.label} className="flex md:flex-col gap-1 w-full">
            <span className="hidden md:block px-4 text-[10px] font-black uppercase tracking-wider text-slate-400">
              {group.label}
            </span>
            {group.tabs.map((tab) => {
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
        ))}
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
          <span className="font-semibold text-slate-700">{timezoneLabel || 'Not set'}</span>
        </div>
      </div>
    </nav>
  );
}
