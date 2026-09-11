from typing import Any, Dict, List, Optional
from schemas.railway import (
    Department,
    GeneratedBlockPlanRecord,
    MaintenanceBlockRequest,
    Priority,
    PriorityScoreResult,
    RailwayPlanningDataset,
)
from schemas.evaluation import PlanEvaluationResult
from schemas.constraints import PlanFeasibilityResult
from schemas.optimization import (
    DecisionLogRecord,
    OptimizedPlanResult,
    UnresolvedRequirementReport,
)
from models.priority_model import PriorityRiskModelEngine
from planning.evaluator import PlanQualityEvaluator
from planning.constraints import RailwayConstraintEngine
from planning.candidate_generator import CandidatePlanGenerator


class RailwayPlanOptimizer:
    """
    Plan Optimization and Automatic Replanning Engine.
    Evaluates candidate plans, balances priority, operational disruption, duration,
    enforces hard constraints, and triggers bounded local replanning/swapping
    when high-priority requirements cannot fit.
    """

    def __init__(
        self,
        priority_model: Optional[PriorityRiskModelEngine] = None,
        evaluator: Optional[PlanQualityEvaluator] = None,
        constraint_engine: Optional[RailwayConstraintEngine] = None,
    ):
        self.priority_model = priority_model or PriorityRiskModelEngine()
        self.evaluator = evaluator or PlanQualityEvaluator(priority_model=self.priority_model)
        self.constraint_engine = constraint_engine or RailwayConstraintEngine()

    def optimize(self, dataset: RailwayPlanningDataset) -> OptimizedPlanResult:
        # 1. Score all requirements by priority/risk
        scored_requests = self.priority_model.score_dataset(dataset)
        score_map: Dict[str, PriorityScoreResult] = {s.request_id: s for s in scored_requests}
        req_map: Dict[str, MaintenanceBlockRequest] = {r.request_id: r for r in dataset.block_requests}

        # 2. Generate candidate plans from all strategies
        generator = CandidatePlanGenerator(dataset, scored_requests)
        candidates = generator.generate_all_candidates()

        # 3. Evaluate each candidate for feasibility and quality
        evaluated_candidates = []
        for strategy_name, candidate_plan in candidates.items():
            feasibility = self.constraint_engine.validate(candidate_plan, dataset)
            evaluation = self.evaluator.evaluate(candidate_plan, dataset)
            evaluated_candidates.append({
                "strategy": strategy_name,
                "plan": candidate_plan,
                "feasibility": feasibility,
                "evaluation": evaluation,
            })

        # 4. Select best initial baseline candidate
        # Sort: feasible first, then by highest overall score
        evaluated_candidates.sort(
            key=lambda c: (1 if c["feasibility"].is_feasible else 0, c["evaluation"].overall_score),
            reverse=True,
        )
        selected_candidate = evaluated_candidates[0]

        current_plan: List[GeneratedBlockPlanRecord] = [p.model_copy() for p in selected_candidate["plan"]]
        selected_strategy = selected_candidate["strategy"]
        replanning_applied = False
        decision_log: List[DecisionLogRecord] = []
        unresolved_reports: List[UnresolvedRequirementReport] = []

        # 5. Check if Automatic Replanning is required
        # Triggered if:
        # a) Plan has hard constraint violations
        # b) Any CRITICAL or HIGH priority requirement is unscheduled (status != "SCHEDULED")
        unscheduled_high_priority = [
            s for s in scored_requests
            if s.priority_category in (Priority.CRITICAL, Priority.HIGH)
            and not any(p.request_id == s.request_id and p.status == "SCHEDULED" for p in current_plan)
        ]

        needs_replanning = (not selected_candidate["feasibility"].is_feasible) or len(unscheduled_high_priority) > 0

        if needs_replanning:
            replanning_applied = True
            current_plan, decision_log, unresolved_reports = self._replan_unresolved_requirements(
                current_plan=current_plan,
                dataset=dataset,
                scored_requests=scored_requests,
                score_map=score_map,
                req_map=req_map,
            )
        else:
            # Build initial decision logs for clean plan
            for p in current_plan:
                s = score_map.get(p.request_id)
                cat = s.priority_category if s else Priority.MEDIUM
                decision_log.append(
                    DecisionLogRecord(
                        decision_type=p.status,
                        request_id=p.request_id,
                        plan_id=p.plan_id,
                        priority_category=cat,
                        rationale=f"Scheduled via {selected_strategy} in slot [{p.scheduled_start_minute}, {p.scheduled_end_minute}]."
                        if p.status == "SCHEDULED" else "Deferred due to window constraints.",
                    )
                )

        # 6. Final re-validation and re-evaluation
        final_feasibility = self.constraint_engine.validate(current_plan, dataset)
        final_evaluation = self.evaluator.evaluate(current_plan, dataset)

        plan_id = f"OPT-PLAN-{dataset.block_requests[0].request_id if dataset.block_requests else 'EMPTY'}"

        from schemas.planning import CandidatePlanBundle

        candidate_bundles = [
            CandidatePlanBundle(
                strategy_name=c["strategy"],
                plan=c["plan"],
                evaluation=c["evaluation"],
                feasibility=c["feasibility"],
                rank=idx,
            )
            for idx, c in enumerate(evaluated_candidates, start=1)
        ]

        best_bundle = CandidatePlanBundle(
            strategy_name=f"{selected_strategy}+replanned" if replanning_applied else selected_strategy,
            plan=current_plan,
            evaluation=final_evaluation,
            feasibility=final_feasibility,
            rank=1,
        )

        return OptimizedPlanResult(
            plan_id=plan_id,
            selected_strategy=f"{selected_strategy}+replanned" if replanning_applied else selected_strategy,
            is_feasible=final_feasibility.is_feasible,
            plan=current_plan,
            evaluation=final_evaluation,
            feasibility=final_feasibility,
            decision_log=decision_log,
            unresolved_requirements=unresolved_reports,
            replanning_applied=replanning_applied,
            candidates=candidate_bundles,
            best_candidate=best_bundle,
            metrics={
                "initial_strategy": selected_strategy,
                "initial_score": selected_candidate["evaluation"].overall_score,
                "final_score": final_evaluation.overall_score,
                "replanning_applied": replanning_applied,
                "unresolved_count": len(unresolved_reports),
            },
        )

    def _replan_unresolved_requirements(
        self,
        current_plan: List[GeneratedBlockPlanRecord],
        dataset: RailwayPlanningDataset,
        scored_requests: List[PriorityScoreResult],
        score_map: Dict[str, PriorityScoreResult],
        req_map: Dict[str, MaintenanceBlockRequest],
    ) -> tuple[List[GeneratedBlockPlanRecord], List[DecisionLogRecord], List[UnresolvedRequirementReport]]:
        """
        Bounded, deterministic replanning algorithm.
        Attempts time-shifting and priority displacement/swapping to resolve
        infeasible or unscheduled high-priority requirements.
        """
        plan_by_req: Dict[str, GeneratedBlockPlanRecord] = {p.request_id: p for p in current_plan}
        decision_log: List[DecisionLogRecord] = []
        unresolved_reports: List[UnresolvedRequirementReport] = []

        # Remove invalid/violating block allocations first to restore constraint cleanliness
        initial_feasibility = self.constraint_engine.validate(current_plan, dataset)
        violating_req_ids = {v.request_id for v in initial_feasibility.violations if v.request_id}
        for v_req_id in violating_req_ids:
            if v_req_id in plan_by_req:
                plan_by_req[v_req_id].status = "DEFERRED"

        # Iterate through all requests in strict descending priority
        for req_score in scored_requests:
            req_id = req_score.request_id
            req = req_map.get(req_id)
            if not req:
                continue

            current_record = plan_by_req.get(req_id)
            if current_record and current_record.status == "SCHEDULED":
                decision_log.append(
                    DecisionLogRecord(
                        decision_type="SCHEDULED",
                        request_id=req_id,
                        plan_id=current_record.plan_id,
                        priority_category=req_score.priority_category,
                        rationale=f"Preserved valid schedule in window [{current_record.scheduled_start_minute}, {current_record.scheduled_end_minute}].",
                    )
                )
                continue

            # Need to find a feasible slot for req
            duration = req.required_duration_minutes
            corridor = next((c for c in dataset.corridors if c.corridor_id == req.corridor_id), None)
            if not corridor:
                continue

            step_size = 15  # 15-minute search resolution
            min_bound = max(req.earliest_start_minute, corridor.available_start_minute)
            max_bound = min(req.latest_end_minute, corridor.available_end_minute) - duration

            found_slot = None
            # 1. Bounded slot search
            for start_t in range(min_bound, max(min_bound, max_bound + 1), step_size):
                end_t = start_t + duration
                test_record = GeneratedBlockPlanRecord(
                    plan_id=f"REPLAN-{req_id}",
                    request_id=req_id,
                    corridor_id=req.corridor_id,
                    asset_id=req.asset_id,
                    department=req.department,
                    scheduled_start_minute=start_t,
                    scheduled_end_minute=end_t,
                    allocated_duration_minutes=duration,
                    status="SCHEDULED",
                )

                # Form trial plan with active scheduled blocks
                trial_plan = [p for p in plan_by_req.values() if p.status == "SCHEDULED" and p.request_id != req_id] + [test_record]
                feas = self.constraint_engine.validate(trial_plan, dataset)
                if feas.is_feasible:
                    found_slot = (start_t, end_t)
                    break

            if found_slot:
                plan_by_req[req_id] = GeneratedBlockPlanRecord(
                    plan_id=f"OPT-{req_id}",
                    request_id=req_id,
                    corridor_id=req.corridor_id,
                    asset_id=req.asset_id,
                    department=req.department,
                    scheduled_start_minute=found_slot[0],
                    scheduled_end_minute=found_slot[1],
                    allocated_duration_minutes=duration,
                    status="SCHEDULED",
                )
                decision_log.append(
                    DecisionLogRecord(
                        decision_type="REPLANNED",
                        request_id=req_id,
                        plan_id=f"OPT-{req_id}",
                        priority_category=req_score.priority_category,
                        rationale=f"Replanned to conflict-free slot [{found_slot[0]}, {found_slot[1]}] on corridor {req.corridor_id}.",
                    )
                )
            else:
                # 2. Priority displacement/swapping if this requirement is CRITICAL
                swapped = False
                if req_score.priority_category in (Priority.CRITICAL, Priority.HIGH):
                    # Find lower priority blocks on same corridor to displace
                    lower_priority_blocks = [
                        p for p in plan_by_req.values()
                        if p.status == "SCHEDULED" and p.corridor_id == req.corridor_id
                        and score_map.get(p.request_id) and score_map[p.request_id].priority_score < req_score.priority_score
                    ]
                    # Sort lower priority ascending (displace lowest first)
                    lower_priority_blocks.sort(key=lambda p: score_map[p.request_id].priority_score)

                    for disp_block in lower_priority_blocks:
                        disp_req = req_map[disp_block.request_id]
                        # Try placing req in disp_block's slot if fits window
                        t_start = max(req.earliest_start_minute, disp_block.scheduled_start_minute)
                        t_end = t_start + duration
                        if t_end <= req.latest_end_minute:
                            trial_rec = GeneratedBlockPlanRecord(
                                plan_id=f"SWAP-{req_id}",
                                request_id=req_id,
                                corridor_id=req.corridor_id,
                                asset_id=req.asset_id,
                                department=req.department,
                                scheduled_start_minute=t_start,
                                scheduled_end_minute=t_end,
                                allocated_duration_minutes=duration,
                                status="SCHEDULED",
                            )
                            trial_plan = [
                                p for p in plan_by_req.values()
                                if p.status == "SCHEDULED" and p.request_id not in (req_id, disp_block.request_id)
                            ] + [trial_rec]
                            if self.constraint_engine.validate(trial_plan, dataset).is_feasible:
                                # Execute swap!
                                plan_by_req[req_id] = trial_rec
                                plan_by_req[disp_block.request_id].status = "DEFERRED"
                                decision_log.append(
                                    DecisionLogRecord(
                                        decision_type="SWAPPED",
                                        request_id=req_id,
                                        plan_id=trial_rec.plan_id,
                                        priority_category=req_score.priority_category,
                                        rationale=f"Displaced lower-priority request {disp_block.request_id} to schedule higher-priority requirement.",
                                    )
                                )
                                decision_log.append(
                                    DecisionLogRecord(
                                        decision_type="DEFERRED",
                                        request_id=disp_block.request_id,
                                        plan_id=disp_block.plan_id,
                                        priority_category=score_map[disp_block.request_id].priority_category,
                                        rationale=f"Deferred to prioritize safety-critical request {req_id}.",
                                    )
                                )
                                swapped = True
                                break

                if not swapped:
                    plan_by_req[req_id] = GeneratedBlockPlanRecord(
                        plan_id=f"DEF-{req_id}",
                        request_id=req_id,
                        corridor_id=req.corridor_id,
                        asset_id=req.asset_id,
                        department=req.department,
                        scheduled_start_minute=0,
                        scheduled_end_minute=0,
                        allocated_duration_minutes=0,
                        status="DEFERRED",
                        conflict_flags=["UNRESOLVABLE_CONFLICT"],
                    )
                    decision_log.append(
                        DecisionLogRecord(
                            decision_type="DEFERRED",
                            request_id=req_id,
                            priority_category=req_score.priority_category,
                            rationale="No feasible corridor window could be found without hard constraint violations.",
                        )
                    )
                    if req_score.priority_category in (Priority.CRITICAL, Priority.HIGH):
                        unresolved_reports.append(
                            UnresolvedRequirementReport(
                                request_id=req_id,
                                priority_category=req_score.priority_category,
                                priority_score=req_score.priority_score,
                                reasons=[
                                    f"Available corridor operating window saturated.",
                                    f"Train traffic and higher-priority maintenance prevent {duration}m block allocation.",
                                ],
                                attempted_strategies=["bounded_slot_search", "priority_swapping"],
                            )
                        )

        final_plan = list(plan_by_req.values())
        return final_plan, decision_log, unresolved_reports
