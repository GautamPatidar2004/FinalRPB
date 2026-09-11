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

    def generate_priority_greedy(self) -> List[GeneratedBlockPlanRecord]:
        """
        Strategy 1: High-Priority First (Greedy Window).
        Iterates in strict priority order, allocating the earliest available non-overlapping time.
        """
        plan: List[GeneratedBlockPlanRecord] = []
        corridor_timelines: Dict[str, List[tuple[int, int]]] = {}

        for idx, req in enumerate(self.ordered_requests, start=1):
            corridor_intervals = corridor_timelines.setdefault(req.corridor_id, [])
            candidate_start = req.earliest_start_minute
            duration = req.required_duration_minutes

            # Stagger if overlapping with already placed block on the same corridor
            conflict = True
            while conflict and candidate_start + duration <= req.latest_end_minute:
                conflict = False
                for s_start, s_end in corridor_intervals:
                    if not (candidate_start + duration <= s_start or candidate_start >= s_end):
                        # Collision on corridor, advance past this block
                        candidate_start = s_end + self.dataset.constraints.min_headway_minutes
                        conflict = True
                        break

            if candidate_start + duration <= req.latest_end_minute:
                plan.append(
                    GeneratedBlockPlanRecord(
                        plan_id=f"PG-{idx:03d}",
                        request_id=req.request_id,
                        corridor_id=req.corridor_id,
                        asset_id=req.asset_id,
                        department=req.department,
                        scheduled_start_minute=candidate_start,
                        scheduled_end_minute=candidate_start + duration,
                        allocated_duration_minutes=duration,
                        status="SCHEDULED",
                    )
                )
                corridor_intervals.append((candidate_start, candidate_start + duration))
            else:
                # Unable to fit within requested boundary without conflict
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
        corridor_timelines: Dict[str, List[tuple[int, int]]] = {}

        NIGHT_START = 60
        NIGHT_END = 360

        for idx, req in enumerate(self.ordered_requests, start=1):
            corridor_intervals = corridor_timelines.setdefault(req.corridor_id, [])
            duration = req.required_duration_minutes

            # First attempt: place in night shadow window
            candidate_start = max(req.earliest_start_minute, NIGHT_START)
            candidate_end = candidate_start + duration

            can_fit_night = candidate_end <= min(req.latest_end_minute, NIGHT_END)
            if can_fit_night:
                for s_start, s_end in corridor_intervals:
                    if not (candidate_end <= s_start or candidate_start >= s_end):
                        can_fit_night = False
                        break

            # If cannot fit in night shadow, fall back to daytime earliest window
            if not can_fit_night:
                candidate_start = max(req.earliest_start_minute, NIGHT_END + 30)
                candidate_end = candidate_start + duration

            if candidate_end <= req.latest_end_minute:
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
                corridor_intervals.append((candidate_start, candidate_end))
            else:
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

            # Try to pair compatible ENG and TRD requests if joint blocks are allowed
            paired_req_ids = set()

            if allow_joint:
                eng_reqs = [r for r in c_requests if r.department == Department.ENG]
                trd_reqs = [r for r in c_requests if r.department == Department.TRD]

                for eng_r in eng_reqs:
                    for trd_r in trd_reqs:
                        if trd_r.request_id not in paired_req_ids and eng_r.request_id not in paired_req_ids:
                            # Compatible pair! Co-schedule at the same start time
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

            # Schedule remaining un-paired requests sequentially on this corridor
            for req in c_requests:
                if req.request_id in paired_req_ids:
                    continue

                start_min = max(req.earliest_start_minute, timeline_cursor)
                end_min = start_min + req.required_duration_minutes

                if end_min <= req.latest_end_minute:
                    plan.append(
                        GeneratedBlockPlanRecord(
                            plan_id=f"JC-{plan_counter:03d}",
                            request_id=req.request_id,
                            corridor_id=corridor_id,
                            asset_id=req.asset_id,
                            department=req.department,
                            scheduled_start_minute=start_min,
                            scheduled_end_minute=end_min,
                            allocated_duration_minutes=req.required_duration_minutes,
                            status="SCHEDULED",
                        )
                    )
                    timeline_cursor = end_min + self.dataset.constraints.min_headway_minutes
                else:
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
