from typing import Dict, List, Optional
from schemas.railway import (
    Department,
    GeneratedBlockPlanRecord,
    MaintenanceBlockRequest,
    RailwayAsset,
    RailwayPlanningDataset,
)
from schemas.constraints import (
    ConstraintType,
    ConstraintViolation,
    PlanFeasibilityResult,
)


class RailwayConstraintEngine:
    """
    Deterministic Railway Hard Constraint Validation Engine.
    Strictly verifies operational feasibility for candidate maintenance plans.
    Hard constraints must NEVER be ignored or bypassed.
    """

    def validate(
        self,
        candidate_plan: List[GeneratedBlockPlanRecord],
        dataset: RailwayPlanningDataset,
    ) -> PlanFeasibilityResult:
        violations: List[ConstraintViolation] = []

        # Index reference data
        req_map: Dict[str, MaintenanceBlockRequest] = {r.request_id: r for r in dataset.block_requests}
        corridor_map = {c.corridor_id: c for c in dataset.corridors}
        asset_map: Dict[str, RailwayAsset] = {a.asset_id: a for a in dataset.assets}

        # Filter only scheduled blocks (deferred/rejected blocks do not occupy track resources)
        scheduled_blocks = [p for p in candidate_plan if p.status == "SCHEDULED"]

        for block in scheduled_blocks:
            req = req_map.get(block.request_id)
            if not req:
                violations.append(
                    ConstraintViolation(
                        constraint_type=ConstraintType.INVALID_ASSET_REFERENCE,
                        plan_id=block.plan_id,
                        request_id=block.request_id,
                        corridor_id=block.corridor_id,
                        reason=f"Block references non-existent request ID '{block.request_id}'.",
                    )
                )
                continue

            # 1. Asset Reference and Location Validity
            asset = asset_map.get(block.asset_id)
            if not asset:
                violations.append(
                    ConstraintViolation(
                        constraint_type=ConstraintType.INVALID_ASSET_REFERENCE,
                        plan_id=block.plan_id,
                        request_id=block.request_id,
                        corridor_id=block.corridor_id,
                        reason=f"Block references non-existent asset ID '{block.asset_id}'.",
                    )
                )
            elif asset.corridor_id != block.corridor_id:
                violations.append(
                    ConstraintViolation(
                        constraint_type=ConstraintType.INVALID_ASSET_REFERENCE,
                        plan_id=block.plan_id,
                        request_id=block.request_id,
                        corridor_id=block.corridor_id,
                        reason=f"Asset {asset.asset_id} is located on corridor {asset.corridor_id}, not {block.corridor_id}.",
                    )
                )

            # 2. Block Duration Validity
            actual_span = block.scheduled_end_minute - block.scheduled_start_minute
            if actual_span != block.allocated_duration_minutes:
                violations.append(
                    ConstraintViolation(
                        constraint_type=ConstraintType.INSUFFICIENT_DURATION,
                        plan_id=block.plan_id,
                        request_id=block.request_id,
                        corridor_id=block.corridor_id,
                        reason=f"Time interval mismatch: ({block.scheduled_start_minute} to {block.scheduled_end_minute}) = {actual_span}m, but allocated duration is {block.allocated_duration_minutes}m.",
                    )
                )
            elif block.allocated_duration_minutes < req.required_duration_minutes:
                violations.append(
                    ConstraintViolation(
                        constraint_type=ConstraintType.INSUFFICIENT_DURATION,
                        plan_id=block.plan_id,
                        request_id=block.request_id,
                        corridor_id=block.corridor_id,
                        reason=f"Allocated duration {block.allocated_duration_minutes}m is less than required {req.required_duration_minutes}m.",
                    )
                )

            # 3. Request Maintenance Time-Window Validity
            if block.scheduled_start_minute < req.earliest_start_minute:
                violations.append(
                    ConstraintViolation(
                        constraint_type=ConstraintType.REQUEST_WINDOW_VIOLATION,
                        plan_id=block.plan_id,
                        request_id=block.request_id,
                        corridor_id=block.corridor_id,
                        reason=f"Scheduled start {block.scheduled_start_minute}m is earlier than permissible window start {req.earliest_start_minute}m.",
                    )
                )
            if block.scheduled_end_minute > req.latest_end_minute:
                violations.append(
                    ConstraintViolation(
                        constraint_type=ConstraintType.REQUEST_WINDOW_VIOLATION,
                        plan_id=block.plan_id,
                        request_id=block.request_id,
                        corridor_id=block.corridor_id,
                        reason=f"Scheduled end {block.scheduled_end_minute}m exceeds permissible window limit {req.latest_end_minute}m.",
                    )
                )

            # 4. Corridor / Section Availability
            corridor = corridor_map.get(block.corridor_id)
            if not corridor:
                violations.append(
                    ConstraintViolation(
                        constraint_type=ConstraintType.CORRIDOR_WINDOW_VIOLATION,
                        plan_id=block.plan_id,
                        request_id=block.request_id,
                        corridor_id=block.corridor_id,
                        reason=f"Corridor '{block.corridor_id}' does not exist in dataset.",
                    )
                )
            else:
                if block.scheduled_start_minute < corridor.available_start_minute or block.scheduled_end_minute > corridor.available_end_minute:
                    violations.append(
                        ConstraintViolation(
                            constraint_type=ConstraintType.CORRIDOR_WINDOW_VIOLATION,
                            plan_id=block.plan_id,
                            request_id=block.request_id,
                            corridor_id=block.corridor_id,
                            reason=f"Block [{block.scheduled_start_minute}, {block.scheduled_end_minute}] falls outside corridor operating window [{corridor.available_start_minute}, {corridor.available_end_minute}].",
                        )
                    )

            # 5. Train / Traffic Conflict (Direct Collision)
            if req.is_traffic_block_required:
                for train in dataset.trains:
                    if train.corridor_id == block.corridor_id:
                        # Overlap check between block and train on the same corridor
                        if not (train.exit_minute <= block.scheduled_start_minute or train.entry_minute >= block.scheduled_end_minute):
                            violations.append(
                                ConstraintViolation(
                                    constraint_type=ConstraintType.TRAIN_TRAFFIC_CONFLICT,
                                    plan_id=block.plan_id,
                                    request_id=block.request_id,
                                    corridor_id=block.corridor_id,
                                    reason=f"Direct train collision: Block [{block.scheduled_start_minute}, {block.scheduled_end_minute}] overlaps Train {train.train_id} ({train.train_type}) running [{train.entry_minute}, {train.exit_minute}] on corridor {block.corridor_id}.",
                                )
                            )

        # 6. Inter-Block Corridor Capacity and Asset Overlaps
        max_concurrent = dataset.constraints.max_concurrent_blocks_per_corridor
        allow_joint = dataset.constraints.allow_joint_department_blocks

        # Group by corridor to test concurrency
        corridor_blocks: Dict[str, List[GeneratedBlockPlanRecord]] = {}
        for b in scheduled_blocks:
            corridor_blocks.setdefault(b.corridor_id, []).append(b)

        for c_id, blocks in corridor_blocks.items():
            for i in range(len(blocks)):
                overlap_count = 1
                for j in range(i + 1, len(blocks)):
                    b1 = blocks[i]
                    b2 = blocks[j]
                    # Check time overlap
                    if not (b2.scheduled_end_minute <= b1.scheduled_start_minute or b2.scheduled_start_minute >= b1.scheduled_end_minute):
                        overlap_count += 1

                        # Check asset-level collision
                        if b1.asset_id == b2.asset_id:
                            # If same asset, check if joint department is permitted
                            is_compatible_joint = (
                                allow_joint and
                                b1.department != b2.department and
                                {b1.department, b2.department} == {Department.ENG, Department.TRD}
                            )
                            if not is_compatible_joint:
                                violations.append(
                                    ConstraintViolation(
                                        constraint_type=ConstraintType.ASSET_CONFLICT,
                                        plan_id=b2.plan_id,
                                        request_id=b2.request_id,
                                        corridor_id=c_id,
                                        reason=f"Incompatible overlapping blocks on same asset {b1.asset_id} between {b1.plan_id} and {b2.plan_id}.",
                                    )
                                )

                if overlap_count > max_concurrent:
                    violations.append(
                        ConstraintViolation(
                            constraint_type=ConstraintType.CORRIDOR_CAPACITY_EXCEEDED,
                            plan_id=blocks[i].plan_id,
                            request_id=blocks[i].request_id,
                            corridor_id=c_id,
                            reason=f"Corridor {c_id} concurrency limit exceeded ({overlap_count} concurrent blocks > limit of {max_concurrent}).",
                        )
                    )

        is_feasible = (len(violations) == 0)
        if is_feasible:
            summary = f"Plan is FEASIBLE ({len(scheduled_blocks)} scheduled blocks satisfy all hard constraints)."
        else:
            summary = f"Plan is INFEASIBLE: {len(violations)} hard constraint violation(s) detected across {len(scheduled_blocks)} scheduled blocks."

        return PlanFeasibilityResult(
            is_feasible=is_feasible,
            total_hard_violations=len(violations),
            violations=violations,
            summary=summary,
        )


def validate_plan_feasibility(
    candidate_plan: List[GeneratedBlockPlanRecord],
    dataset: RailwayPlanningDataset,
) -> PlanFeasibilityResult:
    """Convenience functional interface for plan feasibility validation."""
    engine = RailwayConstraintEngine()
    return engine.validate(candidate_plan, dataset)
