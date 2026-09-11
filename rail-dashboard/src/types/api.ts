// ====================================================================
// Railway AI Block Planning - Centralized Backend Type Definitions
// Corresponds directly to FastAPI schemas (schemas/backend.py, schemas/railway.py)
// ====================================================================

export type Department = 'Engineering' | 'Traction Distribution' | 'Signalling & Telecom' | 'Operations' | 'General';

export type TrackType = 'UP' | 'DOWN' | 'BOTH' | 'SINGLE';

export type Priority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type PlanStatus = 'DRAFT' | 'UNDER_REVIEW' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';

export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SCHEDULED';

export type ItemStatus = 'SCHEDULED' | 'DEFERRED' | 'REJECTED';

export interface UserProfile {
  id: string;
  email: string;
  full_name?: string | null;
  department?: Department | string | null;
  role: 'admin' | 'controller' | 'engineer' | 'operator' | string;
  created_at?: string;
  updated_at?: string;
}

export interface Corridor {
  corridor_id: string;
  name: string;
  length_km: number;
  is_electrified: boolean;
  available_start_minute: number;
  available_end_minute: number;
  max_parallel_blocks: number;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface Asset {
  asset_id: string;
  corridor_id: string;
  department: Department;
  track_type: TrackType;
  start_km: number;
  end_km: number;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface Train {
  train_id: string;
  train_type: string;
  corridor_id: string;
  entry_minute: number;
  exit_minute: number;
  priority_level: number;
  created_at?: string;
  updated_at?: string;
}

export interface MaintenanceRequest {
  request_id: string;
  department: Department;
  corridor_id: string;
  asset_id: string;
  required_duration_minutes: number;
  earliest_start_minute: number;
  latest_end_minute: number;
  is_power_block_required: boolean;
  is_traffic_block_required: boolean;
  urgency: Priority;
  linked_defect_id?: string | null;
  status: RequestStatus;
  days_overdue?: number;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface DashboardAsset {
  asset_id: string;
  corridor_id: string;
  department: Department;
  start_km: number;
  end_km: number;
  track_type: TrackType;
  is_active: boolean;
  scheduled_blocks_count: number;
  created_at?: string | null;
}

export interface RequestFilters {
  corridor_id?: string;
  department?: Department | string;
  status?: RequestStatus | string;
  urgency?: Priority | string;
  asset_id?: string;
  overdue_only?: boolean;
  start_minute?: number;
  end_minute?: number;
  limit?: number;
  offset?: number;
}

export interface AssetFilters {
  corridor_id?: string;
  department?: Department | string;
  track_type?: TrackType | string;
}

export interface BlockPlanItem {
  id?: string;
  plan_id: string;
  request_id: string;
  corridor_id: string;
  asset_id: string;
  department: Department;
  scheduled_start_minute: number;
  scheduled_end_minute: number;
  allocated_duration_minutes: number;
  status: ItemStatus;
  conflict_flags: string[];
  created_at?: string;
  updated_at?: string;
}

export interface BlockPlan {
  plan_id: string;
  title: string;
  status: PlanStatus;
  overall_score?: number | null;
  is_feasible: boolean;
  selected_strategy?: string | null;
  evaluation_summary?: Record<string, any>;
  created_by?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  rejection_reason?: string | null;
  created_at?: string;
  updated_at?: string;
  items?: BlockPlanItem[];
}

export interface PlanGenerationParams {
  title?: string;
  corridor_id?: string;
  department?: Department;
  start_minute?: number;
  end_minute?: number;
  request_ids?: string[];
}

export interface PlanEvaluationSummary {
  overall_score: number;
  factor_scores?: {
    priority_coverage?: number;
    unresolved_risk_score?: number;
    conflict_free_score?: number;
    operational_disruption_score?: number;
    window_utilization?: number;
    duration_efficiency?: number;
    [key: string]: number | undefined;
  };
  strengths?: string[];
  penalties?: string[];
  metrics?: {
    total_requests?: number;
    scheduled_requests?: number;
    train_conflicts?: number;
    corridor_overload_conflicts?: number;
    unscheduled_critical?: number;
    unscheduled_high?: number;
    peak_traffic_overlaps?: number;
    night_shadow_placements?: number;
    [key: string]: any;
  };
  feasibility?: {
    is_feasible: boolean;
    total_hard_violations: number;
    violations: any[];
    summary: string;
  };
  decision_log?: Array<{
    decision_type: string;
    request_id: string;
    plan_id: string;
    priority_category: string;
    rationale: string;
  }>;
  unresolved_requirements?: any[];
  replanning_applied?: boolean;
}

export interface PlanGenerationResult {
  plan_id: string;
  title: string;
  status: PlanStatus;
  is_feasible: boolean;
  overall_score: number;
  selected_strategy: string;
  created_at: string;
  scheduled_blocks: BlockPlanItem[];
  evaluation: PlanEvaluationSummary;
  decision_log: Array<{
    decision_type: string;
    request_id: string;
    plan_id: string;
    priority_category: string;
    rationale: string;
  }>;
  unresolved_requests: any[];
  replanning_applied: boolean;
}

export interface ConstraintViolation {
  constraint_type: string;
  severity: string;
  request_id?: string | null;
  corridor_id?: string | null;
  asset_id?: string | null;
  train_id?: string | null;
  time_minute?: number | null;
  reason: string;
  is_blocking: boolean;
}

export interface PlanValidationResponse {
  plan_id: string;
  is_feasible: boolean;
  total_hard_violations: number;
  violations: ConstraintViolation[];
  summary: string;
  overall_score?: number | null;
}

export interface PlanConflictResponse {
  plan_id: string;
  is_feasible: boolean;
  total_conflicts: number;
  conflicts: ConstraintViolation[];
  summary: string;
}

export interface PlanReviewRequest {
  action: 'start_review' | 'approve' | 'reject';
  reviewer?: string;
  comment?: string;
}

export interface PlanReviewResponse {
  plan_id: string;
  status: PlanStatus;
  is_feasible: boolean;
  validation_summary: string;
  action: string;
  reviewer: string;
  comment?: string | null;
  rejection_reason?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  review_history: any[];
}

export interface DashboardSummary {
  total_requests: number;
  pending_requests: number;
  scheduled_requests: number;
  completed_requests: number;
  overdue_requests: number;
  critical_priority_requests: number;
  high_priority_requests: number;
  total_assets: number;
  assets_unavailable: number;
  total_corridors: number;
  active_corridors: number;
  unavailable_corridors: number;
  total_trains: number;
  total_plans: number;
  draft_plans: number;
  under_review_plans: number;
  approved_plans: number;
  rejected_plans: number;
  feasible_plans: number;
  infeasible_plans: number;
}

export interface DashboardPlanningKpis {
  requests_scheduled: number;
  requests_unscheduled: number;
  total_scheduled_duration_minutes: number;
  total_conflicts: number;
  feasible_plan_percentage: number;
  average_plan_score?: number | null;
  critical_requests_scheduled: number;
  overdue_requests_scheduled: number;
  corridor_utilization_pct: number;
  asset_utilization_pct: number;
}

export interface DashboardCorridor {
  corridor_id: string;
  name: string;
  length_km: number;
  is_electrified: boolean;
  is_active: boolean;
  available_start_minute: number;
  available_end_minute: number;
  max_parallel_blocks: number;
  scheduled_blocks_count: number;
  trains_count: number;
  created_at?: string | null;
}

export interface DashboardPlanSummary {
  plan_id: string;
  title: string;
  status: string;
  is_feasible: boolean;
  overall_score?: number | null;
  selected_strategy?: string | null;
  created_at: string;
  approved_by?: string | null;
  approved_at?: string | null;
  rejection_reason?: string | null;
  items_count: number;
  violations_count: number;
}

export interface DashboardActivityItem {
  activity_type: string;
  title: string;
  description: string;
  timestamp: string;
  entity_id: string;
  actor?: string | null;
}

export interface DashboardAlertItem {
  alert_type: string;
  severity: string;
  title: string;
  message: string;
  entity_id: string;
  corridor_id?: string | null;
  created_at: string;
}

export interface CorridorAvailability {
  corridor_id: string;
  name: string;
  is_electrified: boolean;
  available_start_minute: number;
  available_end_minute: number;
  max_parallel_blocks: number;
}

export interface ApiError {
  message: string;
  status?: number;
  details?: any;
}

