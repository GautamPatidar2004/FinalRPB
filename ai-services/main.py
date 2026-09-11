import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from config.settings import settings
from api.routes import router
from models.priority_model import MODEL_PATH

app = FastAPI(
    title="Railway Block Planning AI Engine",
    version=settings.version,
    description="Production AI & Optimization service for railway block maintenance planning.",
)

# Cross-Origin Resource Sharing for frontend/backend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["System"])
def root_health():
    """Root-level health probe for Render service monitoring."""
    model_ready = MODEL_PATH.exists()
    return {
        "status": "healthy" if model_ready else "degraded",
        "service": settings.service_name,
        "version": settings.version,
        "environment": settings.environment,
        "model_loaded": model_ready,
    }


app.include_router(router, prefix="/api/v1")


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=False,
        log_level=settings.log_level.lower(),
    )