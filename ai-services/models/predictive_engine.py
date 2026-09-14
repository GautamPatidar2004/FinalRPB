from datetime import datetime
from typing import List, Tuple
from schemas.railway import Department, Priority, MaintenanceBlockRequest
from schemas.predictive import (
    AssetOperationalLog,
    PredictiveAdvisoryRecord,
    PredictiveMaintenanceReport,
)


class PredictiveMaintenanceEngine:
    """
    Preventative & Condition-Based Maintenance Projection Engine.
    Evaluates cumulative wear, tonnage thresholds, and inspection intervals
    to synthesize proactive MaintenanceBlockRequests before physical failures occur.
    """

    GMT_THRESHOLD = 25.0              # Track renewal recommended beyond 25 Gross Million Tonnes
    DAYS_CYCLE_THRESHOLD = 90          # Maximum days between scheduled overhead/track checks
    FAULT_CLUSTER_THRESHOLD = 3        # Frequent minor incidents trigger major overhaul
    VIBRATION_ANOMALY_THRESHOLD = 0.75 # High vibration anomaly score

    def evaluate_asset(self, log: AssetOperationalLog) -> Tuple[bool, float, str, Priority, int]:
        risk_score = 0.0
        reasons = []
        priority = Priority.MEDIUM
        duration = 180  # Default 3 hours

        # 1. Tonnage Check
        if log.department == Department.ENG and log.gross_million_tonnes >= self.GMT_THRESHOLD:
            excess = log.gross_million_tonnes - self.GMT_THRESHOLD
            risk_score += min(40.0, 25.0 + excess * 3.0)
            reasons.append(f"Cumulative load ({log.gross_million_tonnes:.1f} GMT) exceeds {self.GMT_THRESHOLD} GMT limit")
            duration = 240

        # 2. Cyclic Calendar Interval Check
        try:
            last_date = datetime.strptime(log.last_overhaul_date, "%Y-%m-%d")
            days_elapsed = (datetime.now() - last_date).days
        except Exception:
            days_elapsed = 100

        if days_elapsed >= self.DAYS_CYCLE_THRESHOLD:
            overdue_days = days_elapsed - self.DAYS_CYCLE_THRESHOLD
            risk_score += min(35.0, 20.0 + overdue_days * 0.5)
            reasons.append(f"Maintenance interval exceeded ({days_elapsed} days elapsed vs {self.DAYS_CYCLE_THRESHOLD} day limit)")

        # 3. Fault Frequency / Anomaly Sensor Data
        if log.recorded_fault_count >= self.FAULT_CLUSTER_THRESHOLD:
            risk_score += 25.0
            reasons.append(f"Fault cluster detected ({log.recorded_fault_count} incidents recorded)")

        if log.vibration_index and log.vibration_index >= self.VIBRATION_ANOMALY_THRESHOLD:
            risk_score += 30.0
            reasons.append(f"Sensor vibration index high ({log.vibration_index:.2f} >= {self.VIBRATION_ANOMALY_THRESHOLD})")

        risk_score = min(100.0, round(risk_score, 2))

        if risk_score >= 70.0:
            priority = Priority.CRITICAL
        elif risk_score >= 45.0:
            priority = Priority.HIGH
        elif risk_score >= 25.0:
            priority = Priority.MEDIUM
        else:
            return False, 0.0, "", Priority.LOW, 0

        return True, risk_score, "; ".join(reasons), priority, duration

    def run_advisory_analysis(self, asset_logs: List[AssetOperationalLog]) -> PredictiveMaintenanceReport:
        advisories: List[PredictiveAdvisoryRecord] = []
        synthesized: List[MaintenanceBlockRequest] = []

        for log in asset_logs:
            needs_work, score, reason, priority, duration = self.evaluate_asset(log)
            if not needs_work:
                continue

            win_start = 60
            win_end = 360
            req_id = f"PRED-{log.asset_id}-{datetime.now().strftime('%m%d%H%M')}"
            
            block_req = MaintenanceBlockRequest(
                request_id=req_id,
                corridor_id=log.corridor_id,
                asset_id=log.asset_id,
                department=log.department,
                requested_date=datetime.now().strftime("%Y-%m-%d"),
                required_duration_minutes=duration,
                earliest_start_minute=win_start,
                latest_end_minute=win_end,
                is_traffic_block_required=True,
                priority_hint=priority,
                reason=f"[PREDICTIVE ADVISORY] {reason}",
            )

            advisory = PredictiveAdvisoryRecord(
                asset_id=log.asset_id,
                corridor_id=log.corridor_id,
                department=log.department,
                risk_score=score,
                recommended_window_start_minute=win_start,
                recommended_window_end_minute=win_end,
                estimated_duration_minutes=duration,
                trigger_rule=reason,
                urgency=priority,
                generated_request=block_req,
            )

            advisories.append(advisory)
            synthesized.append(block_req)

        high_risk_count = sum(1 for a in advisories if a.urgency in (Priority.CRITICAL, Priority.HIGH))

        return PredictiveMaintenanceReport(
            generated_at=datetime.now().isoformat(),
            total_assets_evaluated=len(asset_logs),
            high_risk_count=high_risk_count,
            advisories=advisories,
            synthesized_requests=synthesized,
        )