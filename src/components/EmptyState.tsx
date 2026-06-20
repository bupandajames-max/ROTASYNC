import React from 'react';
import { Calendar } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ComponentType<{ className?: string }>;
}

export default function EmptyState({ title, message, actionLabel, onAction, icon: Icon = Calendar }: EmptyStateProps) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-10 flex flex-col items-center text-center gap-3">
      <div className="bg-indigo-50 text-indigo-600 p-3 rounded-2xl">
        <Icon className="w-6 h-6" />
      </div>
      <h3 className="text-base font-black text-slate-900">{title}</h3>
      <p className="text-sm text-slate-500 max-w-sm leading-relaxed">{message}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl cursor-pointer transition-colors"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
