import React, { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ShieldCheck,
  User,
} from 'lucide-react';
import { Modal, Button } from '../common';

export interface ReviewActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  action: 'approve' | 'reject' | null;
  planId: string;
  planTitle: string;
  onConfirm: (payload: { reviewer?: string; comment?: string }) => Promise<void>;
  isSubmitting: boolean;
}

export const ReviewActionModal: React.FC<ReviewActionModalProps> = ({
  isOpen,
  onClose,
  action,
  planId,
  planTitle,
  onConfirm,
  isSubmitting,
}) => {
  const [reviewer, setReviewer] = useState<string>('Operations Officer');
  const [comment, setComment] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  if (!action) return null;

  const isApprove = action === 'approve';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isApprove && !comment.trim()) {
      setError('A rejection reason is strictly required by the railway planning engine.');
      return;
    }

    try {
      setError(null);
      await onConfirm({
        reviewer: reviewer.trim() || undefined,
        comment: comment.trim() || (isApprove ? 'Plan approved for operational execution' : undefined),
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || `Failed to ${action} plan.`);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          {isApprove ? (
            <>
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <span>Approve Block Plan</span>
            </>
          ) : (
            <>
              <XCircle className="w-5 h-5 text-red-600" />
              <span>Reject Block Plan</span>
            </>
          )}
        </div>
      }
      subtitle={`Plan: ${planId} • ${planTitle}`}
      maxWidth="md"
      footer={
        <div className="flex items-center justify-end gap-2.5 w-full">
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant={isApprove ? 'primary' : 'danger'}
            onClick={handleSubmit}
            isLoading={isSubmitting}
            disabled={!isApprove && !comment.trim()}
          >
            {isApprove ? 'Confirm Approval' : 'Confirm Rejection'}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-[15px] text-slate-700">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Operational Notice */}
        <div
          className={`p-4 rounded-xl border flex items-start gap-3 ${
            isApprove
              ? 'bg-emerald-50/60 border-emerald-200 text-emerald-900'
              : 'bg-amber-50/60 border-amber-200 text-amber-900'
          }`}
        >
          {isApprove ? (
            <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          )}
          <div className="space-y-1">
            <p className="font-bold">
              {isApprove
                ? 'Authorized Final Approval'
                : 'Plan Rejection & Work Order Deferral'}
            </p>
            <p className="text-[12.5px] leading-relaxed opacity-90">
              {isApprove
                ? 'Approving locks this block schedule into the Indian Railways repository. Once approved, maintenance blocks are finalized and become immutable for live dispatch.'
                : 'Rejecting this plan marks all included block requests as unassigned. You must provide an operational rationale for audit logging.'}
            </p>
          </div>
        </div>

        {/* Reviewer Identifier */}
        <div className="space-y-1.5">
          <label className="block font-semibold text-slate-800 text-[15px] flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-slate-400" />
            Reviewer Designation / Name
          </label>
          <input
            type="text"
            value={reviewer}
            onChange={(e) => setReviewer(e.target.value)}
            placeholder="e.g. Chief Operations Controller · Mumbai Division"
            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-[15px] font-medium focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Comment / Rejection Reason */}
        <div className="space-y-1.5">
          <label className="block font-semibold text-slate-800 text-[15px]">
            {isApprove ? 'Review Comments (Optional)' : 'Rejection Reason (Required)'}
          </label>
          <textarea
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={
              isApprove
                ? 'Add optional operational notes or dispatch constraints...'
                : 'Specify operational reason for rejection (e.g. conflicting freight priority, crew unavailability)...'
            }
            required={!isApprove}
            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-[15px] font-medium focus:outline-none focus:border-blue-500"
          />
        </div>
      </form>
    </Modal>
  );
};
