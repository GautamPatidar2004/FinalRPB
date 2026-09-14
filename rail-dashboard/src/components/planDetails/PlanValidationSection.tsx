import React, { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  Cpu,
  BarChart3,
  Award,
  Shield,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { BlockPlan } from '../../types';

export interface PlanValidationSectionProps {
  plan: BlockPlan;
  hardViolationsCount: number;
  conflicts?: Array<{ constraint_type?: string; reason?: string; [key: string]: any }>;
}

export const PlanValidationSection: React.FC<PlanValidationSectionProps> = ({
  plan,
  hardViolationsCount,
  conflicts = [],
}) => {
  const [showDecisions, setShowDecisions] = useState<boolean>(true);

  const evalSummary = plan.evaluation_summary || {};
  const factorScores = evalSummary.factor_scores || {};
  const strengths: string[] = evalSummary.strengths || [];
  const penalties: string[] = evalSummary.penalties || [];
  const decisionLog: Array<{
    decision_type?: string;
    request_id?: string;
    priority_category?: string;
    rationale?: string;
  }> = evalSummary.decision_log || [];

  const isClean = plan.is_feasible && hardViolationsCount === 0;

  // Extract all active violation types from feasibility summary, conflicts prop, and item flags
  const feasibilityViolations: Array<{ constraint_type?: string; reason?: string }> =
    evalSummary.feasibility?.violations || [];
  const allViolations = [...conflicts, ...feasibilityViolations];

  const violationTypeMap = new Map<string, string[]>();
  allViolations.forEach((v) => {
    if (v.constraint_type) {
      const cType = v.constraint_type.toUpperCase();
      const existing = violationTypeMap.get(cType) || [];
      if (v.reason && !existing.includes(v.reason)) {
        existing.push(v.reason);
      }
      violationTypeMap.set(cType, existing);
    }
  });

  (plan.items || []).forEach((it) => {
    (it.conflict_flags || []).forEach((flag: string) => {
      const cType = flag.toUpperCase();
      if (!violationTypeMap.has(cType)) {
        violationTypeMap.set(cType, []);
      }
    });
  });

  // Standard Railway Hard Constraints Rules verified by the engine
  const standardConstraintRules = [
    {
      id: 'ASSET_VALIDITY',
      type: 'INVALID_ASSET_REFERENCE',
      name: 'Asset Reference & Chainage Validity',
      desc: 'All assets exist in infrastructure database with valid start and end kilometers.',
      passed: !violationTypeMap.has('INVALID_ASSET_REFERENCE'),
      reasons: violationTypeMap.get('INVALID_ASSET_REFERENCE') || [],
    },
    {
      id: 'CORRIDOR_WINDOW',
      type: 'CORRIDOR_WINDOW_VIOLATION',
      name: 'Corridor Operating Window Boundaries',
      desc: 'Maintenance blocks strictly fall within corridor operational availability times.',
      passed: !violationTypeMap.has('CORRIDOR_WINDOW_VIOLATION'),
      reasons: violationTypeMap.get('CORRIDOR_WINDOW_VIOLATION') || [],
    },
    {
      id: 'REQUEST_WINDOW',
      type: 'REQUEST_WINDOW_VIOLATION',
      name: 'Request Window Compliance',
      desc: 'Scheduled timings respect earliest start and latest end limits defined in request.',
      passed: !violationTypeMap.has('REQUEST_WINDOW_VIOLATION'),
      reasons: violationTypeMap.get('REQUEST_WINDOW_VIOLATION') || [],
    },
    {
      id: 'MIN_DURATION',
      type: 'INSUFFICIENT_DURATION',
      name: 'Required Duration Allocation',
      desc: 'Full required maintenance work time is provided without unauthorized truncation.',
      passed: !violationTypeMap.has('INSUFFICIENT_DURATION'),
      reasons: violationTypeMap.get('INSUFFICIENT_DURATION') || [],
    },
    {
      id: 'PARALLEL_CAPACITY',
      type: 'CORRIDOR_CAPACITY_EXCEEDED',
      name: 'Corridor Parallel Capacity Limits',
      desc: 'Maximum concurrent track possessions do not exceed corridor track safety capacity.',
      passed: !violationTypeMap.has('CORRIDOR_CAPACITY_EXCEEDED'),
      reasons: violationTypeMap.get('CORRIDOR_CAPACITY_EXCEEDED') || [],
    },
    {
      id: 'ASSET_CONFLICT',
      type: 'ASSET_CONFLICT',
      name: 'Single Asset Simultaneous Possession',
      desc: 'No conflicting departments schedule overlapping work on identical physical assets.',
      passed: !violationTypeMap.has('ASSET_CONFLICT'),
      reasons: violationTypeMap.get('ASSET_CONFLICT') || [],
    },
    {
      id: 'TRAIN_TRAFFIC',
      type: 'TRAIN_TRAFFIC_CONFLICT',
      name: 'Train Traffic & Express Clearance',
      desc: 'Mandatory headways and safety clear intervals preserved for passenger/freight runs.',
      passed: !violationTypeMap.has('TRAIN_TRAFFIC_CONFLICT') && (violationTypeMap.size === 0 ? isClean : true),
      reasons: violationTypeMap.get('TRAIN_TRAFFIC_CONFLICT') || [],
    },
  ];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-[0_2px_12px_rgba(15,23,42,0.08),0_1px_3px_rgba(15,23,42,0.05)] p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div>
          <h2 className="text-[18.5px] font-bold text-slate-900">
            Railway Safety Rules & AI Optimization Validation
          </h2>
          <p className="text-[15px] text-slate-500 mt-0.5">
            Deterministic rule evaluation matrix and multi-objective scoring breakdown.
          </p>
        </div>
      </div>

      {/* Grid: Rules matrix & Factor scores */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Hard Constraints Checklist */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-blue-600" />
            <h3 className="text-[15px] font-bold uppercase tracking-wider text-slate-700">
              Railway Hard Constraint Verification
            </h3>
          </div>

          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50">
            {standardConstraintRules.map((rule) => (
              <div key={rule.id} className="p-3 flex items-start gap-3 bg-white">
                {rule.passed ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[15px] font-semibold text-slate-800">
                      {rule.name}
                    </span>
                    <span
                      className={`text-[11.5px] font-bold px-1.5 py-0.2 rounded uppercase ${
                        rule.passed
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-red-50 text-red-700'
                      }`}
                    >
                      {rule.passed ? 'PASSED' : 'VIOLATION'}
                    </span>
                  </div>
                  <p className="text-[12.5px] text-slate-400 mt-0.5">{rule.desc}</p>
                  {!rule.passed && rule.reasons.length > 0 && (
                    <div className="mt-1.5 p-1.5 bg-red-50 rounded border border-red-200 text-[11.5px] text-red-700 font-mono">
                      {rule.reasons.join('; ')}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Optimization Factor Scores & Strengths */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-indigo-600" />
            <h3 className="text-[15px] font-bold uppercase tracking-wider text-slate-700">
              Multi-Objective Factor Scores
            </h3>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {Object.keys(factorScores).length > 0 ? (
              Object.entries(factorScores).map(([key, score]) => {
                const cleanName = key
                  .replace(/_/g, ' ')
                  .replace(/\b\w/g, (c) => c.toUpperCase());
                const numVal = typeof score === 'number' ? score : 0;
                return (
                  <div
                    key={key}
                    className="p-3 bg-slate-50 rounded-xl border border-slate-200"
                  >
                    <span className="block text-[12.5px] font-medium text-slate-500 truncate" title={cleanName}>
                      {cleanName}
                    </span>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className="text-lg font-bold font-mono text-slate-900">
                        {numVal.toFixed(1)}
                      </span>
                      <span className="text-[11.5px] font-medium text-slate-400">/ 100</span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="col-span-2 p-4 text-center text-[15px] text-slate-400 bg-slate-50 rounded-xl border border-slate-200">
                Detailed factor breakdown available upon initial AI generation.
              </div>
            )}
          </div>

          {/* Strengths & Penalties */}
          {(strengths.length > 0 || penalties.length > 0) && (
            <div className="space-y-2 pt-2">
              {strengths.map((s, idx) => (
                <div
                  key={`str-${idx}`}
                  className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-[15px] text-emerald-800 flex items-start gap-2"
                >
                  <Award className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span>{s}</span>
                </div>
              ))}
              {penalties.map((p, idx) => (
                <div
                  key={`pen-${idx}`}
                  className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-[15px] text-amber-800 flex items-start gap-2"
                >
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                  <span>{p}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Decision Log / AI Engine Rationale */}
      {decisionLog.length > 0 && (
        <div className="pt-3 border-t border-slate-100 space-y-3">
          <button
            type="button"
            onClick={() => setShowDecisions(!showDecisions)}
            className="flex items-center justify-between w-full text-left"
          >
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-blue-600" />
              <h3 className="text-[15px] font-bold uppercase tracking-wider text-slate-700">
                Engine Decision Log ({decisionLog.length} assignments)
              </h3>
            </div>
            {showDecisions ? (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            )}
          </button>

          {showDecisions && (
            <div className="space-y-2 pt-1">
              {decisionLog.map((dec, dIdx) => (
                <div
                  key={dIdx}
                  className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[15px] space-y-1"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 font-mono">
                      <span className="font-bold text-blue-700">{dec.request_id}</span>
                      <span className="text-[11.5px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">
                        {dec.priority_category || 'NORMAL'}
                      </span>
                    </div>
                    <span className="text-[12.5px] font-mono text-slate-400 uppercase">
                      {dec.decision_type}
                    </span>
                  </div>
                  <p className="text-slate-600 font-medium leading-relaxed">
                    {dec.rationale}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
