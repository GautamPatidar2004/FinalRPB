import React from 'react';
import {
  Sparkles,
  Award,
  AlertCircle,
  Cpu,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { BlockPlan } from '../../types';
import { Badge, Button } from '../common';

export interface AiPlanningInsightsProps {
  latestPlan: BlockPlan | null;
}

export const AiPlanningInsights: React.FC<AiPlanningInsightsProps> = ({ latestPlan }) => {
  const navigate = useNavigate();

  if (!latestPlan) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-[0_2px_12px_rgba(15,23,42,0.08),0_1px_3px_rgba(15,23,42,0.05)] text-center space-y-3">
        <Sparkles className="w-6 h-6 text-slate-400 mx-auto" />
        <h3 className="text-[16.5px] font-semibold text-slate-800">No AI Insights Available</h3>
        <p className="text-sm text-slate-500 max-w-sm mx-auto">
          Generate a candidate plan in the Planning Workspace to surface deterministic AI optimization recommendations and factor evaluations.
        </p>
        <Button
          size="sm"
          variant="primary"
          onClick={() => navigate('/planning')}
        >
          Open Planning Workspace
        </Button>
      </div>
    );
  }

  const evalSummary = latestPlan.evaluation_summary || {};
  const strengths: string[] = evalSummary.strengths || [];
  const penalties: string[] = evalSummary.penalties || [];
  const factorScores = evalSummary.factor_scores || {};
  const decisionLog: Array<{
    request_id?: string;
    decision_type?: string;
    priority_category?: string;
    rationale?: string;
  }> = evalSummary.decision_log || [];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-[0_2px_12px_rgba(15,23,42,0.08),0_1px_3px_rgba(15,23,42,0.05)] space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-blue-600" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">
              AI Planning Insights & Decision Support
            </h2>
            <Badge
              variant={latestPlan.is_feasible ? 'emerald' : 'red'}
              statusText={latestPlan.is_feasible ? 'FEASIBLE' : 'HARD CONFLICTS'}
            />
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            Real optimization signals derived from plan{' '}
            <span className="font-mono font-bold text-blue-700">{latestPlan.plan_id}</span> ({latestPlan.selected_strategy || 'Default'})
          </p>
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={() => navigate(`/review/${latestPlan.plan_id}`)}
          rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
          className="text-sm"
        >
          Inspect Plan Details
        </Button>
      </div>

      {/* Grid: Optimization Strengths & Hard Constraints */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Strengths / Recommendations */}
        <div className="space-y-2.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
            <Award className="w-3.5 h-3.5 text-emerald-600" />
            Optimization Strengths
          </span>
          {strengths.length > 0 ? (
            <div className="space-y-2">
              {strengths.map((st, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-xl text-sm text-emerald-900 flex items-start gap-2.5 font-medium leading-relaxed"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>{st}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-500">
              Zero optimization penalties noted; all hard constraints met.
            </div>
          )}
        </div>

        {/* Penalties / Operational Restrictions */}
        <div className="space-y-2.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
            Operational Penalties & Trade-offs
          </span>
          {penalties.length > 0 ? (
            <div className="space-y-2">
              {penalties.map((pen, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-amber-50/60 border border-amber-200 rounded-xl text-sm text-amber-900 flex items-start gap-2.5 font-medium leading-relaxed"
                >
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>{pen}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-3 bg-emerald-50/50 border border-emerald-200 rounded-xl text-sm text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>No scheduling trade-off penalties registered for this plan.</span>
            </div>
          )}
        </div>
      </div>

      {/* Factor Scores Strip */}
      {Object.keys(factorScores).length > 0 && (
        <div className="space-y-2 pt-2 border-t border-slate-100">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
            Multi-Objective Evaluation Matrix
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Object.entries(factorScores).slice(0, 4).map(([key, score]) => {
              const label = key
                .replace(/_/g, ' ')
                .replace(/\b\w/g, (c) => c.toUpperCase());
              const num = typeof score === 'number' ? score : 0;
              return (
                <div
                  key={key}
                  className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                >
                  <span className="block text-[10px] text-slate-400 font-medium truncate" title={label}>
                    {label}
                  </span>
                  <span className="text-sm font-bold font-mono text-blue-700">
                    {num.toFixed(1)}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Rationale Sample */}
      {decisionLog.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-slate-100">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-blue-600" />
            AI Decision Rationale Samples
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            {decisionLog.slice(0, 2).map((dec, idx) => (
              <div
                key={idx}
                className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1 font-mono text-[11px]"
              >
                <div className="flex items-center justify-between text-slate-400">
                  <span className="font-bold text-blue-700">{dec.request_id}</span>
                  <span>{dec.decision_type}</span>
                </div>
                <p className="font-sans text-slate-700 text-sm font-medium">
                  {dec.rationale}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
