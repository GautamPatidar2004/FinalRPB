import React from 'react';
import {
  Layers,
  Clock,
  MapPin,
  AlertTriangle,
  Moon,
  CheckCircle,
} from 'lucide-react';
import type { BlockPlan } from '../../types';
import { formatDuration } from '../../utils';

export interface PlanKpiGridProps {
  plan: BlockPlan;
  hardViolationsCount: number;
}

export const PlanKpiGrid: React.FC<PlanKpiGridProps> = ({ plan, hardViolationsCount }) => {
  const items = plan.items || [];

  // Calculate real derived figures
  const totalAllocatedMinutes = items.reduce(
    (acc, it) => acc + (it.allocated_duration_minutes || 0),
    0
  );

  const affectedCorridors = Array.from(new Set(items.map((it) => it.corridor_id).filter(Boolean)));
  const affectedAssets = Array.from(new Set(items.map((it) => it.asset_id).filter(Boolean)));
  const itemsWithConflicts = items.filter((it) => it.conflict_flags && it.conflict_flags.length > 0);

  const metrics = plan.evaluation_summary?.metrics || {};
  const trainConflicts = metrics.train_conflicts ?? 0;
  const nightShadows = metrics.night_shadow_placements ?? 0;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
      {/* 1. Scheduled Blocks */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-[0_2px_8px_rgba(15,23,42,0.06)]">
        <div className="flex items-center justify-between text-slate-400 mb-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider">Scheduled Blocks</span>
          <Layers className="w-4 h-4 text-blue-600" />
        </div>
        <div className="text-2xl font-bold font-mono text-slate-900 leading-tight">
          {items.length}
        </div>
        <p className="text-[11px] text-slate-400 mt-1">
          {items.filter((it) => it.status === 'SCHEDULED').length} active slots
        </p>
      </div>

      {/* 2. Total Planned Duration */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-[0_2px_8px_rgba(15,23,42,0.06)]">
        <div className="flex items-center justify-between text-slate-400 mb-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider">Total Duration</span>
          <Clock className="w-4 h-4 text-indigo-600" />
        </div>
        <div className="text-2xl font-bold font-mono text-slate-900 leading-tight">
          {formatDuration(totalAllocatedMinutes)}
        </div>
        <p className="text-[11px] text-slate-400 mt-1">
          {totalAllocatedMinutes} minutes allocated
        </p>
      </div>

      {/* 3. Affected Corridors */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-[0_2px_8px_rgba(15,23,42,0.06)]">
        <div className="flex items-center justify-between text-slate-400 mb-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider">Corridors</span>
          <MapPin className="w-4 h-4 text-emerald-600" />
        </div>
        <div className="text-2xl font-bold font-mono text-slate-900 leading-tight">
          {affectedCorridors.length}
        </div>
        <p className="text-[11px] text-slate-400 mt-1 truncate" title={affectedCorridors.join(', ')}>
          {affectedCorridors.join(', ') || 'None'}
        </p>
      </div>

      {/* 4. Affected Assets */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-[0_2px_8px_rgba(15,23,42,0.06)]">
        <div className="flex items-center justify-between text-slate-400 mb-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider">Track Assets</span>
          <Layers className="w-4 h-4 text-cyan-600" />
        </div>
        <div className="text-2xl font-bold font-mono text-slate-900 leading-tight">
          {affectedAssets.length}
        </div>
        <p className="text-[11px] text-slate-400 mt-1">Infrastructure units</p>
      </div>

      {/* 5. Hard Conflicts / Feasibility */}
      <div
        className={`bg-white rounded-2xl border p-4 shadow-[0_2px_8px_rgba(15,23,42,0.06)] ${
          hardViolationsCount > 0 || itemsWithConflicts.length > 0
            ? 'border-red-300 bg-red-50/20'
            : 'border-slate-200'
        }`}
      >
        <div className="flex items-center justify-between text-slate-400 mb-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider">Conflicts</span>
          {hardViolationsCount > 0 ? (
            <AlertTriangle className="w-4 h-4 text-red-600" />
          ) : (
            <CheckCircle className="w-4 h-4 text-emerald-600" />
          )}
        </div>
        <div
          className={`text-2xl font-bold font-mono leading-tight ${
            hardViolationsCount > 0 ? 'text-red-600' : 'text-emerald-600'
          }`}
        >
          {hardViolationsCount}
        </div>
        <p className="text-[11px] text-slate-400 mt-1">
          {trainConflicts > 0 ? `${trainConflicts} train conflicts` : '0 train overlaps'}
        </p>
      </div>

      {/* 6. Night Shadow Placements */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-[0_2px_8px_rgba(15,23,42,0.06)]">
        <div className="flex items-center justify-between text-slate-400 mb-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider">Night Shadow</span>
          <Moon className="w-4 h-4 text-purple-600" />
        </div>
        <div className="text-2xl font-bold font-mono text-slate-900 leading-tight">
          {nightShadows}
        </div>
        <p className="text-[11px] text-slate-400 mt-1">Minimal disruption slots</p>
      </div>
    </div>
  );
};
