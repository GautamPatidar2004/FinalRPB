import React, { useState } from 'react';
import {
  ShieldCheck,
  XCircle,
  AlertTriangle,
  Play,
  History,
  ChevronDown,
  ChevronUp,
  Lock,
} from 'lucide-react';
import type { BlockPlan } from '../../types';
import { Button, Badge } from '../common';
import { formatTimestamp } from '../../utils';

export interface PlanReviewActionBarProps {
  plan: BlockPlan;
  hardViolationsCount: number;
  onStartReview: () => Promise<void>;
  isStartingReview: boolean;
  onOpenApproveModal: () => void;
  onOpenRejectModal: () => void;
  error?: string | null;
}

export const PlanReviewActionBar: React.FC<PlanReviewActionBarProps> = ({
  plan,
  hardViolationsCount,
  onStartReview,
  isStartingReview,
  onOpenApproveModal,
  onOpenRejectModal,
  error,
}) => {
  const [showHistory, setShowHistory] = useState<boolean>(false);

  const status = plan.status;
  const isDraft = status === 'DRAFT' || status === 'PENDING_APPROVAL';
  const isUnderReview = status === 'UNDER_REVIEW';
  const isApproved = status === 'APPROVED';
  const isRejected = status === 'REJECTED';

  const isFeasible = plan.is_feasible && hardViolationsCount === 0;

  const reviewHistory = plan.evaluation_summary?.review_history || [];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-[0_2px_12px_rgba(15,23,42,0.08),0_1px_3px_rgba(15,23,42,0.05)] p-5 space-y-4">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Review Status Strip */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Review & Lifecycle Status
            </span>
            <Badge statusText={status} dot />
          </div>

          <div className="flex items-center gap-2 text-xs">
            {isDraft && (
              <span className="text-slate-600">
                Plan generated and awaiting formal operational review initiation.
              </span>
            )}
            {isUnderReview && (
              <span className="text-blue-700 font-medium">
                Active human review underway. Inspect scheduled blocks and verify constraints.
              </span>
            )}
            {isApproved && (
              <span className="text-emerald-700 font-medium flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-emerald-600" />
                Plan locked and approved by {plan.approved_by || 'Controller'} at{' '}
                {formatTimestamp(plan.approved_at || plan.updated_at)}.
              </span>
            )}
            {isRejected && (
              <span className="text-red-700 font-medium">
                Plan rejected. Reason: {plan.rejection_reason || 'No reason specified'}.
              </span>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {/* Transition: DRAFT -> UNDER_REVIEW */}
          {isDraft && (
            <Button
              variant="primary"
              size="sm"
              onClick={onStartReview}
              isLoading={isStartingReview}
              leftIcon={<Play className="w-3.5 h-3.5" />}
              className="shadow-sm font-semibold"
            >
              Start Human Review
            </Button>
          )}

          {/* Actions when UNDER_REVIEW */}
          {isUnderReview && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={onOpenRejectModal}
                leftIcon={<XCircle className="w-3.5 h-3.5 text-red-600" />}
                className="text-red-700 hover:bg-red-50 hover:border-red-300"
              >
                Reject Plan
              </Button>

              <Button
                variant="primary"
                size="sm"
                onClick={onOpenApproveModal}
                disabled={!isFeasible}
                leftIcon={<ShieldCheck className="w-3.5 h-3.5" />}
                className="bg-emerald-600 hover:bg-emerald-700 shadow-sm font-semibold"
                title={
                  !isFeasible
                    ? 'Cannot approve an infeasible plan with hard constraint violations.'
                    : 'Authorize and approve block plan'
                }
              >
                Approve Plan
              </Button>
            </>
          )}

          {/* Audit History Toggle Button */}
          {reviewHistory.length > 0 && (
            <button
              type="button"
              onClick={() => setShowHistory(!showHistory)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 flex items-center gap-1.5 transition-colors"
            >
              <History className="w-3.5 h-3.5 text-slate-400" />
              <span>Audit Trail ({reviewHistory.length})</span>
              {showHistory ? (
                <ChevronUp className="w-3 h-3 text-slate-400" />
              ) : (
                <ChevronDown className="w-3 h-3 text-slate-400" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Collapsible Audit History Trail */}
      {showHistory && reviewHistory.length > 0 && (
        <div className="pt-3 border-t border-slate-100 space-y-2 text-xs">
          <span className="font-semibold text-slate-700 block text-[11px] uppercase tracking-wider">
            Review Lifecycle Audit Trail
          </span>
          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50 font-mono">
            {reviewHistory.map((rec: any, idx: number) => (
              <div key={idx} className="p-3 bg-white flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900 uppercase">{rec.action}</span>
                  <span className="text-slate-400">•</span>
                  <span className="text-slate-600 font-sans">
                    By {rec.reviewer || 'Anonymous'}
                  </span>
                  <span className="text-slate-400">•</span>
                  <span className="text-slate-500 font-sans text-[11px]">
                    {rec.previous_status} → {rec.new_status}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-slate-400 text-[11px]">
                  {rec.comment && (
                    <span className="text-slate-700 font-sans italic">
                      "{rec.comment}"
                    </span>
                  )}
                  <span>{formatTimestamp(rec.timestamp)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
