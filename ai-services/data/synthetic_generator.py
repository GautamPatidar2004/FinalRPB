import random
from typing import Dict, List, Optional
from schemas.railway import (
    Department,
    Priority,
    TrackType,
    RailwayAsset,
    MaintenanceDefect,
    MaintenanceBlockRequest,
    CorridorAvailability,
    TrainTraffic,
    PlanningConstraints,
    RailwayPlanningDataset,
)

CORRIDOR_TEMPLATES = [
    {"id": "COR-NDLS-GZB", "name": "New Delhi - Ghaziabad Main Line", "length": 42.5, "electrified": True},
    {"id": "COR-CSMT-KYN", "name": "Mumbai CSMT - Kalyan High-Density", "length": 54.0, "electrified": True},
    {"id": "COR-HWH-BWN", "name": "Howrah - Barddhaman Chord", "length": 95.0, "electrified": True},
    {"id": "COR-MAS-AJJ", "name": "Chennai Central - Arakkonam", "length": 69.0, "electrified": True},
]

ASSET_DESCRIPTIONS = {
    Department.ENG: ["Switch Diamond Crossing", "Continuous Welded Rail Segment", "Ballast Bed & Sleeper Zone", "Girder Bridge Approach"],
    Department.TRD: ["25kV OHE Cantilever Mast", "Traction Substation Feeder", "Auto-Tensioning Device", "Neutral Section Switch"],
    Department.SNT: ["Electronic Interlocking Panel", "Multi-Aspect Colour Light Signal", "Audio Frequency Track Circuit", "Point Machine 220V"],
}

DEFECT_CATALOG = {
    Department.ENG: [
        ("Rail Joint Fishplate Microcrack", Priority.CRITICAL),
        ("Sleeper Ballast Cushion Deficiency", Priority.MEDIUM),
        ("Track Gauge Exceeds Tolerance", Priority.HIGH),
        ("Corrugation on Curve Rail Head", Priority.LOW),
    ],
    Department.TRD: [
        ("OHE Contact Wire Diameter Wear >20%", Priority.CRITICAL),
        ("Insulator Flashover Contamination", Priority.HIGH),
        ("Dropper Slackness Near Neutral Section", Priority.MEDIUM),
        ("Substation Lightning Arrester Inspection Overdue", Priority.HIGH),
    ],
    Department.SNT: [
        ("Axle Counter Signal Drift", Priority.CRITICAL),
        ("Point Machine Detection Contact Pitting", Priority.HIGH),
        ("Track Circuit Relay Voltage Drop", Priority.HIGH),
        ("Signal Lens Dust Accumulation", Priority.LOW),
    ],
}


class SyntheticRailwayDataGenerator:
    """
    Deterministic generator for interconnected, realistic Railway planning data.
    Ensures that assets, defects, corridors, trains, and block requests are coherent.
    """

    def __init__(self, seed: int = 42):
        self.rng = random.Random(seed)

    def generate(self, num_requests: int = 25) -> RailwayPlanningDataset:
        # 1. Generate Corridors
        corridors: List[CorridorAvailability] = []
        for template in CORRIDOR_TEMPLATES:
            # Operational maintenance window: Night shadow (01:00 to 05:00 = 60 to 300 mins) or full day
            corridors.append(
                CorridorAvailability(
                    corridor_id=template["id"],
                    name=template["name"],
                    length_km=template["length"],
                    is_electrified=template["electrified"],
                    available_start_minute=0,
                    available_end_minute=1440,
                    max_parallel_blocks=2,
                )
            )

        # 2. Generate Interconnected Assets across Departments
        assets: List[RailwayAsset] = []
        asset_counter = 1
        departments = [Department.ENG, Department.TRD, Department.SNT]

        for corridor in corridors:
            for dept in departments:
                # 3 to 5 assets per department per corridor
                for idx in range(3):
                    km_start = round(self.rng.uniform(1.0, corridor.length_km - 5.0), 1)
                    km_end = round(km_start + self.rng.uniform(0.5, 3.0), 1)
                    assets.append(
                        RailwayAsset(
                            asset_id=f"AST-{corridor.corridor_id[-7:]}-{dept.name[:3]}-{asset_counter:03d}",
                            corridor_id=corridor.corridor_id,
                            department=dept,
                            start_km=km_start,
                            end_km=km_end,
                            track_type=self.rng.choice([TrackType.UP, TrackType.DOWN, TrackType.BOTH]),
                        )
                    )
                    asset_counter += 1

        # 3. Generate Defects on subset of Assets
        defects: List[MaintenanceDefect] = []
        defect_counter = 1
        # ~40% of assets have tracked defects/overdue conditions
        defect_assets = self.rng.sample(assets, k=max(5, int(len(assets) * 0.45)))

        asset_defect_map: Dict[str, MaintenanceDefect] = {}
        for asset in defect_assets:
            desc_template, default_sev = self.rng.choice(DEFECT_CATALOG[asset.department])
            is_overdue = self.rng.random() < 0.6
            days_overdue = self.rng.randint(3, 45) if is_overdue else 0
            # Escalate severity if heavily overdue
            severity = Priority.CRITICAL if days_overdue > 30 else default_sev

            defect = MaintenanceDefect(
                defect_id=f"DEF-{defect_counter:04d}",
                asset_id=asset.asset_id,
                severity=severity,
                days_overdue=days_overdue,
                description=f"{desc_template} (overdue {days_overdue} days)" if is_overdue else desc_template,
            )
            defects.append(defect)
            asset_defect_map[asset.asset_id] = defect
            defect_counter += 1

        # 4. Generate Train Traffic with conflicting slots
        trains: List[TrainTraffic] = []
        train_counter = 12001
        for corridor in corridors:
            # Spread 6-10 passenger/freight trains across the 24h schedule (0..1440)
            for _ in range(8):
                entry_min = self.rng.randint(60, 1320)
                duration = self.rng.randint(25, 60)
                exit_min = min(1440, entry_min + duration)
                t_type = self.rng.choice(["VANDE_BHARAT_EXP", "SUPERFAST_MAIL", "FREIGHT_CONTAINER", "SUBURBAN_LOCAL"])
                p_level = 1 if "VANDE" in t_type else (2 if "SUPERFAST" in t_type else (3 if "SUBURBAN" in t_type else 4))
                trains.append(
                    TrainTraffic(
                        train_id=f"TRN-{train_counter}",
                        train_type=t_type,
                        corridor_id=corridor.corridor_id,
                        entry_minute=entry_min,
                        exit_minute=exit_min,
                        priority_level=p_level,
                    )
                )
                train_counter += 2

        # 5. Generate Interconnected Maintenance Block Requests
        block_requests: List[MaintenanceBlockRequest] = []
        # Ensure representation of all departments
        chosen_assets = []
        for dept in departments:
            dept_assets = [a for a in assets if a.department == dept]
            chosen_assets.extend(self.rng.sample(dept_assets, k=min(len(dept_assets), max(2, num_requests // 3))))

        # Fill remaining from all assets
        while len(chosen_assets) < num_requests:
            chosen_assets.append(self.rng.choice(assets))

        self.rng.shuffle(chosen_assets)
        chosen_assets = chosen_assets[:num_requests]

        for req_idx, asset in enumerate(chosen_assets, start=1):
            linked_defect = asset_defect_map.get(asset.asset_id)
            if linked_defect:
                urgency = linked_defect.severity
                defect_id = linked_defect.defect_id
            else:
                urgency = self.rng.choice([Priority.HIGH, Priority.MEDIUM, Priority.LOW])
                defect_id = None

            # Realistic durations: 60 - 240 mins
            req_duration = self.rng.choice([60, 90, 120, 180, 240])

            # Preferred operational windows: some day, some night shadow (60-360)
            if self.rng.random() < 0.65:
                # Night/Early morning shadow window
                start_min = self.rng.randint(60, 240)
                end_min = min(1440, start_min + req_duration + self.rng.randint(30, 120))
            else:
                # Mid-day maintenance window
                start_min = self.rng.randint(600, 960)
                end_min = min(1440, start_min + req_duration + self.rng.randint(30, 120))

            # Department-specific operational requirements
            needs_power = (asset.department == Department.TRD) or (self.rng.random() < 0.25)
            needs_traffic = (asset.department == Department.ENG) or (self.rng.random() < 0.8)

            block_requests.append(
                MaintenanceBlockRequest(
                    request_id=f"REQ-{req_idx:03d}",
                    department=asset.department,
                    corridor_id=asset.corridor_id,
                    asset_id=asset.asset_id,
                    required_duration_minutes=req_duration,
                    earliest_start_minute=start_min,
                    latest_end_minute=end_min,
                    is_power_block_required=needs_power,
                    is_traffic_block_required=needs_traffic,
                    urgency=urgency,
                    linked_defect_id=defect_id,
                )
            )

        return RailwayPlanningDataset(
            corridors=corridors,
            assets=assets,
            defects=defects,
            trains=trains,
            block_requests=block_requests,
            constraints=PlanningConstraints(),
        )


def generate_synthetic_dataset(num_requests: int = 25, seed: int = 42) -> RailwayPlanningDataset:
    """Convenience helper to generate reproducible synthetic railway planning data."""
    generator = SyntheticRailwayDataGenerator(seed=seed)
    return generator.generate(num_requests=num_requests)
