from .corridors import router as corridors_router
from .assets import router as assets_router
from .trains import router as trains_router
from .requests import router as requests_router
from .plans import router as plans_router
from .profiles import router as profiles_router
from .availability import router as availability_router
from .ingest import router as ingest_router
from .dataset import router as dataset_router
from .dashboard import router as dashboard_router

__all__ = [
    "corridors_router",
    "assets_router",
    "trains_router",
    "requests_router",
    "plans_router",
    "profiles_router",
    "availability_router",
    "ingest_router",
    "dataset_router",
    "dashboard_router",
]
