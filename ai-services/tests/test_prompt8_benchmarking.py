import json
import sys
from pathlib import Path

SERVICE_ROOT = Path(__file__).resolve().parent.parent
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

from benchmarks.evaluator import UnifiedPlanningEvaluator, DEFAULT_REPORT_PATH
from schemas.benchmarking import EvaluationBenchmarkReport


def test_model_evaluation_metrics():
    evaluator = UnifiedPlanningEvaluator()
    metrics = evaluator.evaluate_model_accuracy(test_seeds=[801, 802], requests_per_seed=30)

    assert metrics.samples_evaluated == 60
    assert metrics.r2_score > 0.85, f"Expected R^2 > 0.85, got {metrics.r2_score}"
    assert metrics.mae < 5.0, f"Expected MAE < 5.0, got {metrics.mae}"
    assert metrics.rmse < 7.5, f"Expected RMSE < 7.5, got {metrics.rmse}"
    print(f"[PASS] Model accuracy benchmark check: R^2={metrics.r2_score:.3f}, MAE={metrics.mae:.2f}")


def test_planning_quality_and_performance_benchmark(tmp_path: Path = None):
    evaluator = UnifiedPlanningEvaluator()
    report = evaluator.run_benchmark(dataset_seeds=[811, 812], requests_per_dataset=10)

    assert isinstance(report, EvaluationBenchmarkReport)

    # 1. Quality metrics check
    p_metrics = report.planning_metrics
    assert p_metrics.feasible_plan_rate_pct == 100.0, "All final optimized plans must be feasible"
    assert p_metrics.total_hard_violations == 0, "Zero hard violations allowed in final plans"
    assert p_metrics.high_priority_coverage_pct > 0.0, "Must achieve positive high priority coverage"
    assert p_metrics.mean_overall_score > 50.0, f"Expected mean quality score > 50.0, got {p_metrics.mean_overall_score}"

    # 2. Performance benchmark metrics check
    perf = report.performance_benchmark
    assert perf.datasets_evaluated == 2
    assert perf.total_requests_processed == 20
    assert perf.mean_planning_time_ms > 0.0
    assert perf.successful_plan_generation_rate_pct == 100.0
    assert perf.candidates_evaluated_count > 0

    # 3. Machine-readable persistence check
    test_out = SERVICE_ROOT / "benchmarks" / "reports" / "test_benchmark.json"
    saved_path = evaluator.save_report(report, filepath=test_out)
    assert saved_path.exists()

    with open(saved_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    # Verify reloadable into schema
    loaded_report = EvaluationBenchmarkReport.model_validate(data)
    assert loaded_report.planning_metrics.feasible_plan_rate_pct == report.planning_metrics.feasible_plan_rate_pct

    # Cleanup test output
    if test_out.exists():
        test_out.unlink()

    print(f"[PASS] Planning quality & performance benchmark check (Mean Time: {perf.mean_planning_time_ms:.1f}ms, Score: {p_metrics.mean_overall_score:.1f})")


if __name__ == "__main__":
    test_model_evaluation_metrics()
    test_planning_quality_and_performance_benchmark()
    print("All Prompt 8 checks passed successfully.")
