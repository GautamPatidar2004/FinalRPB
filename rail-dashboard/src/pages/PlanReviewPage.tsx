import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  RefreshCw,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { planningService, operationalService } from '../services';
import type {
  BlockPlan,
  BlockPlanItem,
  ConstraintViolation,
  PlanValidationResponse,
  PlanConflictResponse,
  ItemStatus,
  Train,
} from '../types';
import {
  Button,
  Card,
  Badge,
  LoadingState,
  ErrorState,
  EmptyState,
} from '../components/common';
import {
  PlanSummaryHeader,
  PlanKpiGrid,
  PlanTimeline,
  PlanBlockTable,
  PlanConflictsSection,
  PlanValidationSection,
  BlockDetailModal,
  PlanReviewActionBar,
  ReviewActionModal,
  ModifyBlockModal,
} from '../components/planDetails';
import { formatTimestamp } from '../utils';

export const PlanReviewPage: React.FC = () => {
  const { planId: routePlanId } = useParams<{ planId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  // State passed from Prompt 4 generation (if navigating directly)
  const navState = location.state as
    | { plan?: BlockPlan; corridor?: any; requests?: any[] }
    | undefined;

  // Selected Plan state (when inspecting a single plan)
  const [selectedPlan, setSelectedPlan] = useState<BlockPlan | null>(navState?.plan || null);
  const [trains, setTrains] = useState<Train[]>([]);
  const [isLoadingPlan, setIsLoadingPlan] = useState<boolean>(false);
  const [planError, setPlanError] = useState<string | null>(null);

  // Validation & Conflict states
  const [isValidating, setIsValidating] = useState<boolean>(false);
  const [conflicts, setConflicts] = useState<ConstraintViolation[]>([]);
  const [totalConflicts, setTotalConflicts] = useState<number>(0);
  const [conflictSummary, setConflictSummary] = useState<string>('');

  // Human Review Lifecycle states
  const [isStartingReview, setIsStartingReview] = useState<boolean>(false);
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject' | null>(null);
  const [isReviewSubmitting, setIsReviewSubmitting] = useState<boolean>(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  // Block Modal Inspection
  const [inspectedBlock, setInspectedBlock] = useState<BlockPlanItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  // Block Modification state
  const [editingBlock, setEditingBlock] = useState<BlockPlanItem | null>(null);
  const [isModifyModalOpen, setIsModifyModalOpen] = useState<boolean>(false);
  const [isSavingBlock, setIsSavingBlock] = useState<boolean>(false);

  // All Plans List (when viewing /review overview)
  const [allPlans, setAllPlans] = useState<BlockPlan[]>([]);
  const [isLoadingList, setIsLoadingList] = useState<boolean>(false);
  const [listError, setListError] = useState<string | null>(null);

  // Determine active plan ID
  const activePlanId = routePlanId || selectedPlan?.plan_id;

  // -------------------------------------------------------------
  // 1. Load Specific Plan Details & Conflicts
  // -------------------------------------------------------------
  const loadPlanDetails = useCallback(async (id: string) => {
    setIsLoadingPlan(true);
    setPlanError(null);
    try {
      // Concurrently fetch plan details, conflicts, and operational trains
      const [planRes, conflictsRes, trainsRes] = await Promise.allSettled([
        planningService.getPlan(id),
        planningService.getPlanConflicts(id),
        operationalService.getTrains(),
      ]);

      if (planRes.status === 'fulfilled') {
        setSelectedPlan(planRes.value);
      } else {
        throw new Error(planRes.reason?.message || `Failed to retrieve block plan '${id}'.`);
      }

      if (trainsRes.status === 'fulfilled') {
        setTrains(trainsRes.value || []);
      }

      if (conflictsRes.status === 'fulfilled') {
        const confData: PlanConflictResponse = conflictsRes.value;
        setConflicts(confData.conflicts || []);
        setTotalConflicts(confData.total_conflicts ?? 0);
        setConflictSummary(confData.summary || '');
      } else {
        // Fallback to violations in evaluation summary if conflicts endpoint failed
        const existingFeas = planRes.status === 'fulfilled' ? planRes.value.evaluation_summary?.feasibility : null;
        if (existingFeas) {
          setConflicts(existingFeas.violations || []);
          setTotalConflicts(existingFeas.total_hard_violations || 0);
          setConflictSummary(existingFeas.summary || '');
        }
      }
    } catch (err: any) {
      setPlanError(err?.message || 'Error communicating with Railway Block Planning backend.');
    } finally {
      setIsLoadingPlan(false);
    }
  }, []);

  // -------------------------------------------------------------
  // 2. Load All Plans (for overview mode)
  // -------------------------------------------------------------
  const loadAllPlans = useCallback(async () => {
    setIsLoadingList(true);
    setListError(null);
    try {
      const data = await planningService.getPlans();
      setAllPlans(data);
    } catch (err: any) {
      setListError(err?.message || 'Failed to fetch existing block plans.');
    } finally {
      setIsLoadingList(false);
    }
  }, []);

  // -------------------------------------------------------------
  // 3. Re-run Live Validation
  // -------------------------------------------------------------
  const handleRevalidate = async () => {
    if (!activePlanId) return;
    setIsValidating(true);
    try {
      const valRes: PlanValidationResponse = await planningService.validatePlan(activePlanId);
      setConflicts(valRes.violations || []);
      setTotalConflicts(valRes.total_hard_violations ?? 0);
      setConflictSummary(valRes.summary || '');

      // Refresh plan state with updated validation
      setSelectedPlan((prev) =>
        prev
          ? {
              ...prev,
              is_feasible: valRes.is_feasible,
              overall_score: valRes.overall_score ?? prev.overall_score,
            }
          : prev
      );
    } catch (err: any) {
      console.error('Validation error:', err);
    } finally {
      setIsValidating(false);
    }
  };

  // -------------------------------------------------------------
  // 4. Human Review Workflow: Start Review
  // -------------------------------------------------------------
  const handleStartReview = async () => {
    if (!activePlanId) return;
    setIsStartingReview(true);
    setReviewError(null);
    try {
      const res = await planningService.reviewPlan(activePlanId, {
        action: 'start_review',
        reviewer: 'Operations Controller',
      });
      setSelectedPlan((prev) =>
        prev
          ? {
              ...prev,
              status: res.status,
              evaluation_summary: {
                ...(prev.evaluation_summary || {}),
                review_history: res.review_history,
              },
            }
          : prev
      );
    } catch (err: any) {
      setReviewError(err?.message || 'Failed to initiate review on plan.');
    } finally {
      setIsStartingReview(false);
    }
  };

  // -------------------------------------------------------------
  // 5. Human Review Workflow: Confirm Approve / Reject
  // -------------------------------------------------------------
  const handleConfirmReviewAction = async ({
    reviewer,
    comment,
  }: {
    reviewer?: string;
    comment?: string;
  }) => {
    if (!activePlanId || !reviewAction) return;
    setIsReviewSubmitting(true);
    setReviewError(null);
    try {
      const res = await planningService.reviewPlan(activePlanId, {
        action: reviewAction,
        reviewer,
        comment,
      });

      setSelectedPlan((prev) =>
        prev
          ? {
              ...prev,
              status: res.status,
              approved_by: res.approved_by || prev.approved_by,
              approved_at: res.approved_at || prev.approved_at,
              rejection_reason: res.rejection_reason || prev.rejection_reason,
              evaluation_summary: {
                ...(prev.evaluation_summary || {}),
                review_history: res.review_history,
              },
            }
          : prev
      );
      setReviewAction(null);
    } finally {
      setIsReviewSubmitting(false);
    }
  };

  // -------------------------------------------------------------
  // 6. Plan Item Modification: Save & Revalidate
  // -------------------------------------------------------------
  const handleSaveBlock = async (
    itemId: string,
    updates: {
      scheduled_start_minute: number;
      scheduled_end_minute: number;
      allocated_duration_minutes: number;
      status: ItemStatus;
    }
  ) => {
    if (!activePlanId) return;
    setIsSavingBlock(true);
    try {
      await planningService.updatePlanItem(activePlanId, itemId, updates);
      // Reload updated plan and conflicts
      await loadPlanDetails(activePlanId);
      setIsModifyModalOpen(false);
      setEditingBlock(null);
    } finally {
      setIsSavingBlock(false);
    }
  };

  // -------------------------------------------------------------
  // Route change effect
  // -------------------------------------------------------------
  useEffect(() => {
    if (routePlanId) {
      loadPlanDetails(routePlanId);
    } else if (navState?.plan) {
      setSelectedPlan(navState.plan);
      // Also fetch trains and conflicts for it
      operationalService.getTrains().then(setTrains).catch(() => {});
      planningService
        .getPlanConflicts(navState.plan.plan_id)
        .then((res) => {
          setConflicts(res.conflicts || []);
          setTotalConflicts(res.total_conflicts ?? 0);
          setConflictSummary(res.summary || '');
        })
        .catch(() => {
          const feas = navState.plan?.evaluation_summary?.feasibility;
          if (feas) {
            setConflicts(feas.violations || []);
            setTotalConflicts(feas.total_hard_violations || 0);
            setConflictSummary(feas.summary || '');
          }
        });
    } else {
      loadAllPlans();
    }
  }, [routePlanId, loadPlanDetails, loadAllPlans, navState]);

  // Handle opening block detail modal
  const handleSelectBlock = (block: BlockPlanItem) => {
    setInspectedBlock(block);
    setIsModalOpen(true);
  };

  const handleOpenModifyModal = (block: BlockPlanItem) => {
    setEditingBlock(block);
    setIsModifyModalOpen(true);
  };

  const handleInspectBlockByRequestId = (requestId: string) => {
    if (!selectedPlan?.items) return;
    const match = selectedPlan.items.find((it) => it.request_id === requestId);
    if (match) {
      setInspectedBlock(match);
      setIsModalOpen(true);
    }
  };

  // Rationale matching for inspected block
  const currentBlockRationale = useMemo(() => {
    if (!inspectedBlock || !selectedPlan?.evaluation_summary?.decision_log) return undefined;
    const match = selectedPlan.evaluation_summary.decision_log.find(
      (d: any) => d.request_id === inspectedBlock.request_id
    );
    return match?.rationale;
  }, [inspectedBlock, selectedPlan]);

  const isPlanImmutable = selectedPlan?.status === 'APPROVED';

  // =============================================================
  // RENDER: SINGLE PLAN DETAILS & REVIEW VIEW (Prompt 5 & 6)
  // =============================================================
  if (activePlanId) {
    if (isLoadingPlan && !selectedPlan) {
      return (
        <LoadingState message={`Retrieving block plan '${activePlanId}' and constraint telemetry...`} />
      );
    }

    if (planError && !selectedPlan) {
      return (
        <ErrorState
          title="Plan Details Unavailable"
          message={planError}
          onRetry={() => loadPlanDetails(activePlanId)}
        />
      );
    }

    if (!selectedPlan) {
      return (
        <EmptyState
          title="Block Plan Not Found"
          message={`The block plan with ID '${activePlanId}' could not be located in the operational database.`}
          actionLabel="Go to Planning Workspace"
          onAction={() => navigate('/planning')}
        />
      );
    }

    const items = selectedPlan.items || [];

    return (
      <div className="space-y-6">
        {/* 1. Plan Summary Header */}
        <PlanSummaryHeader
          plan={selectedPlan}
          isValidating={isValidating}
          onRevalidate={handleRevalidate}
          onRefresh={() => loadPlanDetails(selectedPlan.plan_id)}
          hardViolationsCount={totalConflicts}
        />

        {/* 2. Human Review Action Bar (Prompt 6 Review Workflow) */}
        <PlanReviewActionBar
          plan={selectedPlan}
          hardViolationsCount={totalConflicts}
          onStartReview={handleStartReview}
          isStartingReview={isStartingReview}
          onOpenApproveModal={() => setReviewAction('approve')}
          onOpenRejectModal={() => setReviewAction('reject')}
          error={reviewError}
        />

        {/* 3. Plan KPI Metrics Grid */}
        <PlanKpiGrid plan={selectedPlan} hardViolationsCount={totalConflicts} />

        {/* 4. Operational Timeline Visualization */}
        <PlanTimeline
          items={items}
          trains={trains}
          onSelectBlock={handleSelectBlock}
          selectedBlockId={inspectedBlock?.id || inspectedBlock?.request_id}
        />

        {/* 5. Detailed Block Table (with Modify Action) */}
        <PlanBlockTable
          items={items}
          onSelectBlock={handleSelectBlock}
          onModifyBlock={handleOpenModifyModal}
          isImmutable={isPlanImmutable}
          selectedBlockId={inspectedBlock?.id || inspectedBlock?.request_id}
        />

        {/* 6. Deterministic Conflict Detection */}
        <PlanConflictsSection
          conflicts={conflicts}
          totalConflicts={totalConflicts}
          summaryText={conflictSummary}
          onInspectBlockByRequestId={handleInspectBlockByRequestId}
        />

        {/* 7. Railway Safety Rules & Optimization Validation */}
        <PlanValidationSection
          plan={selectedPlan}
          hardViolationsCount={totalConflicts}
        />

        {/* 8. Individual Block Details Modal */}
        <BlockDetailModal
          block={inspectedBlock}
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onModify={
            inspectedBlock && !isPlanImmutable
              ? () => handleOpenModifyModal(inspectedBlock)
              : undefined
          }
          isImmutable={isPlanImmutable}
          decisionRationale={currentBlockRationale}
        />

        {/* 9. Block Modification Modal */}
        <ModifyBlockModal
          block={editingBlock}
          isOpen={isModifyModalOpen}
          onClose={() => {
            setIsModifyModalOpen(false);
            setEditingBlock(null);
          }}
          onSave={handleSaveBlock}
          isSaving={isSavingBlock}
        />

        {/* 10. Review Action Modal (Approve / Reject) */}
        <ReviewActionModal
          isOpen={reviewAction !== null}
          onClose={() => setReviewAction(null)}
          action={reviewAction}
          planId={selectedPlan.plan_id}
          planTitle={selectedPlan.title}
          onConfirm={handleConfirmReviewAction}
          isSubmitting={isReviewSubmitting}
        />
      </div>
    );
  }

  // =============================================================
  // RENDER: ALL PLANS DIRECTORY VIEW (/review overview)
  // =============================================================
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 leading-tight">
              Block Plan Review & Validation
            </h1>
            <Badge variant="blue" statusText="ALL PLANS" />
          </div>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            Inspect scheduled AI block plans, operational timelines, hard constraints, and conflicts.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={loadAllPlans}
            isLoading={isLoadingList}
            leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Refresh Plans
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => navigate('/planning')}
            leftIcon={<Layers className="w-3.5 h-3.5" />}
          >
            New Plan
          </Button>
        </div>
      </div>

      {isLoadingList ? (
        <LoadingState message="Loading persisted block plans..." />
      ) : listError ? (
        <ErrorState
          title="Failed to Load Plans"
          message={listError}
          onRetry={loadAllPlans}
        />
      ) : allPlans.length === 0 ? (
        <EmptyState
          title="No Block Plans Generated Yet"
          message="There are no candidate or finalized block plans in the repository. Generate a plan using the real AI engine in the Planning Workspace."
          actionLabel="Open Planning Workspace"
          onAction={() => navigate('/planning')}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {allPlans.map((p) => {
            const itemCount = p.items?.length || 0;
            const isFeas = p.is_feasible;

            return (
              <Card
                key={p.plan_id}
                title={
                  <span className="font-mono text-xs font-bold text-blue-700">
                    {p.plan_id}
                  </span>
                }
                subtitle={formatTimestamp(p.created_at)}
                action={<Badge statusText={p.status} dot />}
                accent={isFeas ? 'blue' : 'red'}
                footer={
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={isFeas ? 'emerald' : 'red'}
                        statusText={isFeas ? 'FEASIBLE' : 'CONFLICTS'}
                      />
                    </div>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => navigate(`/review/${p.plan_id}`)}
                      rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
                      className="text-xs"
                    >
                      Inspect Plan Details
                    </Button>
                  </div>
                }
              >
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-slate-900 line-clamp-2">
                    {p.title}
                  </h3>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-xs">
                    <div className="p-2 bg-slate-50 rounded-lg">
                      <span className="block text-[10px] text-slate-400 uppercase font-semibold">
                        Optimization Score
                      </span>
                      <span className="font-mono font-bold text-blue-600 text-sm">
                        {p.overall_score != null ? `${Number(p.overall_score).toFixed(1)}%` : '—'}
                      </span>
                    </div>

                    <div className="p-2 bg-slate-50 rounded-lg">
                      <span className="block text-[10px] text-slate-400 uppercase font-semibold">
                        Scheduled Blocks
                      </span>
                      <span className="font-mono font-bold text-slate-800 text-sm">
                        {itemCount} assignments
                      </span>
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-500 font-mono">
                    Strategy: <span className="font-semibold text-slate-700">{p.selected_strategy || 'Default'}</span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
