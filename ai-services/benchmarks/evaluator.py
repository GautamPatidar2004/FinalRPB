from datetime import datetime, timezone
from pathlib import Path
import time
from typing import List, Optional

import numpy as np
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

from data.synthetic_generator import generate_synthetic_dataset
from models.features import extract_features_dataset
from models.priority_model import PriorityRiskModelEngine
from planning.optimizer import RailwayPlanOptimizer
from schemas.benchmarking import (
    EvaluationBenchmarkReport,
    ModelEvaluationMetrics,
    PipelinePerformanceBenchmark,
    PlanningQualityMetrics,
)
from schemas.railway import Priority

DEFAULT_REPORT_PATH = Path(__file__).resolve().parent / "reports" / "latest_benchmark.json"


class UnifiedPlanningEvaluator:
    """
    Unified Evaluation and Performance Benchmarking Engine.
    Evaluates ML model accuracy, planning quality factors, constraint satisfaction,
    and runtime performance on reproducible synthetic benchmarks.
    """

    def __init__(
        self,
        model_engine: Optional[PriorityRiskModelEngine] = None,
        optimizer: Optional[RailwayPlanOptimizer] = None,
    ):
        self.model_engine = model_engine or PriorityRiskModelEngine()
        self.optimizer = optimizer or RailwayPlanOptimizer(priority_model=self.model_engine)

    def evaluate_model_accuracy(self, test_seeds: List[int] = [1001, 1002, 1003], requests_per_seed: int = 40) -> ModelEvaluationMetrics:
        """Evaluates Priority/Risk prediction quality against ground-truth domain targets."""
        all_features = []
        all_targets = []

        for seed in test_seeds:
            ds = generate_synthetic_dataset(num_requests=requests_per_seed, seed=seed)
            feats, _, targets = extract_features_dataset(ds)
            all_features.extend(feats)
            all_targets.extend(targets)

        feature_names = self.model_engine.feature_names
        X = np.array([[row.get(col, 0.0) for col in feature_names] for row in all_features], dtype=np.float32)
        y_true = np.array(all_targets, dtype=np.float32)

        y_pred = self.model_engine.model.predict(X)

        mae = float(mean_absolute_error(y_true, y_pred))
        rmse = float(np.sqrt(mean_squared_error(y_true, y_pred)))
        r2 = float(r2_score(y_true, y_pred))

        return ModelEvaluationMetrics(
            mae=round(mae, 3),
            rmse=round(rmse, 3),
            r2_score=round(r2, 3),
            samples_evaluated=len(all_targets),
        )

    def run_benchmark(
        self,
        dataset_seeds: List[int] = [701, 702, 703, 704],
        requests_per_dataset: int = 15,
    ) -> EvaluationBenchmarkReport:
        """Executes unified end-to-end benchmark across datasets."""
        start_wall_time = time.perf_counter()

        # 1. Evaluate Model Quality
        model_metrics = self.evaluate_model_accuracy()

        # 2. Benchmark Planning Engine Quality and Performance
        total_requests = 0
        total_scheduled = 0
        total_critical_high = 0
        scheduled_critical_high = 0
        total_unresolved = 0
        night_shadow_blocks = 0
        total_violations = 0
        overall_scores = []
        planning_times_ms = []
        candidates_count = 0
        replanning_count = 0
        feasible_runs = 0

        for seed in dataset_seeds:
            ds = generate_synthetic_dataset(num_requests=requests_per_dataset, seed=seed)
            total_requests += len(ds.block_requests)

            # Measure pure planning & optimization execution time
            t0 = time.perf_counter()
            opt_result = self.optimizer.optimize(ds)
            t_elapsed_ms = (time.perf_counter() - t0) * 1000.0
            planning_times_ms.append(t_elapsed_ms)

            if opt_result.is_feasible:
                feasible_runs += 1

            total_violations += opt_result.feasibility.total_hard_violations
            overall_scores.append(opt_result.evaluation.overall_score)
            candidates_count += len(opt_result.candidates)
            if opt_result.replanning_applied:
                replanning_count += 1

            total_unresolved += len(opt_result.unresolved_requirements)

            # Analyze scheduled blocks
            scheduled_ids = {p.request_id for p in opt_result.plan if p.status == "SCHEDULED"}
            total_scheduled += len(scheduled_ids)

            scored = self.model_engine.score_dataset(ds)
            for s in scored:
                if s.priority_category in (Priority.CRITICAL, Priority.HIGH):
                    total_critical_high += 1
                    if s.request_id in scheduled_ids:
                        scheduled_critical_high += 1

            for p in opt_result.plan:
                if p.status == "SCHEDULED" and p.scheduled_start_minute >= 60 and p.scheduled_end_minute <= 360:
                    night_shadow_blocks += 1

        total_runtime_seconds = time.perf_counter() - start_wall_time
        num_datasets = len(dataset_seeds)

        feasible_rate_pct = round((feasible_runs / num_datasets) * 100.0, 2)
        critical_high_cov_pct = round(
            (scheduled_critical_high / total_critical_high * 100.0) if total_critical_high > 0 else 100.0,
            2,
        )
        unresolved_rate_pct = round((total_unresolved / total_requests) * 100.0, 2)
        night_shadow_pct = round((night_shadow_blocks / max(1, total_scheduled)) * 100.0, 2)

        planning_metrics = PlanningQualityMetrics(
            mean_overall_score=round(float(np.mean(overall_scores)), 2),
            feasible_plan_rate_pct=feasible_rate_pct,
            high_priority_coverage_pct=critical_high_cov_pct,
            unresolved_requirement_rate_pct=unresolved_rate_pct,
            night_shadow_utilization_pct=night_shadow_pct,
            total_hard_violations=total_violations,
        )

        performance_benchmark = PipelinePerformanceBenchmark(
            total_runtime_seconds=round(total_runtime_seconds, 3),
            mean_planning_time_ms=round(float(np.mean(planning_times_ms)), 2),
            datasets_evaluated=num_datasets,
            total_requests_processed=total_requests,
            candidates_evaluated_count=candidates_count,
            replanning_occurred_count=replanning_count,
            successful_plan_generation_rate_pct=feasible_rate_pct,
        )

        report = EvaluationBenchmarkReport(
            timestamp=datetime.now(timezone.utc).isoformat(),
            model_metrics=model_metrics,
            planning_metrics=planning_metrics,
            performance_benchmark=performance_benchmark,
        )

        return report

    def save_report(self, report: EvaluationBenchmarkReport, filepath: Optional[Path] = None):
        out_path = filepath or DEFAULT_REPORT_PATH
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(report.model_dump_json(indent=2))
        return out_path
