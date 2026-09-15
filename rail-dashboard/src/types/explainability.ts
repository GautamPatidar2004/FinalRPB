export type ProviderHealthState =
  | 'AVAILABLE'
  | 'DEGRADED'
  | 'RATE_LIMITED'
  | 'QUOTA_EXCEEDED'
  | 'AUTH_FAILED'
  | 'UNAVAILABLE'
  | 'DISABLED';

export interface ProviderMetadata {
  provider: 'gemini' | 'groq' | 'deterministic' | string;
  provider_status: ProviderHealthState;
  fallback_used: boolean;
  fallback_reason?: string | null;
  model?: string | null;
  request_timestamp: string;
  latency_ms: number;
}

export interface NarrativeExplanation {
  executive_summary: string;
  operational_context: string;
  key_tradeoffs: string[];
  risk_mitigation: string;
  recommendations: string[];
}

export interface FeatureContribution {
  feature: string;
  input_value: number;
  contribution: number;
  direction: 'POSITIVE' | 'NEGATIVE' | string;
  importance_rank: number;
}

export interface AspectExplanation {
  aspect: string;
  summary: string;
  features: FeatureContribution[];
}

export interface PredictionExplanationResponse {
  request_id: string;
  predicted_score: number;
  predicted_category: string;
  explanation_method: string;
  base_value: number;
  aspects: Record<string, AspectExplanation>;
  feature_contributions: FeatureContribution[];
}

export interface DecisionTraceStage {
  stage_name: string;
  status: string;
  details: Record<string, any>;
}

export interface RequestDecisionTrace {
  request_id: string;
  final_decision: 'SELECTED' | 'POSTPONED' | 'REJECTED' | string;
  stages: DecisionTraceStage[];
}

export interface ConstraintExplanationRecord {
  constraint_type: string;
  canonical_type: string;
  passed: boolean;
  request_id?: string | null;
  block_id?: string | null;
  affected_window?: number[] | null;
  reason: string;
  relevant_values: Record<string, any>;
}

export interface OptimizerCandidateEvidence {
  strategy_name: string;
  is_feasible: boolean;
  score: number;
  hard_violations_count: number;
  objective_contribution: number;
  grouping_benefit: number;
  operational_impact: number;
  asset_priority_benefit: number;
  overdue_benefit: number;
  is_selected: boolean;
}

export interface OptimizerExplanation {
  selected_strategy: string;
  candidates_evaluated: OptimizerCandidateEvidence[];
  replanning_applied: boolean;
  decision_log: Record<string, any>[];
}

export interface ScoreBreakdown {
  overall_score: number;
  asset_availability: number;
  risk_coverage: number;
  overdue: number;
  operational_impact: number;
  train_conflict: number;
  grouping: number;
  resource_utilization: number;
  factor_scores: Record<string, number>;
}

export interface DecisionReasonRecord {
  request_id: string;
  decision: 'SELECTED' | 'POSTPONED' | 'UNSCHEDULED' | 'GROUPED' | 'ALTERNATIVE_WINDOW' | string;
  primary_reason: string;
  evidence: string[];
  slot?: number[] | null;
  affected_asset?: string | null;
}

export interface UnifiedPlanExplanation {
  planning_run_id: string;
  selected_plan: Record<string, any>;
  prediction_evidence: Record<string, PredictionExplanationResponse>;
  decision_trace: RequestDecisionTrace[];
  constraint_results: ConstraintExplanationRecord[];
  optimizer_decisions: OptimizerExplanation;
  score_breakdown: ScoreBreakdown;
  scheduled_reasons: DecisionReasonRecord[];
  postponed_reasons: DecisionReasonRecord[];
  grouping_reasons: DecisionReasonRecord[];
  alternative_reasons: DecisionReasonRecord[];
  warnings: string[];
  model_versions: Record<string, string>;
  provider_metadata?: ProviderMetadata | null;
  narrative?: NarrativeExplanation | null;
}

export interface ProviderStatusDetail {
  enabled: boolean;
  status: ProviderHealthState;
  model?: string | null;
  request_budget?: number | null;
  total_requests?: number;
}

export interface ProvidersStatusResponse {
  gemini: ProviderStatusDetail;
  groq: ProviderStatusDetail;
  openai?: ProviderStatusDetail;
  deterministic: ProviderStatusDetail;
  preferred_provider: string;
  fallback_enabled: boolean;
}

export interface ExplainPlanParams {
  plan_id?: string;
  corridor_id?: string;
  request_ids?: string[];
  start_minute?: number;
  end_minute?: number;
  use_llm?: boolean;
}

export interface ExplainPredictionParams {
  request_id?: string;
  corridor_id?: string;
  asset_id?: string;
  department?: string;
  required_duration_minutes?: number;
  earliest_start_minute?: number;
  latest_end_minute?: number;
  is_traffic_block_required?: boolean;
  is_power_block_required?: boolean;
  urgency?: string;
  linked_defect_id?: string;
}
