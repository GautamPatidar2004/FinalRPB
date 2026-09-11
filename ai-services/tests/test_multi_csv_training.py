import sys
from pathlib import Path

SERVICE_ROOT = Path(__file__).resolve().parent.parent
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

import pytest
import numpy as np
from data.csv_handler import (
    discover_and_load_training_csvs,
    export_training_dataset_csv,
    TRAINING_DATA_DIR,
)
from data.synthetic_generator import generate_synthetic_dataset
from models.train import train_priority_model, MODEL_PATH
from models.priority_model import PriorityRiskModelEngine
from schemas.railway import RailwayPlanningDataset


def test_multiple_csv_discovery_and_merge(tmp_path: Path):
    """Verify multiple valid CSVs are discovered, merged, and non-CSVs/unrelated are ignored."""
    # 1. Create two valid training CSVs with different seeds
    csv_1 = tmp_path / "seed_1.csv"
    csv_2 = tmp_path / "seed_2.csv"
    non_csv = tmp_path / "notes.txt"
    unrelated_csv = tmp_path / "unrelated_metrics.csv"

    # Export seed 1 (100 requests)
    ds1 = generate_synthetic_dataset(num_requests=100, seed=101)
    export_training_dataset_csv(csv_1, dataset=ds1)

    # Export seed 2 (120 requests)
    ds2 = generate_synthetic_dataset(num_requests=120, seed=202)
    export_training_dataset_csv(csv_2, dataset=ds2)

    # Write dummy non-CSV and unrelated CSV (missing required columns)
    non_csv.write_text("this is a text note", encoding="utf-8")
    unrelated_csv.write_text("col_a,col_b\n1,2\n3,4", encoding="utf-8")

    X, y, feature_names, summary = discover_and_load_training_csvs(data_dir=tmp_path, seed=42)

    assert summary["num_csv_files"] == 2
    assert "seed_1.csv" in summary["csv_filenames"]
    assert "seed_2.csv" in summary["csv_filenames"]
    assert any(s[0] == "unrelated_metrics.csv" for s in summary["skipped_files"])
    assert len(y) == 220
    assert X.shape == (220, len(feature_names))


def test_deduplication_and_deterministic_shuffle(tmp_path: Path):
    """Verify identical records across files are safely deduplicated and shuffle is deterministic."""
    csv_a = tmp_path / "batch_a.csv"
    csv_b = tmp_path / "batch_b.csv"

    # Same dataset in both files (100% duplicate)
    ds = generate_synthetic_dataset(num_requests=50, seed=303)
    export_training_dataset_csv(csv_a, dataset=ds)
    export_training_dataset_csv(csv_b, dataset=ds)

    X1, y1, feat1, sum1 = discover_and_load_training_csvs(data_dir=tmp_path, seed=42)
    assert sum1["total_records_merged"] == 50
    assert sum1["duplicates_removed"] == 50

    # Determinism test: same seed produces identical arrays
    X2, y2, feat2, sum2 = discover_and_load_training_csvs(data_dir=tmp_path, seed=42)
    np.testing.assert_array_equal(X1, X2)
    np.testing.assert_array_equal(y1, y2)


def test_end_to_end_multi_csv_training_and_inference(tmp_path: Path):
    """Verify training on multi-CSV produces single valid priority_model.joblib usable by inference."""
    csv_1 = tmp_path / "data_part1.csv"
    csv_2 = tmp_path / "data_part2.csv"

    ds1 = generate_synthetic_dataset(num_requests=80, seed=401)
    ds2 = generate_synthetic_dataset(num_requests=80, seed=402)
    export_training_dataset_csv(csv_1, dataset=ds1)
    export_training_dataset_csv(csv_2, dataset=ds2)

    metrics = train_priority_model(data_dir=tmp_path, seed=42)
    assert MODEL_PATH.exists()
    assert "mae" in metrics and "r2" in metrics
    assert metrics["r2"] > 0.85

    # Test inference pipeline with newly trained model
    engine = PriorityRiskModelEngine()
    test_ds = generate_synthetic_dataset(num_requests=10, seed=999)
    scores = engine.score_dataset(test_ds)
    assert len(scores) == 10
    assert all(0.0 <= s.priority_score <= 100.0 for s in scores)
