import React, { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  GitCommit,
} from 'lucide-react';
import type { RequestDecisionTrace, DecisionTraceStage } from '../../types';

export interface DecisionTraceStagesProps {
  trace?: RequestDecisionTrace | null;
  className?: string;
}

export const DecisionTraceStages: React.FC<DecisionTraceStagesProps> = ({
  trace,
  className = '',
}) => {
  const [expandedStageIndex, setExpandedStageIndex] = useState<number | null>(null);

  if (!trace || !trace.stages || trace.stages.length === 0) {
    return (
      <div className={`p-4 bg-slate-50 border border-slate-200 rounded-xl text-slate-500 text-[13px] italic ${className}`}>
        No decision trace records available.
      </div>
    );
  }

  const toggleStage = (idx: number) => {
    setExpandedStageIndex((prev) => (prev === idx ? null : idx));
  };

  const getStageStatusBadge = (status: string) => {
    const s = status.toUpperCase();
    if (s.includes('PASS') || s.includes('FEASIBLE') || s.includes('SELECTED') || s.includes('SCHEDULED')) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
          {status}
        </span>
      );
    }
    if (s.includes('FAIL') || s.includes('INFEASIBLE') || s.includes('REJECTED') || s.includes('CONFLICT')) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded bg-red-100 text-red-800 border border-red-200">
          <XCircle className="w-3 h-3 text-red-600" />
          {status}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
        <AlertTriangle className="w-3 h-3 text-amber-600" />
        {status}
      </span>
    );
  };

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Compact breadcrumb stage bar */}
      <div className="flex items-center gap-1 flex-wrap p-2.5 bg-slate-100/70 border border-slate-200 rounded-xl text-[12px]">
        {trace.stages.map((stage, idx) => {
          const isSelected = expandedStageIndex === idx;
          return (
            <React.Fragment key={stage.stage_name + idx}>
              <button
                type="button"
                onClick={() => toggleStage(idx)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg transition-all ${
                  isSelected
                    ? 'bg-blue-700 text-white font-bold shadow-xs'
                    : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-200 font-medium'
                }`}
              >
                <GitCommit className="w-3 h-3" />
                <span>{stage.stage_name.replace(/_/g, ' ')}</span>
              </button>
              {idx < trace.stages.length - 1 && (
                <span className="text-slate-400 font-bold px-0.5">→</span>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Accordion detail view */}
      <div className="space-y-2">
        {trace.stages.map((stage: DecisionTraceStage, idx: number) => {
          const isExpanded = expandedStageIndex === idx;

          return (
            <div
              key={stage.stage_name + idx}
              className={`border rounded-xl transition-colors overflow-hidden ${
                isExpanded ? 'border-blue-300 bg-blue-50/20' : 'border-slate-200 bg-white'
              }`}
            >
              <button
                type="button"
                onClick={() => toggleStage(idx)}
                className="w-full flex items-center justify-between p-3 text-left hover:bg-slate-50 transition-colors"
                aria-expanded={isExpanded}
              >
                <div className="flex items-center gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-slate-100 border border-slate-300 flex items-center justify-center text-[11px] font-bold font-mono text-slate-600">
                    {idx + 1}
                  </span>
                  <span className="font-semibold text-[13.5px] text-slate-800">
                    {stage.stage_name.replace(/_/g, ' ')}
                  </span>
                  {getStageStatusBadge(stage.status)}
                </div>

                <div className="text-slate-400">
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-blue-600" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </div>
              </button>

              {isExpanded && (
                <div className="p-3.5 pt-0 border-t border-slate-200/60 text-[12.5px] space-y-2 bg-slate-50/50">
                  {Object.keys(stage.details || {}).length === 0 ? (
                    <p className="text-slate-400 italic">No additional stage payload recorded.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                      {Object.entries(stage.details).map(([k, v]) => (
                        <div
                          key={k}
                          className="p-2 rounded bg-white border border-slate-200 space-y-0.5"
                        >
                          <span className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-400 font-mono">
                            {k.replace(/_/g, ' ')}
                          </span>
                          <span className="font-mono text-slate-800 font-semibold break-words">
                            {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
