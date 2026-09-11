import React from 'react';
import {
  Radio,
  Layers,
  Clock,
  MapPin,
  Activity,
} from 'lucide-react';
import type { DashboardSummary, DashboardPlanningKpis } from '../../types';
import type { SystemHealth } from '../../services';
import { Badge } from '../common';
import { formatDuration } from '../../utils';

export interface LiveTelemetryGaugesProps {
  health: SystemHealth | null;
  summary: DashboardSummary | null;
  kpis: DashboardPlanningKpis | null;
}

export const LiveTelemetryGauges: React.FC<LiveTelemetryGaugesProps> = ({
  health,
  summary,
  kpis,
}) => {
  const isHealthy = health?.status === 'healthy';
  const corridorUtil = kpis?.corridor_utilization_pct ?? 0;
  const assetUtil = kpis?.asset_utilization_pct ?? 0;

  return (
    <div className="space-y-4">
      {/* 1. Engine & Telemetry Header Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-[0_2px_12px_rgba(15,23,42,0.08),0_1px_3px_rgba(15,23,42,0.05)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Radio
              className={`w-4 h-4 ${
                isHealthy ? 'text-emerald-500 animate-pulse' : 'text-amber-500'
              }`}
            />
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">
              Planning Engine & Health Telemetry
            </h2>
          </div>
          <div className="flex items-center gap-2 font-mono text-xs text-slate-500">
            <span>Engine: {health?.service || 'RPB-Planning-Service'}</span>
            <span className="text-slate-300">•</span>
            <span>Ver: {health?.version || 'v1.0.0'}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="block text-[11px] font-semibold uppercase text-slate-400">
              Probe Status
            </span>
            <div className="flex items-center gap-1.5 mt-1">
              <span
                className={`w-2 h-2 rounded-full ${
                  isHealthy ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              />
              <span className="text-sm font-bold font-mono text-slate-900 capitalize">
                {health?.status || 'Connecting'}
              </span>
            </div>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="block text-[11px] font-semibold uppercase text-slate-400">
              AI Priority Model
            </span>
            <div className="mt-1">
              <Badge
                variant={health?.model_loaded ? 'emerald' : 'amber'}
                statusText={health?.model_loaded ? 'ONLINE / LOADED' : 'DEGRADED'}
              />
            </div>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="block text-[11px] font-semibold uppercase text-slate-400">
              Environment
            </span>
            <div className="text-sm font-bold font-mono text-slate-900 mt-1 capitalize">
              {health?.environment || 'Production'}
            </div>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="block text-[11px] font-semibold uppercase text-slate-400">
              Feasible Plans Ratio
            </span>
            <div className="text-sm font-bold font-mono text-blue-600 mt-1">
              {kpis?.feasible_plan_percentage != null
                ? `${kpis.feasible_plan_percentage}%`
                : summary
                ? `${summary.feasible_plans} / ${summary.total_plans}`
                : '—'}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Operational Workload & Utilization Gauges */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Corridor Utilization */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-[0_2px_8px_rgba(15,23,42,0.06)] space-y-3">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider">
              Corridor Utilization
            </span>
            <MapPin className="w-4 h-4 text-blue-600" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold font-mono text-slate-900">
              {corridorUtil.toFixed(1)}%
            </span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, corridorUtil)}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-400">
            {summary?.active_corridors ?? 0} of {summary?.total_corridors ?? 0} corridors active
          </p>
        </div>

        {/* Asset Utilization */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-[0_2px_8px_rgba(15,23,42,0.06)] space-y-3">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider">
              Asset Track Allocation
            </span>
            <Layers className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold font-mono text-slate-900">
              {assetUtil.toFixed(1)}%
            </span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
            <div
              className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, assetUtil)}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-400">
            {summary?.assets_unavailable ?? 0} of {summary?.total_assets ?? 0} assets occupied
          </p>
        </div>

        {/* Workload Queue */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-[0_2px_8px_rgba(15,23,42,0.06)] space-y-3">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider">
              Workload Queue
            </span>
            <Activity className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900">
            {summary?.pending_requests ?? 0}
          </div>
          <div className="flex items-center justify-between text-[11px] pt-1 text-slate-500 border-t border-slate-100 font-mono">
            <span>{summary?.scheduled_requests ?? 0} Scheduled</span>
            <span>{summary?.completed_requests ?? 0} Done</span>
          </div>
        </div>

        {/* Total Planned Duration */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-[0_2px_8px_rgba(15,23,42,0.06)] space-y-3">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-semibold uppercase tracking-wider">
              Total Scheduled Duration
            </span>
            <Clock className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900">
            {formatDuration(kpis?.total_scheduled_duration_minutes || 0)}
          </div>
          <p className="text-[11px] text-slate-400">
            {kpis?.total_scheduled_duration_minutes ?? 0} total track minutes
          </p>
        </div>
      </div>
    </div>
  );
};
