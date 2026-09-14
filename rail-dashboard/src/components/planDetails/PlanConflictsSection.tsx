import React from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  ChevronRight,
  HelpCircle,
} from 'lucide-react';
import type { ConstraintViolation } from '../../types';
import { Badge, Button } from '../common';

export interface PlanConflictsSectionProps {
  conflicts: ConstraintViolation[];
  totalConflicts: number;
  isFeasible?: boolean;
  summaryText?: string;
  onInspectBlockByRequestId?: (requestId: string) => void;
  onExplainConflict?: (requestId?: string, constraintType?: string) => void;
}

export const PlanConflictsSection: React.FC<PlanConflictsSectionProps> = ({
  conflicts,
  totalConflicts,
  summaryText,
  onInspectBlockByRequestId,
  onExplainConflict,
}) => {
  const hasNoConflicts = totalConflicts === 0 && conflicts.length === 0;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-[0_2px_12px_rgba(15,23,42,0.08),0_1px_3px_rgba(15,23,42,0.05)] p-6 space-y-5">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[18.5px] font-bold text-slate-900">
              Deterministic Conflict Detection
            </h2>
            {hasNoConflicts ? (
              <span className="inline-flex items-center gap-1 text-[15px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5" />
                0 Conflicts
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[15px] font-semibold px-2.5 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">
                <AlertTriangle className="w-3.5 h-3.5" />
                {totalConflicts} Detected
              </span>
            )}
          </div>
          <p className="text-[15px] text-slate-500 mt-0.5">
            Automated verification by RailwayConstraintEngine checking train safety buffers, track possession, and operating windows.
          </p>
        </div>
      </div>

      {/* POSITIVE STATE: No conflicts */}
      {hasNoConflicts ? (
        <div className="flex flex-col sm:flex-row items-center gap-4 p-5 bg-emerald-50/50 border border-emerald-200 rounded-xl">
          <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 shrink-0">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div className="space-y-1 text-center sm:text-left">
            <h3 className="text-[16.5px] font-bold text-emerald-900">
              No Operational Conflicts Detected
            </h3>
            <p className="text-[15px] text-emerald-700 leading-relaxed">
              {summaryText ||
                'All scheduled maintenance blocks adhere to hard railway constraints: non-overlapping track possessions, train movement safety buffers, corridor operating windows, and departmental clearance limits.'}
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1 text-[12.5px] text-emerald-800 font-medium">
              <span>✓ 0 Train Traffic Clashes</span>
              <span>✓ 0 Corridor Window Overruns</span>
              <span>✓ 0 Asset Track Overlaps</span>
            </div>
          </div>
        </div>
      ) : (
        /* CONFLICTS LIST: Real violations */
        <div className="space-y-3">
          {conflicts.map((v, idx) => (
            <div
              key={idx}
              className="p-4 bg-red-50/60 border border-red-200 rounded-xl space-y-2.5 transition-all hover:bg-red-50"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 text-[15px] font-mono font-bold px-2 py-0.5 rounded bg-red-100 text-red-800">
                    <XCircle className="w-3.5 h-3.5 text-red-600" />
                    {v.constraint_type}
                  </span>
                  <Badge variant="red" statusText={v.severity || 'HARD'} />
                </div>

                <div className="flex items-center gap-2">
                  {v.request_id && onInspectBlockByRequestId && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onInspectBlockByRequestId(v.request_id!)}
                      rightIcon={<ChevronRight className="w-3 h-3" />}
                      className="text-[14px]"
                    >
                      Inspect Block {v.request_id}
                    </Button>
                  )}
                  {onExplainConflict && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onExplainConflict(v.request_id || undefined, v.constraint_type)}
                      leftIcon={<HelpCircle className="w-3.5 h-3.5 text-red-600" />}
                      className="text-[14px] border-red-200 text-red-700 bg-white hover:bg-red-50"
                    >
                      Explain Conflict
                    </Button>
                  )}
                </div>
              </div>

              <p className="text-[15px] font-medium text-slate-800 leading-relaxed">
                {v.reason}
              </p>

              <div className="flex flex-wrap items-center gap-4 text-[12.5px] font-mono text-slate-500 pt-1 border-t border-red-200/60">
                {v.request_id && (
                  <span>
                    Request: <strong className="text-slate-800">{v.request_id}</strong>
                  </span>
                )}
                {v.corridor_id && (
                  <span>
                    Corridor: <strong className="text-slate-800">{v.corridor_id}</strong>
                  </span>
                )}
                {v.asset_id && (
                  <span>
                    Asset: <strong className="text-slate-800">{v.asset_id}</strong>
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
