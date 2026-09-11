import sys
from pathlib import Path

SERVICE_ROOT = Path(__file__).resolve().parent.parent
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

from benchmarks.evaluator import UnifiedPlanningEvaluator, DEFAULT_REPORT_PATH


def main():
    print("=== Running Railway AI Planning Pipeline Benchmark ===")
    evaluator = UnifiedPlanningEvaluator()
    report = evaluator.run_benchmark()

    out_file = evaluator.save_report(report)
    print(f"\n[Benchmark Complete] Report saved to: {out_file}")
    print(f"- Model R^2: {report.model_metrics.r2_score:.3f} (MAE: {report.model_metrics.mae:.2f})")
    print(f"- Planning Mean Quality Score: {report.planning_metrics.mean_overall_score:.1f}")
    print(f"- Feasible Plan Rate: {report.planning_metrics.feasible_plan_rate_pct:.1f}%")
    print(f"- High-Priority Coverage: {report.planning_metrics.high_priority_coverage_pct:.1f}%")
    print(f"- Mean Planning Time: {report.performance_benchmark.mean_planning_time_ms:.1f}ms")
    print(f"- Total Runtime: {report.performance_benchmark.total_runtime_seconds:.2f}s")


if __name__ == "__main__":
    main()
