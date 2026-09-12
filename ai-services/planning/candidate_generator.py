from typing import Dict, List
from schemas.railway import (
    Department,
    GeneratedBlockPlanRecord,
    MaintenanceBlockRequest,
    PriorityScoreResult,
    RailwayPlanningDataset,
)


class CandidatePlanGenerator:
    """
    Generates multiple distinct, structured candidate maintenance block plans
    using Priority/Risk scores and domain scheduling heuristics.
    """

    def __init__(self, dataset: RailwayPlanningDataset, scored_requests: List[PriorityScoreResult]):
        self.dataset = dataset
        self.scored_requests = scored_requests
        self.req_map: Dict[str, MaintenanceBlockRequest] = {r.request_id: r for r in dataset.block_requests}
        # Order requests strictly by descending priority score
        self.ordered_requests: List[MaintenanceBlockRequest] = [
            self.req_map[s.request_id] for s in scored_requests if s.request_id in self.req_map
        ]

    def generate_all_candidates(self) -> Dict[str, List[GeneratedBlockPlanRecord]]:
        """Generates candidates across all available strategy alternatives."""
        return {
            "priority_greedy": self.generate_priority_greedy(),
            "night_shadow_focused": self.generate_night_shadow_focused(),
            "joint_corridor_batching": self.generate_joint_corridor_batching(),
        }

    def _has_conflict(
        self,
        req: MaintenanceBlockRequest,
        candidate_start: int,
        candidate_end: int,
        scheduled_blocks: List[GeneratedBlockPlanRecord],
    ) -> bool:
        """
        Validates if [candidate_start, candidate_end] for req conflicts with:
        1. Corridor available operating window
        2. Train timetable (if is_traffic_block_required)
        3. Asset conflicts (same asset overlap unless compatible ENG+TRD joint)
        4. Corridor max parallel blocks capacity
        """
        corridor = next((c for c in self.dataset.corridors if c.corridor_id == req.corridor_id), None)
        if corridor:
            if candidate_start < corridor.available_start_minute or candidate_end > corridor.available_end_minute:
                return True

        if req.is_traffic_block_required:
            for train in self.dataset.trains:
                if train.corridor_id == req.corridor_id:
                    if not (train.exit_minute <= candidate_start or train.entry_minute >= candidate_end):
                        return True

        allow_joint = self.dataset.constraints.allow_joint_department_blocks
        max_concurrent = self.dataset.constraints.max_concurrent_blocks_per_corridor
        if corridor and corridor.max_parallel_blocks:
            max_concurrent = min(max_concurrent, corridor.max_parallel_blocks)

        overlap_count = 1
        for b in scheduled_blocks:
            if b.corridor_id == req.corridor_id and b.status == "SCHEDULED":
                if not (candidate_end <= b.scheduled_start_minute or candidate_start >= b.scheduled_end_minute):
                    overlap_count += 1
                    if b.asset_id == req.asset_id:
                        is_compatible_joint = (
                            allow_joint
                            and b.department != req.department
                            and {b.department, req.department} == {Department.ENG, Department.TRD}
                        )
                        if not is_compatible_joint:
                            return True

        if overlap_count > max_concurrent:
            return True

        return False

    def generate_priority_greedy(self) -> List[GeneratedBlockPlanRecord]:
        """
        Strategy 1: High-Priority First (Greedy Window).
        Iterates in strict priority order, allocating the earliest feasible non-conflicting time.
        """
        plan: List[GeneratedBlockPlanRecord] = []
        step = 15

        for idx, req in enumerate(self.ordered_requests, start=1):
            candidate_start = req.earliest_start_minute
            duration = req.required_duration_minutes
            placed = False

            while candidate_start + duration <= req.latest_end_minute:
                candidate_end = candidate_start + duration
                if not self._has_conflict(req, candidate_start, candidate_end, plan):
                    plan.append(
                        GeneratedBlockPlanRecord(
                            plan_id=f"PG-{idx:03d}",
                            request_id=req.request_id,
                            corridor_id=req.corridor_id,
                            asset_id=req.asset_id,
                            department=req.department,
                            scheduled_start_minute=candidate_start,
                            scheduled_end_minute=candidate_end,
                            allocated_duration_minutes=duration,
                            status="SCHEDULED",
                        )
                    )
                    placed = True
                    break
                candidate_start += step

            if not placed:
                plan.append(
                    GeneratedBlockPlanRecord(
                        plan_id=f"PG-{idx:03d}",
                        request_id=req.request_id,
                        corridor_id=req.corridor_id,
                        asset_id=req.asset_id,
                        department=req.department,
                        scheduled_start_minute=0,
                        scheduled_end_minute=0,
                        allocated_duration_minutes=0,
                        status="DEFERRED",
                        conflict_flags=["WINDOW_EXCEEDED"],
                    )
                )

        return plan

    def generate_night_shadow_focused(self) -> List[GeneratedBlockPlanRecord]:
        """
        Strategy 2: Night-Shadow Focused.
        Concentrates high-priority requirements inside the 01:00-06:00 (60-360m) low-disruption window.
        """
        plan: List[GeneratedBlockPlanRecord] = []
        NIGHT_START = 60
        NIGHT_END = 360
        step = 15

        for idx, req in enumerate(self.ordered_requests, start=1):
            duration = req.required_duration_minutes
            placed = False

            # First attempt: place in night shadow window [NIGHT_START, NIGHT_END]
            candidate_start = max(req.earliest_start_minute, NIGHT_START)
            while candidate_start + duration <= min(req.latest_end_minute, NIGHT_END):
                candidate_end = candidate_start + duration
                if not self._has_conflict(req, candidate_start, candidate_end, plan):
                    plan.append(
                        GeneratedBlockPlanRecord(
                            plan_id=f"NS-{idx:03d}",
                            request_id=req.request_id,
                            corridor_id=req.corridor_id,
                            asset_id=req.asset_id,
                            department=req.department,
                            scheduled_start_minute=candidate_start,
                            scheduled_end_minute=candidate_end,
                            allocated_duration_minutes=duration,
                            status="SCHEDULED",
                        )
                    )
                    placed = True
                    break
                candidate_start += step

            # If cannot fit in night shadow, fall back to daytime window
            if not placed:
                candidate_start = max(req.earliest_start_minute, NIGHT_END)
                while candidate_start + duration <= req.latest_end_minute:
                    candidate_end = candidate_start + duration
                    if not self._has_conflict(req, candidate_start, candidate_end, plan):
                        plan.append(
                            GeneratedBlockPlanRecord(
                                plan_id=f"NS-{idx:03d}",
                                request_id=req.request_id,
                                corridor_id=req.corridor_id,
                                asset_id=req.asset_id,
                                department=req.department,
                                scheduled_start_minute=candidate_start,
                                scheduled_end_minute=candidate_end,
                                allocated_duration_minutes=duration,
                                status="SCHEDULED",
                            )
                        )
                        placed = True
                        break
                    candidate_start += step

            if not placed:
                plan.append(
                    GeneratedBlockPlanRecord(
                        plan_id=f"NS-{idx:03d}",
                        request_id=req.request_id,
                        corridor_id=req.corridor_id,
                        asset_id=req.asset_id,
                        department=req.department,
                        scheduled_start_minute=0,
                        scheduled_end_minute=0,
                        allocated_duration_minutes=0,
                        status="DEFERRED",
                        conflict_flags=["OUTSIDE_AVAILABLE_WINDOW"],
                    )
                )

        return plan

    def generate_joint_corridor_batching(self) -> List[GeneratedBlockPlanRecord]:
        """
        Strategy 3: Joint-Corridor Batching.
        Identifies and combines compatible cross-department requests (e.g. ENG + TRD)
        on the same corridor to execute simultaneously, minimizing total closure intervals.
        """
        plan: List[GeneratedBlockPlanRecord] = []
        allow_joint = self.dataset.constraints.allow_joint_department_blocks

        # Group requests by corridor
        corridor_reqs: Dict[str, List[MaintenanceBlockRequest]] = {}
        for req in self.ordered_requests:
            corridor_reqs.setdefault(req.corridor_id, []).append(req)

        plan_counter = 1
        for corridor_id, c_requests in corridor_reqs.items():
            timeline_cursor = 120  # baseline start in night/morning shadow
            paired_req_ids = set()

            if allow_joint:
                eng_reqs = [r for r in c_requests if r.department == Department.ENG]
                trd_reqs = [r for r in c_requests if r.department == Department.TRD]

                for eng_r in eng_reqs:
                    for trd_r in trd_reqs:
                        if trd_r.request_id not in paired_req_ids and eng_r.request_id not in paired_req_ids:
                            joint_start = max(eng_r.earliest_start_minute, trd_r.earliest_start_minute, timeline_cursor)
                            eng_duration = eng_r.required_duration_minutes
                            trd_duration = trd_r.required_duration_minutes

                            if (joint_start + eng_duration <= eng_r.latest_end_minute and
                                    joint_start + trd_duration <= trd_r.latest_end_minute):

                                plan.append(
                                    GeneratedBlockPlanRecord(
                                        plan_id=f"JC-{plan_counter:03d}",
                                        request_id=eng_r.request_id,
                                        corridor_id=corridor_id,
                                        asset_id=eng_r.asset_id,
                                        department=eng_r.department,
                                        scheduled_start_minute=joint_start,
                                        scheduled_end_minute=joint_start + eng_duration,
                                        allocated_duration_minutes=eng_duration,
                                        status="SCHEDULED",
                                        conflict_flags=["JOINT_BLOCK:ENG+TRD"],
                                    )
                                )
                                plan_counter += 1

                                plan.append(
                                    GeneratedBlockPlanRecord(
                                        plan_id=f"JC-{plan_counter:03d}",
                                        request_id=trd_r.request_id,
                                        corridor_id=corridor_id,
                                        asset_id=trd_r.asset_id,
                                        department=trd_r.department,
                                        scheduled_start_minute=joint_start,
                                        scheduled_end_minute=joint_start + trd_duration,
                                        allocated_duration_minutes=trd_duration,
                                        status="SCHEDULED",
                                        conflict_flags=["JOINT_BLOCK:ENG+TRD"],
                                    )
                                )
                                plan_counter += 1

                                paired_req_ids.add(eng_r.request_id)
                                paired_req_ids.add(trd_r.request_id)
                                timeline_cursor = joint_start + max(eng_duration, trd_duration) + self.dataset.constraints.min_headway_minutes
                                break

            # Schedule remaining un-paired requests on this corridor
            for req in c_requests:
                if req.request_id in paired_req_ids:
                    continue

                duration = req.required_duration_minutes
                candidate_start = max(req.earliest_start_minute, timeline_cursor)
                step = 15
                placed = False

                while candidate_start + duration <= req.latest_end_minute:
                    candidate_end = candidate_start + duration
                    if not self._has_conflict(req, candidate_start, candidate_end, plan):
                        plan.append(
                            GeneratedBlockPlanRecord(
                                plan_id=f"JC-{plan_counter:03d}",
                                request_id=req.request_id,
                                corridor_id=corridor_id,
                                asset_id=req.asset_id,
                                department=req.department,
                                scheduled_start_minute=candidate_start,
                                scheduled_end_minute=candidate_end,
                                allocated_duration_minutes=duration,
                                status="SCHEDULED",
                            )
                        )
                        plan_counter += 1
                        placed = True
                        break
                    candidate_start += step

                if not placed:
                    plan.append(
                        GeneratedBlockPlanRecord(
                            plan_id=f"JC-{plan_counter:03d}",
                            request_id=req.request_id,
                            corridor_id=corridor_id,
                            asset_id=req.asset_id,
                            department=req.department,
                            scheduled_start_minute=0,
                            scheduled_end_minute=0,
                            allocated_duration_minutes=0,
                            status="DEFERRED",
                            conflict_flags=["WINDOW_EXCEEDED"],
                        )
                    )
                    plan_counter += 1

        return plan
