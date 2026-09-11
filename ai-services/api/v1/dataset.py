from typing import Optional
from fastapi import APIRouter, HTTPException, Query, status
from schemas.railway import Department, RailwayPlanningDataset
from schemas.optimization import OptimizedPlanResult
from db.repository import repository
from planning.engine import PlanningEngine
from planning.optimizer import RailwayPlanOptimizer

router = APIRouter(prefix="/dataset", tags=["AI Dataset & Planning Bridge"])

# Reuse existing planning engine and optimizer singleton
planning_engine = PlanningEngine()
plan_optimizer = RailwayPlanOptimizer(
    priority_model=planning_engine.priority_model,
    evaluator=planning_engine.evaluator,
    constraint_engine=planning_engine.constraint_engine,
)


@router.get("", response_model=RailwayPlanningDataset)
def get_operational_planning_dataset(
    corridor_id: Optional[str] = Query(None, description="Target corridor identifier"),
    department: Optional[Department] = Query(None, description="Department filter"),
    status_filter: str = Query("PENDING", alias="status", description="Request status filter (default: PENDING)"),
):
    """
    Extracts and converts persisted operational Railway records (corridors, assets, trains, requests)
    into the standardized RailwayPlanningDataset format required by the AI Planning Engine.
    """
    dept_str = department.value if department else None
    try:
        dataset = repository.build_planning_dataset(
            corridor_id=corridor_id,
            department=dept_str,
            status=status_filter,
        )
        if not dataset.block_requests:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No matching maintenance block requests found in database for the given criteria.",
            )
        return dataset
    except ValueError as val_err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(val_err))
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to assemble operational planning dataset: {str(exc)}",
        )


@router.post("/optimize", response_model=OptimizedPlanResult)
def optimize_persisted_operational_data(
    corridor_id: Optional[str] = Query(None, description="Target corridor identifier"),
    department: Optional[Department] = Query(None, description="Department filter"),
    status_filter: str = Query("PENDING", alias="status", description="Request status filter (default: PENDING)"),
):
    """
    Directly triggers the AI Optimization Engine on current persisted database records.
    Bridges persistent operational state to multi-strategy constraint optimization and replanning.
    """
    dept_str = department.value if department else None
    try:
        dataset = repository.build_planning_dataset(
            corridor_id=corridor_id,
            department=dept_str,
            status=status_filter,
        )
        if not dataset.block_requests:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot run optimization: No pending maintenance requests exist in database.",
            )
        return plan_optimizer.optimize(dataset)
    except ValueError as val_err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(val_err))
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Planning optimization failed: {str(exc)}",
        )
