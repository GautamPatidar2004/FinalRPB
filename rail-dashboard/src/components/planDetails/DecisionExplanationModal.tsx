import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Clock,
  ShieldCheck,
  AlertTriangle,
  Layers,
  BarChart2,
  GitCommit,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Info,
  Sliders,
} from 'lucide-react';
import type { UnifiedPlanExplanation } from '../../types';
import { Modal, Button, Badge, LoadingState, ErrorState, ProviderBadge } from '../common';
import { ShapAttributionCard } from './ShapAttributionCard';
import { DecisionTraceStages } from './DecisionTraceStages';
import { explainService } from '../../services/explainService';
import { formatMinuteToTime } from '../../utils';

export type ExplanationTab =
  | 'overview'
  | 'rationale'
  | 'factors'
  | 'trace'
  | 'constraints'
  | 'scoring';

export interface DecisionExplanationModalProps {
  isOpen: boolean;
  onClose: () => void;
  planId?: string;
  explanation?: UnifiedPlanExplanation | null;
  targetRequestId?: string | null;
  targetBlockId?: string | null;
  corridorId?: string;
  requestIds?: string[];
}

export const DecisionExplanationModal: React.FC<DecisionExplanationModalProps> = ({
  isOpen,
  onClose,
  planId,
  explanation: initialExplanation,
  targetRequestId,
  targetBlockId: _targetBlockId,
  corridorId,
  requestIds,
}) => {
  const [activeTab, setActiveTab] = useState<ExplanationTab>('overview');
  const [explanation, setExplanation] = useState<UnifiedPlanExplanation | null>(
    initialExplanation || null
  );
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(
    targetRequestId || null
  );

  // Sync state when props change
  useEffect(() => {
    if (initialExplanation) {
      setExplanation(initialExplanation);
    }
  }, [initialExplanation]);

  useEffect(() => {
    if (targetRequestId) {
      setSelectedRequestId(targetRequestId);
    }
  }, [targetRequestId]);

  // Fetch explanation on demand if not passed directly
  useEffect(() => {
    if (!isOpen) return;

    // If explanation already provided and matches target, skip
    if (explanation && (planId ? explanation.planning_run_id === planId : true)) {
      return;
    }

    const loadExplanation = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await explainService.getPlanExplanation({
          plan_id: planId,
          corridor_id: corridorId,
          request_ids: requestIds,
          use_llm: true,
        });
        setExplanation(data);
      } catch (err: any) {
        setError(err?.message || 'Failed to retrieve explainability telemetry from backend.');
      } finally {
        setIsLoading(false);
      }
    };

    loadExplanation();
  }, [isOpen, planId, corridorId, requestIds]);

  if (!isOpen) return null;

  // Derive request options available in explanation
  const availableRequestIds = Array.from(
    new Set([
      ...Object.keys(explanation?.prediction_evidence || {}),
      ...(explanation?.decision_trace || []).map((t) => t.request_id),
      ...(explanation?.scheduled_reasons || []).map((r) => r.request_id),
      ...(explanation?.postponed_reasons || []).map((r) => r.request_id),
    ])
  );

  const activeReqId =
    selectedRequestId || (availableRequestIds.length > 0 ? availableRequestIds[0] : null);

  // Specific target records
  const targetScheduledReason = explanation?.scheduled_reasons?.find(
    (r) => r.request_id === activeReqId
  );
  const targetPostponedReason = explanation?.postponed_reasons?.find(
    (r) => r.request_id === activeReqId
  );
  const targetGroupingReason = explanation?.grouping_reasons?.find(
    (r) => r.request_id === activeReqId
  );
  const targetAlternativeReason = explanation?.alternative_reasons?.find(
    (r) => r.request_id === activeReqId
  );

  const targetTrace = explanation?.decision_trace?.find(
    (t) => t.request_id === activeReqId
  );
  const targetPrediction = activeReqId
    ? explanation?.prediction_evidence?.[activeReqId]
    : null;

  const targetConstraints = explanation?.constraint_results?.filter((c) =>
    activeReqId ? c.request_id === activeReqId || !c.request_id : true
  );

  const narrative = explanation?.narrative;
  const providerMeta = explanation?.provider_metadata;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="flex items-center gap-1.5 font-bold text-slate-900 text-lg">
            <HelpCircle className="w-5 h-5 text-blue-600" />
            Why This Planning Decision?
          </span>
          <ProviderBadge metadata={providerMeta} compact />
        </div>
      }
      subtitle={
        <div className="flex items-center gap-2 text-slate-500 text-[13px] flex-wrap">
          <span>Run: <strong className="font-mono text-slate-700">{explanation?.planning_run_id || planId || 'Dynamic'}</strong></span>
          {activeReqId && (
            <span>• Inspecting: <strong className="font-mono text-blue-700">{activeReqId}</strong></span>
          )}
        </div>
      }
      maxWidth="3xl"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2 text-slate-400 text-[11.5px]">
            <span>Deterministic authority preserved • Prompt 1 & 2 verified</span>
          </div>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Request selector dropdown if multiple requests exist */}
        {availableRequestIds.length > 1 && (
          <div className="flex items-center justify-between gap-3 p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[13px]">
            <span className="font-semibold text-slate-700 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-slate-500" /> Focus Request:
            </span>
            <select
              value={activeReqId || ''}
              onChange={(e) => setSelectedRequestId(e.target.value)}
              className="bg-white border border-slate-300 rounded-lg px-3 py-1 font-mono text-blue-700 font-semibold text-[13px] focus:ring-blue-500 focus:border-blue-500"
            >
              {availableRequestIds.map((rid) => (
                <option key={rid} value={rid}>
                  {rid}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 gap-1 overflow-x-auto text-[13px]">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`px-3 py-2 font-semibold border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${activeTab === 'overview'
              ? 'border-blue-600 text-blue-700'
              : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>AI Narrative</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('rationale')}
            className={`px-3 py-2 font-semibold border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${activeTab === 'rationale'
              ? 'border-blue-600 text-blue-700'
              : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
          >
            <Info className="w-4 h-4" />
            <span>Decision Reasons</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('factors')}
            className={`px-3 py-2 font-semibold border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${activeTab === 'factors'
              ? 'border-blue-600 text-blue-700'
              : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
          >
            <BarChart2 className="w-4 h-4" />
            <span>SHAP Factors</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('trace')}
            className={`px-3 py-2 font-semibold border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${activeTab === 'trace'
              ? 'border-blue-600 text-blue-700'
              : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
          >
            <GitCommit className="w-4 h-4" />
            <span>Decision Trace</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('constraints')}
            className={`px-3 py-2 font-semibold border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${activeTab === 'constraints'
              ? 'border-blue-600 text-blue-700'
              : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Constraints</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('scoring')}
            className={`px-3 py-2 font-semibold border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${activeTab === 'scoring'
              ? 'border-blue-600 text-blue-700'
              : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
          >
            <Sliders className="w-4 h-4" />
            <span>Score Breakdown</span>
          </button>
        </div>

        {/* Loading / Error States */}
        {isLoading && (
          <div className="py-12">
            <LoadingState message="Synthesizing multi-model evidence and natural language explanation..." />
          </div>
        )}

        {error && !explanation && (
          <div className="py-6">
            <ErrorState
              title="Explanation Unavailable"
              message={error}
              onRetry={() => {
                explainService.clearCache();
                setExplanation(null);
              }}
            />
          </div>
        )}

        {!isLoading && explanation && (
          <div className="space-y-4 max-h-[68vh] overflow-y-auto pr-1">
            {/* TAB 1: OVERVIEW & NATURAL-LANGUAGE AI NARRATIVE */}
            {activeTab === 'overview' && (
              <div className="space-y-4 text-[14px]">
                {/* Provider Telemetry Card */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="font-bold text-slate-700 flex items-center gap-2">
                      <ProviderBadge metadata={providerMeta} />
                    </span>
                    {/* {providerMeta?.fallback_used && (
                      <span className="text-[12px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                        {providerMeta.fallback_reason || 'Fallback provider activated'}
                      </span>
                    )} */}
                  </div>
                  {providerMeta?.provider === 'deterministic' && (
                    <div className="flex items-center gap-2 text-[12px] text-amber-800 bg-amber-50/70 p-2 rounded-lg border border-amber-200">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>
                        Structured deterministic explanation synthesized from internal constraint and optimizer logic. LLM provider offline or quota reached.
                      </span>
                    </div>
                  )}
                </div>

                {/* Executive Summary */}
                {narrative?.executive_summary && (
                  <div className="p-4 bg-blue-50/50 border border-blue-200 rounded-xl space-y-1.5">
                    <h4 className="text-[13px] font-bold uppercase tracking-wider text-blue-900 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-blue-600" /> Executive AI Summary
                    </h4>
                    <p className="text-slate-800 leading-relaxed font-medium">
                      {narrative.executive_summary}
                    </p>
                  </div>
                )}

                {/* Operational Context */}
                {narrative?.operational_context && (
                  <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-1.5 shadow-xs">
                    <h4 className="text-[12px] font-bold uppercase tracking-wider text-slate-400">
                      Operational Context
                    </h4>
                    <p className="text-slate-700 leading-relaxed">
                      {narrative.operational_context}
                    </p>
                  </div>
                )}

                {/* Key Trade-offs & Recommendations */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {narrative?.key_tradeoffs && narrative.key_tradeoffs.length > 0 && (
                    <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                      <h4 className="text-[12px] font-bold uppercase tracking-wider text-slate-600">
                        Key Trade-Offs Evaluated
                      </h4>
                      <ul className="space-y-1 text-[13px] text-slate-700 pl-4 list-disc">
                        {narrative.key_tradeoffs.map((t, i) => (
                          <li key={i}>{t}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {narrative?.recommendations && narrative.recommendations.length > 0 && (
                    <div className="p-3.5 bg-emerald-50/60 border border-emerald-200 rounded-xl space-y-2">
                      <h4 className="text-[12px] font-bold uppercase tracking-wider text-emerald-800">
                        Section Controller Recommendations
                      </h4>
                      <ul className="space-y-1 text-[13px] text-emerald-900 pl-4 list-disc">
                        {narrative.recommendations.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {/* Risk Mitigation */}
                {narrative?.risk_mitigation && (
                  <div className="p-3 bg-amber-50/50 border border-amber-200 rounded-xl space-y-1">
                    <h4 className="text-[12px] font-bold uppercase tracking-wider text-amber-800">
                      Safety & Risk Mitigation
                    </h4>
                    <p className="text-[13px] text-amber-900">{narrative.risk_mitigation}</p>
                  </div>
                )}

                {/* Warnings */}
                {explanation.warnings && explanation.warnings.length > 0 && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl space-y-1 text-[12.5px]">
                    <span className="font-bold text-red-800 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-600" /> Operational Warnings
                    </span>
                    <ul className="list-disc pl-4 text-red-700 space-y-0.5">
                      {explanation.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: DECISION REASONS (SCHEDULED, POSTPONED, GROUPED, ALTERNATIVES) */}
            {activeTab === 'rationale' && (
              <div className="space-y-4">
                {/* Specific decision for selected request */}
                {targetScheduledReason && (
                  <div className="p-4 bg-emerald-50/60 border border-emerald-200 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Why This Block Was Selected
                      </span>
                      <Badge variant="emerald" statusText="SCHEDULED" />
                    </div>
                    <p className="text-[14px] font-bold text-emerald-950">
                      {targetScheduledReason.primary_reason}
                    </p>
                    {targetScheduledReason.slot && (
                      <p className="font-mono text-[12.5px] text-emerald-800">
                        Selected Window: {formatMinuteToTime(targetScheduledReason.slot[0])} - {formatMinuteToTime(targetScheduledReason.slot[1])}
                      </p>
                    )}
                    {targetScheduledReason.evidence && targetScheduledReason.evidence.length > 0 && (
                      <ul className="space-y-1 text-[12.5px] text-slate-700 pl-4 list-disc pt-1 border-t border-emerald-200/60">
                        {targetScheduledReason.evidence.map((ev, i) => (
                          <li key={i}>{ev}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {targetPostponedReason && (
                  <div className="p-4 bg-amber-50/60 border border-amber-200 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-bold uppercase tracking-wider text-amber-800 flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-amber-600" /> Why This Request Was Postponed / Unscheduled
                      </span>
                      <Badge variant="amber" statusText="POSTPONED" />
                    </div>
                    <p className="text-[14px] font-bold text-amber-950">
                      {targetPostponedReason.primary_reason}
                    </p>
                    {targetPostponedReason.evidence && targetPostponedReason.evidence.length > 0 && (
                      <ul className="space-y-1 text-[12.5px] text-slate-700 pl-4 list-disc pt-1 border-t border-amber-200/60">
                        {targetPostponedReason.evidence.map((ev, i) => (
                          <li key={i}>{ev}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {/* Grouping / Mega-Block Rationale */}
                {targetGroupingReason && (
                  <div className="p-4 bg-indigo-50/60 border border-indigo-200 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-bold uppercase tracking-wider text-indigo-800 flex items-center gap-1.5">
                        <Layers className="w-4 h-4 text-indigo-600" /> Why Tasks Were Grouped (Mega-Block Synergy)
                      </span>
                      <Badge variant="purple" statusText="GROUPED" />
                    </div>
                    <p className="text-[13.5px] font-semibold text-indigo-950">
                      {targetGroupingReason.primary_reason}
                    </p>
                    {targetGroupingReason.evidence && (
                      <ul className="space-y-1 text-[12.5px] text-slate-700 pl-4 list-disc">
                        {targetGroupingReason.evidence.map((ev, i) => (
                          <li key={i}>{ev}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {/* Alternative Windows Evaluated */}
                {targetAlternativeReason && (
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                    <span className="text-[12px] font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-slate-500" /> Evaluated Alternative Windows
                    </span>
                    <p className="text-[13.5px] text-slate-800 font-medium">
                      {targetAlternativeReason.primary_reason}
                    </p>
                    {targetAlternativeReason.evidence && (
                      <ul className="space-y-1 text-[12.5px] text-slate-600 pl-4 list-disc">
                        {targetAlternativeReason.evidence.map((ev, i) => (
                          <li key={i}>{ev}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {/* If neither scheduled nor postponed reason exists for activeReqId */}
                {!targetScheduledReason && !targetPostponedReason && (
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-slate-600 text-[13px]">
                    No explicit decision override record found for request <strong className="font-mono">{activeReqId}</strong>.
                    Standard constraint optimization applied.
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: SHAP FACTORS */}
            {activeTab === 'factors' && (
              <ShapAttributionCard prediction={targetPrediction} />
            )}

            {/* TAB 4: DECISION TRACE */}
            {activeTab === 'trace' && (
              <DecisionTraceStages trace={targetTrace} />
            )}

            {/* TAB 5: CONSTRAINTS VALIDATION */}
            {activeTab === 'constraints' && (
              <div className="space-y-3">
                <div className="text-[12.5px] text-slate-500 pb-1 border-b border-slate-100">
                  Showing railway constraint verification records evaluated by RailwayConstraintEngine.
                </div>
                {targetConstraints && targetConstraints.length > 0 ? (
                  targetConstraints.map((c, i) => (
                    <div
                      key={i}
                      className={`p-3 rounded-xl border text-[13px] space-y-1.5 ${c.passed
                        ? 'bg-emerald-50/40 border-emerald-200 text-slate-800'
                        : 'bg-red-50/50 border-red-200 text-red-900'
                        }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-[12.5px] flex items-center gap-1.5">
                          {c.passed ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-600" />
                          )}
                          {c.constraint_type}
                        </span>
                        <Badge
                          variant={c.passed ? 'emerald' : 'red'}
                          statusText={c.passed ? 'PASSED' : 'VIOLATION'}
                        />
                      </div>
                      <p className="font-medium">{c.reason}</p>
                      {c.affected_window && (
                        <span className="block font-mono text-[11.5px] text-slate-500">
                          Window: {formatMinuteToTime(c.affected_window[0])} - {formatMinuteToTime(c.affected_window[1])}
                        </span>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-slate-500 text-[13px] italic">No constraint records found.</p>
                )}
              </div>
            )}

            {/* TAB 6: SCORE BREAKDOWN */}
            {activeTab === 'scoring' && explanation.score_breakdown && (
              <div className="space-y-4">
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between">
                  <div>
                    <span className="block text-[11px] font-bold uppercase tracking-wider text-blue-700">
                      Overall Composite Score
                    </span>
                    <span className="text-2xl font-bold font-mono text-blue-950">
                      {(explanation.score_breakdown.overall_score * 100).toFixed(1)}%
                    </span>
                  </div>
                  <span className="text-[12px] font-medium text-blue-800">
                    Strategy: <strong className="font-mono">{explanation.optimizer_decisions?.selected_strategy || 'Default'}</strong>
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-[13px]">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                    <span className="block text-[11px] uppercase tracking-wider text-slate-400 font-bold">
                      Risk Coverage
                    </span>
                    <span className="font-mono text-lg font-bold text-slate-800">
                      {(explanation.score_breakdown.risk_coverage * 100).toFixed(0)}%
                    </span>
                  </div>

                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                    <span className="block text-[11px] uppercase tracking-wider text-slate-400 font-bold">
                      Asset Availability
                    </span>
                    <span className="font-mono text-lg font-bold text-slate-800">
                      {(explanation.score_breakdown.asset_availability * 100).toFixed(0)}%
                    </span>
                  </div>

                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                    <span className="block text-[11px] uppercase tracking-wider text-slate-400 font-bold">
                      Train Conflict Free
                    </span>
                    <span className="font-mono text-lg font-bold text-emerald-700">
                      {(explanation.score_breakdown.train_conflict * 100).toFixed(0)}%
                    </span>
                  </div>

                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                    <span className="block text-[11px] uppercase tracking-wider text-slate-400 font-bold">
                      Grouping Synergy
                    </span>
                    <span className="font-mono text-lg font-bold text-indigo-700">
                      {(explanation.score_breakdown.grouping * 100).toFixed(0)}%
                    </span>
                  </div>

                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                    <span className="block text-[11px] uppercase tracking-wider text-slate-400 font-bold">
                      Overdue Urgency
                    </span>
                    <span className="font-mono text-lg font-bold text-amber-700">
                      {(explanation.score_breakdown.overdue * 100).toFixed(0)}%
                    </span>
                  </div>

                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                    <span className="block text-[11px] uppercase tracking-wider text-slate-400 font-bold">
                      Operational Impact
                    </span>
                    <span className="font-mono text-lg font-bold text-slate-800">
                      {(explanation.score_breakdown.operational_impact * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>

                {/* Optimizer Strategy Comparison */}
                {explanation.optimizer_decisions?.candidates_evaluated &&
                  explanation.optimizer_decisions.candidates_evaluated.length > 0 && (
                    <div className="pt-2 border-t border-slate-200 space-y-2">
                      <span className="block text-[12px] font-bold uppercase tracking-wider text-slate-500">
                        Candidate Strategies Evaluated by Optimizer
                      </span>
                      <div className="space-y-1.5">
                        {explanation.optimizer_decisions.candidates_evaluated.map((c, i) => (
                          <div
                            key={i}
                            className={`p-2.5 rounded-lg border flex items-center justify-between text-[12.5px] ${c.is_selected
                              ? 'bg-blue-50 border-blue-300 font-bold text-blue-900'
                              : 'bg-white border-slate-200 text-slate-700'
                              }`}
                          >
                            <span className="font-mono">{c.strategy_name}</span>
                            <div className="flex items-center gap-3">
                              <span>Violations: {c.hard_violations_count}</span>
                              <span className="font-mono">Score: {(c.score * 100).toFixed(1)}%</span>
                              {c.is_selected && (
                                <Badge variant="blue" statusText="SELECTED" />
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};
