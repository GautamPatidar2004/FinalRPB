from typing import Any, Dict, List, Optional
from schemas.railway import (
    Department,
    Priority,
    GeneratedBlockPlanRecord,
    RailwayPlanningDataset,
    MaintenanceBlockRequest,
)
from schemas.evaluation import EvaluationWeights, FactorScores, PlanEvaluationResult
from models.priority_model import PriorityRiskModelEngine


class PlanQualityEvaluator:
    """
    Railway-specific plan quality evaluator.
    Computes measurable factor scores, penalties, and overall score for candidate plans.
    """

    def __init__(
        self,
        weights: Optional[EvaluationWeights] = None,
        priority_model: Optional[PriorityRiskModelEngine] = None,
    ):
        self.weights = weights or EvaluationWeights()
        self.priority_model = priority_model or PriorityRiskModelEngine()

    def evaluate(
        self,
        candidate_plan: List[GeneratedBlockPlanRecord],
        dataset: RailwayPlanningDataset,
    ) -> PlanEvaluationResult:
        strengths: List[str] = []
        penalties: List[str] = []

        # Index dataset requests and corridors for fast lookup
        req_map: Dict[str, MaintenanceBlockRequest] = {r.request_id: r for r in dataset.block_requests}
        corridor_map = {c.corridor_id: c for c in dataset.corridors}

        # 1. High-Priority Maintenance Coverage & Unresolved High-Risk Penalties
        scored_requests = self.priority_model.score_dataset(dataset)
        total_priority_points = sum(s.priority_score for s in scored_requests) or 1.0
        scheduled_priority_points = 0.0
        scheduled_req_ids = {p.request_id for p in candidate_plan if p.status == "SCHEDULED"}

        unscheduled_critical = 0
        unscheduled_high = 0

        for req_score in scored_requests:
            if req_score.request_id in scheduled_req_ids:
                scheduled_priority_points += req_score.priority_score
            else:
                if req_score.priority_category == Priority.CRITICAL:
                    unscheduled_critical += 1
                    penalties.append(f"Unscheduled CRITICAL request {req_score.request_id} (Score: {req_score.priority_score:.1f})")
                elif req_score.priority_category == Priority.HIGH:
                    unscheduled_high += 1

        coverage_ratio = scheduled_priority_points / total_priority_points
        priority_coverage_score = round(min(100.0, coverage_ratio * 100.0), 2)

        # Unresolved Risk Score: penalizes leaving safety-critical / high-risk blocks unattended
        unresolved_risk_deduction = (unscheduled_critical * 25.0) + (unscheduled_high * 10.0)
        unresolved_risk_score = round(max(0.0, 100.0 - unresolved_risk_deduction), 2)

        if unscheduled_critical == 0 and any(s.priority_category == Priority.CRITICAL for s in scored_requests):
            strengths.append("100% of CRITICAL priority maintenance requirements are scheduled.")
        if coverage_ratio >= 0.80:
            strengths.append(f"High overall priority coverage: {priority_coverage_score:.1f}%")

        # 2. Train and Corridor Conflicts
        train_conflicts = 0
        corridor_overload_conflicts = 0
        max_concurrent = dataset.constraints.max_concurrent_blocks_per_corridor

        # Check train conflicts
        for plan_item in candidate_plan:
            if plan_item.status != "SCHEDULED":
                continue
            req = req_map.get(plan_item.request_id)
            if not req or not req.is_traffic_block_required:
                continue

            for train in dataset.trains:
                if train.corridor_id == plan_item.corridor_id:
                    # Direct time overlap on traffic block corridor
                    if not (train.exit_minute <= plan_item.scheduled_start_minute or train.entry_minute >= plan_item.scheduled_end_minute):
                        train_conflicts += 1
                        penalties.append(
                            f"Train conflict on corridor {plan_item.corridor_id}: Block {plan_item.plan_id} overlaps Train {train.train_id} ({train.train_type})"
                        )

        # Check concurrent blocks on same corridor
        corridor_scheduled = {}
        for plan_item in candidate_plan:
            if plan_item.status == "SCHEDULED":
                corridor_scheduled.setdefault(plan_item.corridor_id, []).append(plan_item)

        for c_id, blocks in corridor_scheduled.items():
            for i in range(len(blocks)):
                overlap_count = 1
                for j in range(len(blocks)):
                    if i != j:
                        if not (blocks[j].scheduled_end_minute <= blocks[i].scheduled_start_minute or blocks[j].scheduled_start_minute >= blocks[i].scheduled_end_minute):
                            overlap_count += 1
                if overlap_count > max_concurrent:
                    corridor_overload_conflicts += 1
                    penalties.append(f"Corridor {c_id} exceeds max concurrent blocks ({overlap_count} > {max_concurrent})")
                    break

        conflict_penalty = (train_conflicts * 20.0) + (corridor_overload_conflicts * 25.0)
        conflict_free_score = round(max(0.0, 100.0 - conflict_penalty), 2)

        if train_conflicts == 0 and len(scheduled_req_ids) > 0:
            strengths.append("Zero train-block conflicts detected.")

        # 3. Operational Disruption (Peak Passenger Hours vs Night Shadow)
        # Peak passenger hours: 08:00-11:00 (480-660) and 17:00-20:00 (1020-1200)
        peak_overlaps = 0
        night_shadow_count = 0

        for plan_item in candidate_plan:
            if plan_item.status != "SCHEDULED":
                continue
            s_start = plan_item.scheduled_start_minute
            s_end = plan_item.scheduled_end_minute

            # Check peak hour overlap
            if not (s_end <= 480 or s_start >= 660) or not (s_end <= 1020 or s_start >= 1200):
                peak_overlaps += 1

            # Check night shadow window (60 to 360)
            if s_start >= 60 and s_end <= 360:
                night_shadow_count += 1

        total_scheduled = len(scheduled_req_ids) or 1
        peak_penalty_rate = (peak_overlaps / total_scheduled) * 40.0
        operational_disruption_score = round(max(0.0, 100.0 - peak_penalty_rate), 2)

        if night_shadow_count > 0:
            strengths.append(f"{night_shadow_count} blocks placed in low-disruption night shadow window (01:00 - 06:00).")
        if peak_overlaps > 0:
            penalties.append(f"{peak_overlaps} blocks scheduled during peak passenger traffic hours.")

        # 4. Window and Corridor Availability Utilization
        corridor_boundary_violations = 0
        for plan_item in candidate_plan:
            if plan_item.status != "SCHEDULED":
                continue
            corridor = corridor_map.get(plan_item.corridor_id)
            if corridor:
                if plan_item.scheduled_start_minute < corridor.available_start_minute or plan_item.scheduled_end_minute > corridor.available_end_minute:
                    corridor_boundary_violations += 1
                    penalties.append(f"Block {plan_item.plan_id} exceeds available corridor window for {corridor.corridor_id}")

        window_utilization_score = round(max(0.0, 100.0 - (corridor_boundary_violations * 30.0)), 2)

        # 5. Duration Efficiency
        duration_mismatches = 0
        for plan_item in candidate_plan:
            if plan_item.status != "SCHEDULED":
                continue
            req = req_map.get(plan_item.request_id)
            if req:
                if plan_item.allocated_duration_minutes < req.required_duration_minutes:
                    duration_mismatches += 1
                    penalties.append(f"Under-allocated duration for {plan_item.request_id}: {plan_item.allocated_duration_minutes}m < required {req.required_duration_minutes}m")
                elif plan_item.allocated_duration_minutes > req.required_duration_minutes + 30:
                    duration_mismatches += 0.5

        duration_efficiency_score = round(max(0.0, 100.0 - (duration_mismatches * 15.0)), 2)
        if duration_mismatches == 0 and total_scheduled > 0:
            strengths.append("All scheduled blocks fulfill 100% of required maintenance durations without excess downtime.")

        # 6. Overall Weighted Quality Score
        factor_scores = FactorScores(
            priority_coverage=priority_coverage_score,
            unresolved_risk_score=unresolved_risk_score,
            conflict_free_score=conflict_free_score,
            operational_disruption_score=operational_disruption_score,
            window_utilization=window_utilization_score,
            duration_efficiency=duration_efficiency_score,
        )

        overall = (
            (self.weights.priority_coverage_weight * priority_coverage_score)
            + (self.weights.unresolved_risk_weight * unresolved_risk_score)
            + (self.weights.conflict_penalty_weight * conflict_free_score)
            + (self.weights.operational_disruption_weight * operational_disruption_score)
            + (self.weights.window_utilization_weight * window_utilization_score)
            + (self.weights.duration_efficiency_weight * duration_efficiency_score)
        )
        overall_score = round(min(100.0, max(0.0, overall)), 2)

        metrics = {
            "total_requests": len(dataset.block_requests),
            "scheduled_requests": len(scheduled_req_ids),
            "train_conflicts": train_conflicts,
            "corridor_overload_conflicts": corridor_overload_conflicts,
            "unscheduled_critical": unscheduled_critical,
            "unscheduled_high": unscheduled_high,
            "peak_traffic_overlaps": peak_overlaps,
            "night_shadow_placements": night_shadow_count,
        }

        return PlanEvaluationResult(
            overall_score=overall_score,
            factor_scores=factor_scores,
            strengths=strengths,
            penalties=penalties,
            metrics=metrics,
        )


def evaluate_candidate_plan(
    candidate_plan: List[GeneratedBlockPlanRecord],
    dataset: RailwayPlanningDataset,
    weights: Optional[EvaluationWeights] = None,
) -> PlanEvaluationResult:
    """Convenience functional interface for plan quality evaluation."""
    evaluator = PlanQualityEvaluator(weights=weights)
    return evaluator.evaluate(candidate_plan, dataset)
