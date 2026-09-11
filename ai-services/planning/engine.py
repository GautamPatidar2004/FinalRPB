from typing import Any, Dict, List, Optional
from schemas.railway import RailwayPlanningDataset
from schemas.planning import CandidatePlanBundle, PlanningLoopResult
from models.priority_model import PriorityRiskModelEngine
from planning.base import BasePlanningEngine
from planning.evaluator import PlanQualityEvaluator
from planning.candidate_generator import CandidatePlanGenerator
from planning.constraints import RailwayConstraintEngine


class PlanningEngine(BasePlanningEngine):
    """
    AI Planning Engine orchestrating the multi-candidate planning loop:
    prioritization -> candidate generation -> plan-quality evaluation -> constraint feasibility -> ranking.
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

    def run_planning_loop(
        self,
        dataset: RailwayPlanningDataset,
        top_k: int = 3,
    ) -> PlanningLoopResult:
        """
        Bounded, deterministic planning loop that selects requirements by priority,
        generates distinct candidate alternatives, evaluates plan quality,
        validates hard constraint feasibility, and retains top candidates.
        """
        # Step 1: Prioritize requirements
        scored_requests = self.priority_model.score_dataset(dataset)

        # Step 2: Generate candidate plans
        generator = CandidatePlanGenerator(dataset, scored_requests)
        raw_candidates = generator.generate_all_candidates()

        # Step 3: Evaluate each candidate for plan quality and hard constraint feasibility
        bundles: List[CandidatePlanBundle] = []
        for strategy_name, candidate_plan in raw_candidates.items():
            evaluation = self.evaluator.evaluate(candidate_plan, dataset)
            feasibility = self.constraint_engine.validate(candidate_plan, dataset)
            bundles.append(
                CandidatePlanBundle(
                    strategy_name=strategy_name,
                    plan=candidate_plan,
                    evaluation=evaluation,
                    feasibility=feasibility,
                )
            )

        # Step 4: Compare and rank candidates
        # Feasible plans strictly rank ahead of infeasible plans; tie-break by overall quality score
        bundles.sort(
            key=lambda b: (
                1 if (b.feasibility and b.feasibility.is_feasible) else 0,
                b.evaluation.overall_score,
            ),
            reverse=True,
        )
        for rank_idx, bundle in enumerate(bundles, start=1):
            bundle.rank = rank_idx

        # Step 5: Retain top_k candidates
        retained = bundles[: max(1, top_k)]
        best = retained[0] if retained else None

        return PlanningLoopResult(
            candidates=retained,
            best_candidate=best,
            total_generated=len(bundles),
        )

    def generate_plan(self, data: Dict[str, Any], context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        BasePlanningEngine contract implementation.
        Executes full optimization, constraint enforcement, and replanning loop.
        """
        try:
            from planning.optimizer import RailwayPlanOptimizer
            dataset = RailwayPlanningDataset.model_validate(data)
            optimizer = RailwayPlanOptimizer(
                priority_model=self.priority_model,
                evaluator=self.evaluator,
                constraint_engine=self.constraint_engine,
            )
            optimized_result = optimizer.optimize(dataset)
            return optimized_result.model_dump()
        except Exception:
            # Fallback for minimal non-dataset payloads
            return {"status": "unsupported_payload_structure"}
