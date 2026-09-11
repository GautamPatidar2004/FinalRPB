import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  XCircle,
  CalendarCheck,
  CheckCircle2,
  Cpu,
} from 'lucide-react';
import type { BlockPlan } from '../../types';
import { Button, Badge } from '../common';
import { formatTimestamp } from '../../utils';

export interface PlanSummaryHeaderProps {
  plan: BlockPlan;
  isValidating?: boolean;
  onRevalidate: () => void;
  onRefresh: () => void;
  hardViolationsCount?: number;
  fromPlanning?: boolean;
}

export const PlanSummaryHeader: React.FC<PlanSummaryHeaderProps> = ({
  plan,
  isValidating = false,
  onRevalidate,
  onRefresh,
  hardViolationsCount = 0,
}) => {
  const navigate = useNavigate();

  const isFeasible = plan.is_feasible && hardViolationsCount === 0;
  const hasWarnings =
    plan.is_feasible &&
    (hardViolationsCount > 0 ||
      (plan.evaluation_summary?.penalties && plan.evaluation_summary.penalties.length > 0));

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-[0_2px_12px_rgba(15,23,42,0.08),0_1px_3px_rgba(15,23,42,0.05)] p-6 space-y-5">
      {/* Navigation Breadcrumb / Back Bar */}
      <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/planning')}
            leftIcon={<ArrowLeft className="w-3.5 h-3.5" />}
          >
            Planning Workspace
          </Button>
          <span className="text-slate-300">/</span>
          <button
            type="button"
            onClick={() => navigate('/review')}
            className="text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors"
          >
            All Plans
          </button>
          <span className="text-slate-300">/</span>
          <span className="text-xs font-mono font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
            {plan.plan_id}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
            title="Reload latest plan state"
          >
            Refresh
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={onRevalidate}
            isLoading={isValidating}
            leftIcon={<ShieldCheck className="w-3.5 h-3.5" />}
            className="shadow-sm"
          >
            {isValidating ? 'Validating Constraints…' : 'Re-Validate Constraints'}
          </Button>
        </div>
      </div>

      {/* Main Title & Feasibility Row */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div className="space-y-1.5 min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-md bg-slate-900 text-white tracking-wider">
              {plan.plan_id}
            </span>
            <Badge statusText={plan.status} dot />
            {isFeasible && !hasWarnings ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                FEASIBLE
              </span>
            ) : hasWarnings ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                FEASIBLE WITH WARNINGS
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
                <XCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                INFEASIBLE ({hardViolationsCount} VIOLATIONS)
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
              <Cpu className="w-3 h-3 text-slate-400" />
              {plan.selected_strategy || 'MULTI_CRITERIA'}
            </span>
          </div>

          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 truncate">
            {plan.title}
          </h1>

          <p className="text-xs text-slate-500 flex items-center gap-2">
            <span>Created on {formatTimestamp(plan.created_at)}</span>
            {plan.created_by && (
              <>
                <span className="text-slate-300">•</span>
                <span>By {plan.created_by}</span>
              </>
            )}
            {plan.evaluation_summary?.replanning_applied && (
              <>
                <span className="text-slate-300">•</span>
                <span className="font-medium text-blue-600">Replanning Applied</span>
              </>
            )}
          </p>
        </div>

        {/* Overall Score Banner */}
        <div className="flex items-center gap-4 bg-slate-50 border border-slate-200 rounded-xl px-5 py-3 shrink-0">
          <div>
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              AI Optimization Score
            </span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span
                className="text-2xl sm:text-3xl font-bold font-mono tracking-tight text-blue-600 leading-none"
              >
                {plan.overall_score != null ? Number(plan.overall_score).toFixed(1) : '—'}
              </span>
              <span className="text-xs font-semibold text-slate-400">%</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-700 shrink-0">
            <CalendarCheck className="w-5 h-5" />
          </div>
        </div>
      </div>
    </div>
  );
};
