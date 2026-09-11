from fastapi import APIRouter, HTTPException
from config.settings import settings
from schemas.base import PipelineInputData, PipelineResult
from schemas.railway import RailwayPlanningDataset
from schemas.optimization import OptimizedPlanResult
from pipeline.base import BasePipeline
from planning.engine import PlanningEngine
from planning.optimizer import RailwayPlanOptimizer
from models.priority_model import MODEL_PATH

from api.v1 import (
    corridors_router,
    assets_router,
    trains_router,
    requests_router,
    plans_router,
    profiles_router,
    availability_router,
    ingest_router,
    dataset_router,
    dashboard_router,
)

router = APIRouter()

# Mount backend CRUD & operational data sub-routers
router.include_router(corridors_router)
router.include_router(assets_router)
router.include_router(trains_router)
router.include_router(requests_router)
router.include_router(plans_router)
router.include_router(profiles_router)
router.include_router(availability_router)
router.include_router(ingest_router)
router.include_router(dataset_router)
router.include_router(dashboard_router)

planning_engine = PlanningEngine()
default_pipeline = BasePipeline(planning_engine=planning_engine)
plan_optimizer = RailwayPlanOptimizer(
    priority_model=planning_engine.priority_model,
    evaluator=planning_engine.evaluator,
    constraint_engine=planning_engine.constraint_engine,
)


@router.get("/health", tags=["System"])
def health_check():
    """Production health check reporting service status and model readiness."""
    model_ready = MODEL_PATH.exists() and (planning_engine.priority_model.model is not None)
    return {
        "status": "healthy" if model_ready else "degraded",
        "service": settings.service_name,
        "version": settings.version,
        "environment": settings.environment,
        "model_loaded": model_ready,
    }


@router.post("/optimize", response_model=OptimizedPlanResult, tags=["Planning"])
def optimize_block_plan(dataset: RailwayPlanningDataset):
    """
    Direct production inference endpoint.
    Accepts validated RailwayPlanningDataset, runs full multi-strategy planning,
    constraint feasibility enforcement, replanning, and returns the optimized plan.
    """
    try:
        return plan_optimizer.optimize(dataset)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Planning optimization error: {str(exc)}")


@router.post("/plan", response_model=PipelineResult, tags=["Planning"])
def execute_plan(input_data: PipelineInputData):
    """Pipeline integration endpoint accepting wrapped input payload."""
    return default_pipeline.run(input_data)


from fastapi import Request
from data.csv_handler import parse_production_requests_csv


@router.post("/plan/csv", response_model=OptimizedPlanResult, tags=["Planning"])
async def execute_plan_from_csv(request: Request):
    """
    Production CSV inference endpoint:
    Railway CSV input -> validation -> existing trained model -> planning engine -> optimized block plan.
    """
    body_bytes = await request.body()
    csv_text = body_bytes.decode("utf-8").strip()
    if not csv_text:
        raise HTTPException(status_code=400, detail="Uploaded CSV body cannot be empty.")
    try:
        dataset = parse_production_requests_csv(csv_text)
        return plan_optimizer.optimize(dataset)
    except ValueError as val_err:
        raise HTTPException(status_code=422, detail=f"CSV validation error: {str(val_err)}")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Planning optimization error: {str(exc)}")
