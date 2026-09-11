import argparse
import os
import sys
from pathlib import Path
from typing import Any, Dict, Optional

# Ensure ai-services root is in sys.path
SERVICE_ROOT = Path(__file__).resolve().parent.parent
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

import joblib
import numpy as np
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split

from config.settings import settings
from data.csv_handler import (
    DEFAULT_TRAINING_CSV,
    TRAINING_DATA_DIR,
    discover_and_load_training_csvs,
    load_and_validate_training_csv,
    export_training_dataset_csv,
)

MODEL_PATH = settings.resolved_model_path
ARTIFACTS_DIR = MODEL_PATH.parent


def train_priority_model(
    csv_path: Optional[Path] = None,
    data_dir: Optional[Path] = None,
    seed: int = 42,
) -> Dict[str, Any]:
    """
    End-to-End Multi-CSV Training Pipeline:
    discover valid CSVs in data_dir (or explicit csv_path) -> validate -> merge & deduplicate
    -> deterministic shuffle -> train/val split -> train -> evaluate -> save single model artifact.
    """
    target_dir = data_dir or settings.resolved_training_csv_path.parent
    explicit_file = csv_path

    # If explicit file specified, ensure it exists (create template if default missing)
    if explicit_file and not explicit_file.exists():
        if explicit_file == settings.resolved_training_csv_path:
            print(f"[Training] Training CSV not found at '{explicit_file}'. Generating baseline template...")
            export_training_dataset_csv(explicit_file)
        else:
            raise FileNotFoundError(f"Specified training CSV not found: {explicit_file}")

    print(f"[Training] Discovering and combining training data from: {explicit_file or target_dir}")
    X, y, feature_names, summary = discover_and_load_training_csvs(
        data_dir=target_dir,
        explicit_csv=explicit_file,
        seed=seed,
    )

    print(f"[Training Data Report]")
    print(f"  * CSV files used: {summary['num_csv_files']} ({', '.join(summary['csv_filenames'])})")
    if summary.get("skipped_files"):
        for sname, sreason in summary["skipped_files"]:
            print(f"  * Skipped non-training/incompatible file: {sname} ({sreason})")
    print(f"  * Total records after merge: {summary['total_records_merged']}")
    print(f"  * Records removed as duplicates: {summary['duplicates_removed']}")

    # Train/Validation Split
    X_train, X_val, y_train, y_val = train_test_split(
        X, y, test_size=0.2, random_state=seed
    )
    print(f"  * Train/Validation split: train={len(y_train)}, val={len(y_val)}")

    # Model Training
    print(f"[Training] Fitting Priority/Risk model (samples: train={len(y_train)}, val={len(y_val)})...")
    model = GradientBoostingRegressor(
        n_estimators=60,
        max_depth=4,
        learning_rate=0.1,
        random_state=seed,
    )
    model.fit(X_train, y_train)

    # Evaluation
    val_preds = model.predict(X_val)
    mae = float(mean_absolute_error(y_val, val_preds))
    rmse = float(np.sqrt(mean_squared_error(y_val, val_preds)))
    r2 = float(r2_score(y_val, val_preds))

    print(f"[Training Evaluation] MAE={mae:.3f}, RMSE={rmse:.3f}, R^2={r2:.3f}")

    # Model Artifact Persistence
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    artifact = {
        "model": model,
        "feature_names": feature_names,
        "metrics": {"mae": mae, "rmse": rmse, "r2": r2},
        "training_source": summary["csv_filenames"] if not explicit_file else str(explicit_file),
        "total_records": summary["total_records_merged"],
        "duplicates_removed": summary["duplicates_removed"],
    }
    joblib.dump(artifact, MODEL_PATH)
    print(f"[Training] Model artifact successfully saved to: {MODEL_PATH}")

    return artifact["metrics"]


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train Railway Priority/Risk Model")
    parser.add_argument(
        "--csv",
        type=str,
        default=None,
        help="Path to specific training CSV file (optional, defaults to discovering all valid CSVs in training directory)",
    )
    parser.add_argument(
        "--data-dir",
        type=str,
        default=None,
        help="Directory containing training CSV files (defaults to data/training)",
    )
    parser.add_argument("--seed", type=int, default=42, help="Random seed for reproducibility")
    args = parser.parse_args()

    input_csv = Path(args.csv) if args.csv else None
    input_dir = Path(args.data_dir) if args.data_dir else None
    metrics = train_priority_model(csv_path=input_csv, data_dir=input_dir, seed=args.seed)
    print("Final training metrics:", metrics)