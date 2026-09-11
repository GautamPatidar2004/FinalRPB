from typing import Any, Dict, List, Tuple
from schemas.railway import (
    Department,
    Priority,
    TrackType,
    MaintenanceBlockRequest,
    RailwayPlanningDataset,
)

DEFECT_SEVERITY_WEIGHTS = {
    Priority.CRITICAL: 40.0,
    Priority.HIGH: 25.0,
    Priority.MEDIUM: 15.0,
    Priority.LOW: 5.0,
}

DEPT_WEIGHTS = {
    Department.SNT: 8.0,
    Department.ENG: 7.0,
    Department.TRD: 6.0,
}

TRACK_WEIGHTS = {
    TrackType.BOTH: 8.0,
    TrackType.SINGLE: 8.0,
    TrackType.UP: 4.0,
    TrackType.DOWN: 4.0,
}


def extract_request_features(
    request: MaintenanceBlockRequest,
    dataset: RailwayPlanningDataset,
) -> Tuple[Dict[str, float], Dict[str, float], float]:
    """
    Extracts raw numerical ML features, explainable factor components,
    and ground-truth risk index for a maintenance block request.
    """
    # 1. Defect & Overdue factor
    defect_map = {d.defect_id: d for d in dataset.defects}
    linked_defect = defect_map.get(request.linked_defect_id) if request.linked_defect_id else None

    if linked_defect:
        defect_sev_score = DEFECT_SEVERITY_WEIGHTS.get(linked_defect.severity, 10.0)
        days_overdue = linked_defect.days_overdue
        overdue_score = min(25.0, float(days_overdue) * 0.8)
    else:
        defect_sev_score = DEFECT_SEVERITY_WEIGHTS.get(request.urgency, 10.0) * 0.5
        days_overdue = 0
        overdue_score = 0.0

    # 2. Asset Criticality factor
    asset_map = {a.asset_id: a for a in dataset.assets}
    asset = asset_map.get(request.asset_id)
    dept_score = DEPT_WEIGHTS.get(request.department, 5.0)
    track_score = TRACK_WEIGHTS.get(asset.track_type, 4.0) if asset else 4.0
    asset_criticality_score = dept_score + track_score

    # 3. Operational Impact factor
    traffic_block_score = 10.0 if request.is_traffic_block_required else 0.0
    power_block_score = 8.0 if request.is_power_block_required else 0.0
    operational_impact_score = traffic_block_score + power_block_score

    # 4. Schedule Window Tightness factor
    window_duration = max(15, request.latest_end_minute - request.earliest_start_minute)
    tightness_ratio = min(1.0, request.required_duration_minutes / window_duration)
    window_tightness_score = tightness_ratio * 10.0

    # 5. Traffic Conflict factor
    conflicting_trains = 0
    for train in dataset.trains:
        if train.corridor_id == request.corridor_id:
            # Overlap check
            if not (train.exit_minute <= request.earliest_start_minute or train.entry_minute >= request.latest_end_minute):
                conflicting_trains += 1
    traffic_conflict_score = min(15.0, conflicting_trains * 2.5)

    # Calculate explainable factor breakdown
    factors = {
        "defect_severity": round(defect_sev_score, 2),
        "maintenance_overdue": round(overdue_score, 2),
        "asset_criticality": round(asset_criticality_score, 2),
        "operational_impact": round(operational_impact_score, 2),
        "window_tightness": round(window_tightness_score, 2),
        "traffic_conflict": round(traffic_conflict_score, 2),
    }

    # Composite ground-truth risk target (0 - 100)
    composite_target = min(100.0, max(0.0, sum(factors.values())))

    # Raw ML feature vector
    features = {
        "is_traffic_block": 1.0 if request.is_traffic_block_required else 0.0,
        "is_power_block": 1.0 if request.is_power_block_required else 0.0,
        "required_duration": float(request.required_duration_minutes),
        "window_duration": float(window_duration),
        "tightness_ratio": float(tightness_ratio),
        "days_overdue": float(days_overdue),
        "has_linked_defect": 1.0 if linked_defect else 0.0,
        "conflicting_train_count": float(conflicting_trains),
        "dept_eng": 1.0 if request.department == Department.ENG else 0.0,
        "dept_trd": 1.0 if request.department == Department.TRD else 0.0,
        "dept_snt": 1.0 if request.department == Department.SNT else 0.0,
        "track_both": 1.0 if (asset and asset.track_type == TrackType.BOTH) else 0.0,
        "urgency_critical": 1.0 if request.urgency == Priority.CRITICAL else 0.0,
        "urgency_high": 1.0 if request.urgency == Priority.HIGH else 0.0,
    }

    return features, factors, composite_target


def extract_features_dataset(
    dataset: RailwayPlanningDataset,
) -> Tuple[List[Dict[str, float]], List[Dict[str, float]], List[float]]:
    """Extracts features, factors, and targets for all requests in a dataset."""
    feature_list: List[Dict[str, float]] = []
    factor_list: List[Dict[str, float]] = []
    target_list: List[float] = []

    for req in dataset.block_requests:
        feat, fact, target = extract_request_features(req, dataset)
        feature_list.append(feat)
        factor_list.append(fact)
        target_list.append(target)

    return feature_list, factor_list, target_list
