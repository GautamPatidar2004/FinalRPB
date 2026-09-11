from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from data.ingestion import ingest_requests_csv, ingest_requests_batch

router = APIRouter(prefix="/ingest", tags=["Bulk Ingestion"])


class BatchIngestPayload(BaseModel):
    requests: List[Dict[str, Any]] = Field(..., description="List of maintenance request dictionaries")
    skip_duplicates: bool = Field(default=True, description="Skip duplicate request IDs instead of rejecting")


@router.post("/csv", status_code=status.HTTP_201_CREATED)
async def bulk_ingest_csv(
    request: Request,
    skip_duplicates: bool = Query(True, description="Whether to skip duplicate records"),
):
    """
    In-memory bulk ingestion of maintenance block requests via CSV.
    Validates required columns, enums, relational foreign keys, and duration constraints.
    Prevents accidental duplicates and never permanently stores the uploaded CSV file.
    """
    body_bytes = await request.body()
    csv_text = body_bytes.decode("utf-8")

    clean_text = csv_text.strip()
    if not clean_text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="CSV payload cannot be empty.",
        )

    success, result = ingest_requests_csv(clean_text, skip_duplicates=skip_duplicates)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=result,
        )

    return result


@router.post("/batch", status_code=status.HTTP_201_CREATED)
def bulk_ingest_batch(payload: BatchIngestPayload):
    """
    Bulk ingestion of maintenance block requests via structured JSON batch.
    Enforces relational integrity with assets and corridors before committing to storage.
    """
    if not payload.requests:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Batch requests list cannot be empty.",
        )

    success, result = ingest_requests_batch(payload.requests, skip_duplicates=payload.skip_duplicates)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=result,
        )

    return result
