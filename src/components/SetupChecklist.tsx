import React from 'react';
import { Users, Calendar, ListChecks, Rocket, Check, ArrowRight, X } from 'lucide-react';

export interface SetupSteps {
  team: boolean;
  roster: boolean;
  tasks: boolean;
  golive: boolean;
}

interface SetupChecklistProps {
  steps: SetupSteps;
  onAddTeam: () => void;
  onPlanRoster: () => void;
  onSetupTasks: () => void;
  onGoLive: () => void;
  onDismiss?: () => void;
  taxonomy: {
    memberPlural: string;
    taskPlural: string;
    groupSingular: string;
  };
}

export default function SetupChecklist({
  steps,
  onAddTeam,
  onPlanRoster,
  onSetupTasks,
  onGoLive,
  onDismiss,
  taxonomy,
}: SetupChecklistProps) {
  const rows = [
    {
      done: steps.team,
      icon: Users,
      title: 'Add your team',
      desc: `The ${taxonomy.memberPlural.toLowerCase()} in your ${taxonomy.groupSingular.toLowerCase()}.`,
      action: onAddTeam,
      cta: 'Add team',
      // each step unlocks once the previous is done
      ready: true,
    },
    {
      done: steps.roster,
      icon: Calendar,
      title: 'Plan the roster',
      desc: 'Set who works which shift this cycle.',
      action: onPlanRoster,
      cta: 'Plan roster',
      ready: steps.team,
    },
    {
      done: steps.tasks,
      icon: ListChecks,
      title: 'Set up your tasks',
      desc: `What needs doing — ${taxonomy.taskPlural.toLowerCase()} for your ${taxonomy.groupSingular.toLowerCase()} (we can suggest some for you).`,
      action: onSetupTasks,
      cta: 'Set up tasks',
      ready: steps.roster,
    },
    {
      done: steps.golive,
      icon: Rocket,
      title: 'Go live',
      desc: "Create the daily board — tasks auto-assign to whoever's on shift.",
      action: onGoLive,
      cta: 'Go live',
      ready: steps.tasks,
    },
  ];

  const doneCount = rows.filter(r => r.done).length;
  const pct = Math.round((doneCount / rows.length) * 100);
  // The first not-yet-done step is the one we nudge.
  const nextIdx = rows.findIndex(r => !r.done);

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6 relative">
      {onDismiss && (
        <button
          onClick={onDismiss}
          title="Hide for now"
          className="absolute top-4 right-4 text-slate-300 hover:text-slate-500 transition-colors p-1.5 hover:bg-slate-50 rounded-lg cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      )}

      <div className="flex items-start gap-3">
        <div className="bg-indigo-50 text-indigo-700 p-2.5 rounded-2xl shrink-0">
          <Rocket className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-base font-black text-slate-900">Get started</h3>
          <p className="text-xs text-slate-500 mt-0.5">A few quick steps to set up your {taxonomy.groupSingular.toLowerCase()}.</p>
        </div>
      </div>

      {/* Progress */}
      <div className="mt-4 flex items-center gap-3">
        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-indigo-600 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-[11px] font-bold text-slate-500 shrink-0">{doneCount} of {rows.length} done</span>
      </div>

      {/* Steps */}
      <div className="mt-4 flex flex-col gap-2">
        {rows.map((r, idx) => {
          const Icon = r.icon;
          const isNext = idx === nextIdx;
          return (
            <div
              key={r.title}
              className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                r.done
                  ? 'border-emerald-100 bg-emerald-50/40'
                  : isNext
                    ? 'border-indigo-200 bg-indigo-50/40'
                    : 'border-slate-100 bg-white'
              }`}
            >
              <div className={`w-8 h-8 rounded-xl shrink-0 flex items-center justify-center ${
                r.done ? 'bg-emerald-500 text-white' : isNext ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'
              }`}>
                {r.done ? <Check className="w-4 h-4" strokeWidth={3} /> : <Icon className="w-4 h-4" />}
              </div>

              <div className="flex-1 min-w-0">
                <div className={`text-sm font-bold ${r.done ? 'text-slate-500 line-through' : 'text-slate-800'}`}>{r.title}</div>
                <div className="text-[11px] text-slate-400 leading-snug">{r.desc}</div>
              </div>

              {!r.done && (
                <button
                  onClick={r.action}
                  disabled={!r.ready}
                  className={`flex items-center gap-1 text-xs font-bold px-3 py-2 rounded-xl shrink-0 transition-all cursor-pointer ${
                    isNext
                      ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed'
                  }`}
                >
                  {r.cta} <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
