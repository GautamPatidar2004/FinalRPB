from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import uuid

from config.settings import settings
from schemas.railway import (
    Department,
    Priority,
    TrackType,
    CorridorAvailability,
    RailwayAsset,
    TrainTraffic,
    MaintenanceBlockRequest,
    PlanningConstraints,
    RailwayPlanningDataset,
)

supabase_client = None
if settings.supabase_url and settings.effective_supabase_key:
    try:
        from supabase import create_client
        client = create_client(settings.supabase_url, settings.effective_supabase_key)
        # Test if tables are actually migrated/accessible in Supabase
        test_res = client.table("corridors").select("corridor_id").limit(1).execute()
        # Verify write capability: check if anon key has write permissions or if service role key is present
        if not settings.supabase_service_role_key:
            try:
                # Probe write permission to detect RLS restriction early
                client.table("corridors").upsert({"corridor_id": "__probe__", "name": "Probe", "length_km": 1.0}).execute()
                client.table("corridors").delete().eq("corridor_id", "__probe__").execute()
                supabase_client = client
            except Exception as rls_err:
                print(f"[Database Notice] Supabase anon key cannot write due to RLS ({rls_err}). Set SUPABASE_SERVICE_ROLE_KEY in .env for live Supabase writes. Falling back to local in-memory operational store.")
                supabase_client = None
        else:
            supabase_client = client
    except Exception as exc:
        print(f"[Database Notice] Supabase tables not migrated or unreachable ({exc}). Falling back to local in-memory operational store.")
        supabase_client = None


class RailwayRepository:
    """
    Unified database repository for Railway Block Planning.
    Directs operations to live Supabase tables when configured and accessible,
    with robust local in-memory fallback for local dev, unmigrated databases, and offline tests.
    """

    def __init__(self, client=None):
        self.client = client if client is not None else supabase_client
        self._local_corridors: Dict[str, Dict[str, Any]] = {}
        self._local_assets: Dict[str, Dict[str, Any]] = {}
        self._local_trains: Dict[str, Dict[str, Any]] = {}
        self._local_requests: Dict[str, Dict[str, Any]] = {}
        self._local_profiles: Dict[str, Dict[str, Any]] = {}
        self._local_plans: Dict[str, Dict[str, Any]] = {}
        self._local_plan_items: Dict[str, List[Dict[str, Any]]] = {}
        self._local_explanations: Dict[str, Dict[str, Any]] = {}

        # Seed initial operational data in local store if empty
        self.seed_demo_operational_data()

    def _ensure_default_seed(self):
        if not self._local_corridors:
            # Seed default corridors
            self._local_corridors["COR-NDLS-GZB"] = {
                "corridor_id": "COR-NDLS-GZB",
                "name": "New Delhi - Ghaziabad Main Line",
                "length_km": 42.5,
                "is_electrified": True,
                "available_start_minute": 0,
                "available_end_minute": 1440,
                "max_parallel_blocks": 2,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
            self._local_corridors["COR-CSMT-KYN"] = {
                "corridor_id": "COR-CSMT-KYN",
                "name": "Mumbai CSMT - Kalyan High-Density",
                "length_km": 54.0,
                "is_electrified": True,
                "available_start_minute": 0,
                "available_end_minute": 1440,
                "max_parallel_blocks": 2,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }

    def seed_demo_operational_data(self, force: bool = False):
        """Seed initial operational demo data for development if empty."""
        self._ensure_default_seed()
        if force or not self._local_assets:
            now = datetime.now(timezone.utc).isoformat()
            demo_assets = [
                {"asset_id": "AST-TRK-101", "corridor_id": "COR-NDLS-GZB", "department": "Engineering", "start_km": 0.0, "end_km": 15.0, "track_type": "UP"},
                {"asset_id": "AST-OHE-101", "corridor_id": "COR-NDLS-GZB", "department": "Traction Distribution", "start_km": 0.0, "end_km": 15.0, "track_type": "BOTH"},
                {"asset_id": "AST-SNT-101", "corridor_id": "COR-NDLS-GZB", "department": "Signalling & Telecom", "start_km": 5.0, "end_km": 10.0, "track_type": "BOTH"},
                {"asset_id": "AST-TRK-102", "corridor_id": "COR-NDLS-GZB", "department": "Engineering", "start_km": 15.0, "end_km": 30.0, "track_type": "DOWN"},
                {"asset_id": "AST-OHE-102", "corridor_id": "COR-NDLS-GZB", "department": "Traction Distribution", "start_km": 15.0, "end_km": 30.0, "track_type": "BOTH"},
                {"asset_id": "AST-SNT-102", "corridor_id": "COR-NDLS-GZB", "department": "Signalling & Telecom", "start_km": 20.0, "end_km": 35.0, "track_type": "BOTH"},
                {"asset_id": "AST-TRK-103", "corridor_id": "COR-NDLS-GZB", "department": "Engineering", "start_km": 30.0, "end_km": 42.5, "track_type": "BOTH"},
                {"asset_id": "AST-TRK-201", "corridor_id": "COR-CSMT-KYN", "department": "Engineering", "start_km": 0.0, "end_km": 20.0, "track_type": "DOWN"},
                {"asset_id": "AST-OHE-201", "corridor_id": "COR-CSMT-KYN", "department": "Traction Distribution", "start_km": 0.0, "end_km": 25.0, "track_type": "BOTH"},
                {"asset_id": "AST-SNT-201", "corridor_id": "COR-CSMT-KYN", "department": "Signalling & Telecom", "start_km": 10.0, "end_km": 25.0, "track_type": "BOTH"},
                {"asset_id": "AST-TRK-202", "corridor_id": "COR-CSMT-KYN", "department": "Engineering", "start_km": 20.0, "end_km": 54.0, "track_type": "UP"},
                {"asset_id": "AST-OHE-202", "corridor_id": "COR-CSMT-KYN", "department": "Traction Distribution", "start_km": 25.0, "end_km": 54.0, "track_type": "BOTH"},
            ]
            for ast in demo_assets:
                self._local_assets[ast["asset_id"]] = {**ast, "created_at": now, "updated_at": now}

        if force or not self._local_trains:
            now = datetime.now(timezone.utc).isoformat()
            demo_trains = [
                {"train_id": "TRN-12002-SHATABDI", "train_type": "PASSENGER_EXPRESS", "corridor_id": "COR-NDLS-GZB", "entry_minute": 360, "exit_minute": 420, "priority_level": 1},
                {"train_id": "TRN-12424-RAJDHANI", "train_type": "PASSENGER_EXPRESS", "corridor_id": "COR-NDLS-GZB", "entry_minute": 980, "exit_minute": 1040, "priority_level": 1},
                {"train_id": "TRN-12123-DECCAN", "train_type": "PASSENGER_EXPRESS", "corridor_id": "COR-CSMT-KYN", "entry_minute": 420, "exit_minute": 480, "priority_level": 1},
                {"train_id": "TRN-22222-CSMT-RAJ", "train_type": "PASSENGER_EXPRESS", "corridor_id": "COR-CSMT-KYN", "entry_minute": 1020, "exit_minute": 1080, "priority_level": 1},
            ]
            for trn in demo_trains:
                self._local_trains[trn["train_id"]] = {**trn, "created_at": now, "updated_at": now}

        if force or not self._local_requests:
            now = datetime.now(timezone.utc).isoformat()
            demo_requests = [
                # COR-NDLS-GZB Workload (multi-departmental, distributed windows)
                {"request_id": "REQ-ENG-001", "department": "Engineering", "corridor_id": "COR-NDLS-GZB", "asset_id": "AST-TRK-101", "required_duration_minutes": 120, "earliest_start_minute": 60, "latest_end_minute": 300, "is_traffic_block_required": True, "is_power_block_required": False, "urgency": "CRITICAL", "status": "PENDING"},
                {"request_id": "REQ-TRD-001", "department": "Traction Distribution", "corridor_id": "COR-NDLS-GZB", "asset_id": "AST-OHE-101", "required_duration_minutes": 90, "earliest_start_minute": 120, "latest_end_minute": 360, "is_traffic_block_required": True, "is_power_block_required": True, "urgency": "HIGH", "status": "PENDING"},
                {"request_id": "REQ-SNT-001", "department": "Signalling & Telecom", "corridor_id": "COR-NDLS-GZB", "asset_id": "AST-SNT-101", "required_duration_minutes": 60, "earliest_start_minute": 480, "latest_end_minute": 720, "is_traffic_block_required": False, "is_power_block_required": False, "urgency": "MEDIUM", "status": "PENDING"},
                {"request_id": "REQ-ENG-003", "department": "Engineering", "corridor_id": "COR-NDLS-GZB", "asset_id": "AST-TRK-102", "required_duration_minutes": 90, "earliest_start_minute": 120, "latest_end_minute": 360, "is_traffic_block_required": True, "is_power_block_required": False, "urgency": "HIGH", "status": "PENDING"},
                {"request_id": "REQ-TRD-003", "department": "Traction Distribution", "corridor_id": "COR-NDLS-GZB", "asset_id": "AST-OHE-102", "required_duration_minutes": 120, "earliest_start_minute": 600, "latest_end_minute": 900, "is_traffic_block_required": False, "is_power_block_required": True, "urgency": "HIGH", "status": "PENDING"},
                {"request_id": "REQ-SNT-002", "department": "Signalling & Telecom", "corridor_id": "COR-NDLS-GZB", "asset_id": "AST-SNT-102", "required_duration_minutes": 60, "earliest_start_minute": 180, "latest_end_minute": 420, "is_traffic_block_required": False, "is_power_block_required": False, "urgency": "MEDIUM", "status": "PENDING"},
                {"request_id": "REQ-ENG-004", "department": "Engineering", "corridor_id": "COR-NDLS-GZB", "asset_id": "AST-TRK-103", "required_duration_minutes": 120, "earliest_start_minute": 720, "latest_end_minute": 1080, "is_traffic_block_required": True, "is_power_block_required": False, "urgency": "MEDIUM", "status": "PENDING"},
                {"request_id": "REQ-TRD-004", "department": "Traction Distribution", "corridor_id": "COR-NDLS-GZB", "asset_id": "AST-OHE-101", "required_duration_minutes": 90, "earliest_start_minute": 780, "latest_end_minute": 1020, "is_traffic_block_required": False, "is_power_block_required": True, "urgency": "LOW", "status": "PENDING"},
                {"request_id": "REQ-SNT-003", "department": "Signalling & Telecom", "corridor_id": "COR-NDLS-GZB", "asset_id": "AST-SNT-101", "required_duration_minutes": 60, "earliest_start_minute": 1080, "latest_end_minute": 1320, "is_traffic_block_required": False, "is_power_block_required": False, "urgency": "LOW", "status": "PENDING"},

                # COR-CSMT-KYN Workload
                {"request_id": "REQ-ENG-002", "department": "Engineering", "corridor_id": "COR-CSMT-KYN", "asset_id": "AST-TRK-201", "required_duration_minutes": 150, "earliest_start_minute": 60, "latest_end_minute": 400, "is_traffic_block_required": True, "is_power_block_required": False, "urgency": "HIGH", "status": "PENDING"},
                {"request_id": "REQ-TRD-002", "department": "Traction Distribution", "corridor_id": "COR-CSMT-KYN", "asset_id": "AST-OHE-201", "required_duration_minutes": 90, "earliest_start_minute": 180, "latest_end_minute": 450, "is_traffic_block_required": True, "is_power_block_required": True, "urgency": "MEDIUM", "status": "PENDING"},
                {"request_id": "REQ-SNT-201", "department": "Signalling & Telecom", "corridor_id": "COR-CSMT-KYN", "asset_id": "AST-SNT-201", "required_duration_minutes": 60, "earliest_start_minute": 120, "latest_end_minute": 300, "is_traffic_block_required": False, "is_power_block_required": False, "urgency": "CRITICAL", "status": "PENDING"},
                {"request_id": "REQ-ENG-202", "department": "Engineering", "corridor_id": "COR-CSMT-KYN", "asset_id": "AST-TRK-202", "required_duration_minutes": 90, "earliest_start_minute": 480, "latest_end_minute": 720, "is_traffic_block_required": True, "is_power_block_required": False, "urgency": "HIGH", "status": "PENDING"},
                {"request_id": "REQ-TRD-202", "department": "Traction Distribution", "corridor_id": "COR-CSMT-KYN", "asset_id": "AST-OHE-202", "required_duration_minutes": 90, "earliest_start_minute": 600, "latest_end_minute": 900, "is_traffic_block_required": False, "is_power_block_required": True, "urgency": "MEDIUM", "status": "PENDING"},
                {"request_id": "REQ-SNT-202", "department": "Signalling & Telecom", "corridor_id": "COR-CSMT-KYN", "asset_id": "AST-SNT-201", "required_duration_minutes": 60, "earliest_start_minute": 720, "latest_end_minute": 960, "is_traffic_block_required": False, "is_power_block_required": False, "urgency": "LOW", "status": "PENDING"},
            ]
            for req in demo_requests:
                self._local_requests[req["request_id"]] = {**req, "created_at": now, "updated_at": now}

    # ==========================================
    # CORRIDORS CRUD
    # ==========================================
    def list_corridors(self) -> List[Dict[str, Any]]:
        if self.client:
            res = self.client.table("corridors").select("*").execute()
            return res.data
        return list(self._local_corridors.values())

    def get_corridor(self, corridor_id: str) -> Optional[Dict[str, Any]]:
        if self.client:
            res = self.client.table("corridors").select("*").eq("corridor_id", corridor_id).execute()
            return res.data[0] if res.data else None
        return self._local_corridors.get(corridor_id)

    def create_corridor(self, data: Dict[str, Any]) -> Dict[str, Any]:
        c_id = data["corridor_id"]
        now = datetime.now(timezone.utc).isoformat()
        record = {**data, "created_at": now, "updated_at": now}
        if self.client:
            res = self.client.table("corridors").insert(record).execute()
            return res.data[0]
        self._local_corridors[c_id] = record
        return record

    def update_corridor(self, corridor_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        now = datetime.now(timezone.utc).isoformat()
        patch = {**updates, "updated_at": now}
        if self.client:
            res = self.client.table("corridors").update(patch).eq("corridor_id", corridor_id).execute()
            return res.data[0] if res.data else None
        if corridor_id not in self._local_corridors:
            return None
        self._local_corridors[corridor_id].update(patch)
        return self._local_corridors[corridor_id]

    def delete_corridor(self, corridor_id: str) -> bool:
        if self.client:
            res = self.client.table("corridors").delete().eq("corridor_id", corridor_id).execute()
            return len(res.data) > 0
        if corridor_id in self._local_corridors:
            del self._local_corridors[corridor_id]
            return True
        return False

    # ==========================================
    # ASSETS CRUD
    # ==========================================
    def list_assets(
        self,
        corridor_id: Optional[str] = None,
        department: Optional[str] = None,
        track_type: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        if self.client:
            q = self.client.table("assets").select("*")
            if corridor_id:
                q = q.eq("corridor_id", corridor_id)
            if department:
                q = q.eq("department", department)
            if track_type:
                q = q.eq("track_type", track_type)
            return q.execute().data
        items = list(self._local_assets.values())
        if corridor_id:
            items = [a for a in items if a.get("corridor_id") == corridor_id]
        if department:
            items = [a for a in items if a.get("department") == department]
        if track_type:
            items = [a for a in items if a.get("track_type") == track_type]
        return items

    def get_asset(self, asset_id: str) -> Optional[Dict[str, Any]]:
        if self.client:
            res = self.client.table("assets").select("*").eq("asset_id", asset_id).execute()
            return res.data[0] if res.data else None
        return self._local_assets.get(asset_id)

    def create_asset(self, data: Dict[str, Any]) -> Dict[str, Any]:
        a_id = data["asset_id"]
        now = datetime.now(timezone.utc).isoformat()
        record = {**data, "created_at": now, "updated_at": now}
        if self.client:
            res = self.client.table("assets").insert(record).execute()
            return res.data[0]
        self._local_assets[a_id] = record
        return record

    def update_asset(self, asset_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        now = datetime.now(timezone.utc).isoformat()
        patch = {**updates, "updated_at": now}
        if self.client:
            res = self.client.table("assets").update(patch).eq("asset_id", asset_id).execute()
            return res.data[0] if res.data else None
        if asset_id not in self._local_assets:
            return None
        self._local_assets[asset_id].update(patch)
        return self._local_assets[asset_id]

    def delete_asset(self, asset_id: str) -> bool:
        if self.client:
            res = self.client.table("assets").delete().eq("asset_id", asset_id).execute()
            return len(res.data) > 0
        if asset_id in self._local_assets:
            del self._local_assets[asset_id]
            return True
        return False

    # ==========================================
    # TRAINS CRUD
    # ==========================================
    def list_trains(
        self,
        corridor_id: Optional[str] = None,
        start_minute: Optional[int] = None,
        end_minute: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        if self.client:
            q = self.client.table("trains").select("*")
            if corridor_id:
                q = q.eq("corridor_id", corridor_id)
            if start_minute is not None:
                q = q.gte("exit_minute", start_minute)
            if end_minute is not None:
                q = q.lte("entry_minute", end_minute)
            return q.execute().data
        items = list(self._local_trains.values())
        if corridor_id:
            items = [t for t in items if t.get("corridor_id") == corridor_id]
        if start_minute is not None:
            items = [t for t in items if t.get("exit_minute", 1440) >= start_minute]
        if end_minute is not None:
            items = [t for t in items if t.get("entry_minute", 0) <= end_minute]
        return items

    def get_train(self, train_id: str) -> Optional[Dict[str, Any]]:
        if self.client:
            res = self.client.table("trains").select("*").eq("train_id", train_id).execute()
            return res.data[0] if res.data else None
        return self._local_trains.get(train_id)

    def create_train(self, data: Dict[str, Any]) -> Dict[str, Any]:
        t_id = data["train_id"]
        now = datetime.now(timezone.utc).isoformat()
        record = {**data, "created_at": now, "updated_at": now}
        if self.client:
            res = self.client.table("trains").insert(record).execute()
            return res.data[0]
        self._local_trains[t_id] = record
        return record

    def update_train(self, train_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        now = datetime.now(timezone.utc).isoformat()
        patch = {**updates, "updated_at": now}
        if self.client:
            res = self.client.table("trains").update(patch).eq("train_id", train_id).execute()
            return res.data[0] if res.data else None
        if train_id not in self._local_trains:
            return None
        self._local_trains[train_id].update(patch)
        return self._local_trains[train_id]

    def delete_train(self, train_id: str) -> bool:
        if self.client:
            res = self.client.table("trains").delete().eq("train_id", train_id).execute()
            return len(res.data) > 0
        if train_id in self._local_trains:
            del self._local_trains[train_id]
            return True
        return False

    # ==========================================
    # MAINTENANCE BLOCK REQUESTS CRUD
    # ==========================================
    def list_requests(
        self,
        corridor_id: Optional[str] = None,
        department: Optional[str] = None,
        status: Optional[str] = None,
        urgency: Optional[str] = None,
        asset_id: Optional[str] = None,
        start_minute: Optional[int] = None,
        end_minute: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        if self.client:
            q = self.client.table("maintenance_block_requests").select("*")
            if corridor_id:
                q = q.eq("corridor_id", corridor_id)
            if department:
                q = q.eq("department", department)
            if status:
                statuses = [s.strip() for s in status.split(",") if s.strip()]
                if len(statuses) > 1:
                    q = q.in_("status", statuses)
                elif len(statuses) == 1:
                    q = q.eq("status", statuses[0])
            if urgency:
                q = q.eq("urgency", urgency)
            if asset_id:
                q = q.eq("asset_id", asset_id)
            if start_minute is not None:
                q = q.gte("latest_end_minute", start_minute)
            if end_minute is not None:
                q = q.lte("earliest_start_minute", end_minute)
            return q.execute().data

        items = list(self._local_requests.values())
        if corridor_id:
            items = [r for r in items if r.get("corridor_id") == corridor_id]
        if department:
            items = [r for r in items if r.get("department") == department]
        if status:
            allowed_statuses = {s.strip() for s in status.split(",") if s.strip()}
            items = [r for r in items if r.get("status") in allowed_statuses]
        if urgency:
            items = [r for r in items if r.get("urgency") == urgency]
        if asset_id:
            items = [r for r in items if r.get("asset_id") == asset_id]
        if start_minute is not None:
            items = [r for r in items if r.get("latest_end_minute", 1440) >= start_minute]
        if end_minute is not None:
            items = [r for r in items if r.get("earliest_start_minute", 0) <= end_minute]
        return items

    def get_request(self, request_id: str) -> Optional[Dict[str, Any]]:
        if self.client:
            res = self.client.table("maintenance_block_requests").select("*").eq("request_id", request_id).execute()
            return res.data[0] if res.data else None
        return self._local_requests.get(request_id)

    def create_request(self, data: Dict[str, Any]) -> Dict[str, Any]:
        r_id = data["request_id"]
        now = datetime.now(timezone.utc).isoformat()
        record = {
            "status": "PENDING",
            **data,
            "created_at": now,
            "updated_at": now,
        }
        if self.client:
            res = self.client.table("maintenance_block_requests").insert(record).execute()
            return res.data[0]
        self._local_requests[r_id] = record
        return record

    def update_request(self, request_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        now = datetime.now(timezone.utc).isoformat()
        patch = {**updates, "updated_at": now}
        if self.client:
            res = self.client.table("maintenance_block_requests").update(patch).eq("request_id", request_id).execute()
            return res.data[0] if res.data else None
        if request_id not in self._local_requests:
            return None
        self._local_requests[request_id].update(patch)
        return self._local_requests[request_id]

    def delete_request(self, request_id: str) -> bool:
        """Deletes only if logically safe (status is PENDING or REJECTED)."""
        req = self.get_request(request_id)
        if not req:
            return False
        if req.get("status") in ("SCHEDULED", "APPROVED"):
            raise ValueError(f"Cannot delete request '{request_id}' with active status '{req.get('status')}'.")

        if self.client:
            res = self.client.table("maintenance_block_requests").delete().eq("request_id", request_id).execute()
            return len(res.data) > 0
        if request_id in self._local_requests:
            del self._local_requests[request_id]
            return True
        return False

    # ==========================================
    # BLOCK PLANS & PLAN ITEMS CRUD
    # ==========================================
    def list_plans(self, status: Optional[str] = None, corridor_id: Optional[str] = None) -> List[Dict[str, Any]]:
        if self.client:
            q = self.client.table("block_plans").select("*")
            if status:
                q = q.eq("status", status)
            plans = q.execute().data
            if corridor_id:
                items_res = self.client.table("block_plan_items").select("plan_id").eq("corridor_id", corridor_id).execute()
                matching_plan_ids = {it["plan_id"] for it in items_res.data}
                plans = [p for p in plans if p["plan_id"] in matching_plan_ids]
            return plans

        items = list(self._local_plans.values())
        if status:
            items = [p for p in items if p.get("status") == status]
        if corridor_id:
            matching_ids = {
                p_id for p_id, p_items in self._local_plan_items.items()
                if any(it.get("corridor_id") == corridor_id for it in p_items)
            }
            items = [p for p in items if p.get("plan_id") in matching_ids]
        return items

    def get_plan(self, plan_id: str, include_items: bool = True) -> Optional[Dict[str, Any]]:
        if self.client:
            res = self.client.table("block_plans").select("*").eq("plan_id", plan_id).execute()
            if not res.data:
                return None
            plan = res.data[0]
            if include_items:
                items_res = self.client.table("block_plan_items").select("*").eq("plan_id", plan_id).execute()
                plan["items"] = items_res.data
            return plan

        plan = self._local_plans.get(plan_id)
        if not plan:
            return None
        out = dict(plan)
        if include_items:
            out["items"] = self._local_plan_items.get(plan_id, [])
        return out

    def create_plan(self, plan_data: Dict[str, Any], items_data: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
        p_id = plan_data["plan_id"]
        now = datetime.now(timezone.utc).isoformat()
        plan_record = {
            "status": "DRAFT",
            **plan_data,
            "created_at": now,
            "updated_at": now,
        }

        if self.client:
            res_plan = self.client.table("block_plans").insert(plan_record).execute()
            created_plan = res_plan.data[0]
            saved_items = []
            if items_data:
                formatted_items = [{**it, "plan_id": p_id, "created_at": now, "updated_at": now} for it in items_data]
                res_items = self.client.table("block_plan_items").insert(formatted_items).execute()
                saved_items = res_items.data
                for it in items_data:
                    req_id = it.get("request_id")
                    if req_id and it.get("status", "SCHEDULED") == "SCHEDULED":
                        try:
                            self.client.table("maintenance_block_requests").update({
                                "status": "SCHEDULED",
                                "updated_at": now,
                            }).eq("request_id", req_id).execute()
                        except Exception:
                            pass
            created_plan["items"] = saved_items
            return created_plan

        self._local_plans[p_id] = plan_record
        saved_items = []
        if items_data:
            for it in items_data:
                saved_items.append({
                    "id": str(uuid.uuid4()),
                    "plan_id": p_id,
                    "created_at": now,
                    "updated_at": now,
                    **it,
                })
                req_id = it.get("request_id")
                if req_id and it.get("status", "SCHEDULED") == "SCHEDULED":
                    if req_id in self._local_requests:
                        self._local_requests[req_id]["status"] = "SCHEDULED"
                        self._local_requests[req_id]["updated_at"] = now
        self._local_plan_items[p_id] = saved_items
        out = dict(plan_record)
        out["items"] = saved_items
        return out

    def update_plan_status(
        self,
        plan_id: str,
        status: str,
        approved_by: Optional[str] = None,
        rejection_reason: Optional[str] = None,
        review_record: Optional[Dict[str, Any]] = None,
    ) -> Optional[Dict[str, Any]]:
        now = datetime.now(timezone.utc).isoformat()
        current = self.get_plan(plan_id, include_items=False)
        if not current:
            return None

        eval_summary = dict(current.get("evaluation_summary") or {})
        if review_record:
            history = list(eval_summary.get("review_history", []))
            history.append(review_record)
            eval_summary["review_history"] = history

        patch: Dict[str, Any] = {
            "status": status,
            "evaluation_summary": eval_summary,
            "updated_at": now,
        }
        if status == "APPROVED":
            patch["approved_at"] = now
            if approved_by:
                patch["approved_by"] = approved_by
        elif status == "REJECTED" and rejection_reason:
            patch["rejection_reason"] = rejection_reason

        if status == "REJECTED":
            plan_with_items = self.get_plan(plan_id, include_items=True)
            if plan_with_items and "items" in plan_with_items:
                for it in plan_with_items["items"]:
                    req_id = it.get("request_id")
                    if req_id and it.get("status", "SCHEDULED") == "SCHEDULED":
                        try:
                            self.update_request(req_id, {"status": "PENDING"})
                        except Exception:
                            pass

        if self.client:
            res = self.client.table("block_plans").update(patch).eq("plan_id", plan_id).execute()
            return self.get_plan(plan_id) if res.data else None

        if plan_id not in self._local_plans:
            return None
        self._local_plans[plan_id].update(patch)
        return self.get_plan(plan_id)

    def delete_plan(self, plan_id: str) -> bool:
        """Deletes plan only if logically safe (status is DRAFT or REJECTED)."""
        plan = self.get_plan(plan_id, include_items=True)
        if not plan:
            return False
        if plan.get("status") in ("APPROVED", "PENDING_APPROVAL", "UNDER_REVIEW"):
            raise ValueError(f"Cannot delete plan '{plan_id}' with status '{plan.get('status')}'. Only DRAFT or REJECTED plans can be removed.")

        if "items" in plan:
            for it in plan["items"]:
                req_id = it.get("request_id")
                if req_id and it.get("status", "SCHEDULED") == "SCHEDULED":
                    try:
                        self.update_request(req_id, {"status": "PENDING"})
                    except Exception:
                        pass

        if self.client:
            res = self.client.table("block_plans").delete().eq("plan_id", plan_id).execute()
            return len(res.data) > 0
        if plan_id in self._local_plans:
            del self._local_plans[plan_id]
            self._local_plan_items.pop(plan_id, None)
            return True
        return False

    def update_plan_validation(
        self,
        plan_id: str,
        is_feasible: bool,
        evaluation_summary: Dict[str, Any],
        items_conflict_map: Optional[Dict[str, List[str]]] = None,
    ) -> Optional[Dict[str, Any]]:
        now = datetime.now(timezone.utc).isoformat()
        patch: Dict[str, Any] = {
            "is_feasible": is_feasible,
            "evaluation_summary": evaluation_summary,
            "updated_at": now,
        }
        if self.client:
            self.client.table("block_plans").update(patch).eq("plan_id", plan_id).execute()
            if items_conflict_map:
                for req_id, flags in items_conflict_map.items():
                    self.client.table("block_plan_items").update({
                        "conflict_flags": flags,
                        "updated_at": now,
                    }).eq("plan_id", plan_id).eq("request_id", req_id).execute()
            return self.get_plan(plan_id)

        if plan_id not in self._local_plans:
            return None
        self._local_plans[plan_id].update(patch)
        if items_conflict_map and plan_id in self._local_plan_items:
            for it in self._local_plan_items[plan_id]:
                if it["request_id"] in items_conflict_map:
                    it["conflict_flags"] = items_conflict_map[it["request_id"]]
                    it["updated_at"] = now
        return self.get_plan(plan_id)

    def save_plan_explanation(self, plan_id: str, explanation: Dict[str, Any]) -> None:
        self._local_explanations[plan_id] = explanation
        if plan_id in self._local_plans:
            eval_s = self._local_plans[plan_id].setdefault("evaluation_summary", {})
            eval_s["unified_explanation"] = explanation

    def get_plan_explanation(self, plan_id: str) -> Optional[Dict[str, Any]]:
        if plan_id in self._local_explanations:
            return self._local_explanations[plan_id]
        plan = self.get_plan(plan_id, include_items=False)
        if plan and "evaluation_summary" in plan:
            return plan["evaluation_summary"].get("unified_explanation")
        return None

    def get_plan_item(self, plan_id: str, item_id: str) -> Optional[Dict[str, Any]]:
        plan = self.get_plan(plan_id, include_items=True)
        if not plan or "items" not in plan:
            return None
        for it in plan["items"]:
            if str(it.get("id")) == str(item_id) or str(it.get("request_id")) == str(item_id):
                return it
        return None

    def update_plan_item(self, plan_id: str, item_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        now = datetime.now(timezone.utc).isoformat()
        patch = {**updates, "updated_at": now}
        item = self.get_plan_item(plan_id, item_id)
        if not item:
            return None
        target_id = item.get("id")
        target_req_id = item.get("request_id")

        if "status" in updates and target_req_id:
            new_item_status = updates["status"]
            if new_item_status in ("DEFERRED", "REJECTED"):
                try:
                    self.update_request(target_req_id, {"status": "PENDING"})
                except Exception:
                    pass
            elif new_item_status == "SCHEDULED":
                try:
                    self.update_request(target_req_id, {"status": "SCHEDULED"})
                except Exception:
                    pass

        if self.client:
            q = self.client.table("block_plan_items").update(patch)
            if target_id:
                res = q.eq("id", target_id).execute()
            else:
                res = q.eq("plan_id", plan_id).eq("request_id", target_req_id).execute()
            return res.data[0] if res.data else None

        if plan_id in self._local_plan_items:
            for it in self._local_plan_items[plan_id]:
                if (target_id and it.get("id") == target_id) or it.get("request_id") == target_req_id:
                    it.update(patch)
                    return it
        return None

    def list_plan_items(
        self,
        plan_id: Optional[str] = None,
        corridor_id: Optional[str] = None,
        asset_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        if self.client:
            q = self.client.table("block_plan_items").select("*")
            if plan_id:
                q = q.eq("plan_id", plan_id)
            if corridor_id:
                q = q.eq("corridor_id", corridor_id)
            if asset_id:
                q = q.eq("asset_id", asset_id)
            return q.execute().data

        results = []
        for p_id, items in self._local_plan_items.items():
            if plan_id and p_id != plan_id:
                continue
            for it in items:
                if corridor_id and it.get("corridor_id") != corridor_id:
                    continue
                if asset_id and it.get("asset_id") != asset_id:
                    continue
                results.append(it)
        return results


    # ==========================================
    # PROFILES CRUD
    # ==========================================
    def list_profiles(self) -> List[Dict[str, Any]]:
        if self.client:
            res = self.client.table("profiles").select("*").execute()
            return res.data
        return list(self._local_profiles.values())

    def get_profile(self, user_id: str) -> Optional[Dict[str, Any]]:
        if self.client:
            res = self.client.table("profiles").select("*").eq("id", user_id).execute()
            return res.data[0] if res.data else None
        return self._local_profiles.get(user_id)

    def create_profile(self, data: Dict[str, Any]) -> Dict[str, Any]:
        u_id = data.get("id") or str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        record = {**data, "id": u_id, "created_at": now, "updated_at": now}
        if self.client:
            res = self.client.table("profiles").insert(record).execute()
            return res.data[0]
        self._local_profiles[u_id] = record
        return record

    def update_profile(self, user_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        now = datetime.now(timezone.utc).isoformat()
        patch = {**updates, "updated_at": now}
        if self.client:
            res = self.client.table("profiles").update(patch).eq("id", user_id).execute()
            return res.data[0] if res.data else None
        if user_id not in self._local_profiles:
            return None
        self._local_profiles[user_id].update(patch)
        return self._local_profiles[user_id]

    def delete_profile(self, user_id: str) -> bool:
        if self.client:
            res = self.client.table("profiles").delete().eq("id", user_id).execute()
            return len(res.data) > 0
        if user_id in self._local_profiles:
            del self._local_profiles[user_id]
            return True
        return False

    # ==========================================
    # AI ENGINE COMPATIBILITY / DATASET CONVERSION
    # ==========================================
    def build_planning_dataset(
        self,
        corridor_id: Optional[str] = None,
        department: Optional[str] = None,
        status: Optional[str] = "PENDING,APPROVED",
    ) -> RailwayPlanningDataset:
        """
        Converts persisted operational records from Supabase/repository into
        the validated RailwayPlanningDataset expected by the existing AI engine.
        """
        raw_corridors = self.list_corridors()
        if corridor_id:
            raw_corridors = [c for c in raw_corridors if c["corridor_id"] == corridor_id]
        if not raw_corridors:
            raise ValueError(f"No corridor found matching '{corridor_id}'." if corridor_id else "No corridors configured in database.")
        corridor_ids = {c["corridor_id"] for c in raw_corridors}

        raw_assets = self.list_assets(corridor_id=corridor_id, department=department)
        raw_assets = [a for a in raw_assets if a["corridor_id"] in corridor_ids]

        raw_trains = self.list_trains(corridor_id=corridor_id)
        raw_trains = [t for t in raw_trains if t["corridor_id"] in corridor_ids]

        raw_requests = self.list_requests(corridor_id=corridor_id, department=department, status=status)
        raw_requests = [r for r in raw_requests if r["corridor_id"] in corridor_ids]

        corridors = [
            CorridorAvailability(
                corridor_id=c["corridor_id"],
                name=c["name"],
                length_km=float(c["length_km"]),
                is_electrified=bool(c.get("is_electrified", True)),
                available_start_minute=int(c.get("available_start_minute", 0)),
                available_end_minute=int(c.get("available_end_minute", 1440)),
                max_parallel_blocks=int(c.get("max_parallel_blocks", 2)),
            )
            for c in raw_corridors
        ]

        assets = [
            RailwayAsset(
                asset_id=a["asset_id"],
                corridor_id=a["corridor_id"],
                department=Department(a["department"]),
                start_km=float(a["start_km"]),
                end_km=float(a["end_km"]),
                track_type=TrackType(a.get("track_type", "BOTH")),
            )
            for a in raw_assets
        ]

        trains = [
            TrainTraffic(
                train_id=t["train_id"],
                train_type=t["train_type"],
                corridor_id=t["corridor_id"],
                entry_minute=int(t["entry_minute"]),
                exit_minute=int(t["exit_minute"]),
                priority_level=int(t.get("priority_level", 2)),
            )
            for t in raw_trains
        ]

        requests = [
            MaintenanceBlockRequest(
                request_id=r["request_id"],
                department=Department(r["department"]),
                corridor_id=r["corridor_id"],
                asset_id=r["asset_id"],
                required_duration_minutes=int(r["required_duration_minutes"]),
                earliest_start_minute=int(r.get("earliest_start_minute", 0)),
                latest_end_minute=int(r.get("latest_end_minute", 1440)),
                is_power_block_required=bool(r.get("is_power_block_required", False)),
                is_traffic_block_required=bool(r.get("is_traffic_block_required", True)),
                urgency=Priority(r.get("urgency", "MEDIUM")),
                linked_defect_id=r.get("linked_defect_id"),
            )
            for r in raw_requests
        ]

        return RailwayPlanningDataset(
            corridors=corridors,
            assets=assets,
            defects=[],
            trains=trains,
            block_requests=requests,
            constraints=PlanningConstraints(),
        )


# Global singleton repository instance
repository = RailwayRepository()
