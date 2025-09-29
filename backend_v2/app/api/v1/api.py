"""
API v1 router.
"""
from fastapi import APIRouter

from .endpoints import auth, users, researchers, api_keys, similarity
from ...core.config import settings

api_router = APIRouter()

# Include all endpoint routers
api_router.include_router(
    auth.router,
    prefix="/auth",
    tags=["authentication"]
)

api_router.include_router(
    users.router,
    prefix="/utilisateurs",
    tags=["users"]
)

api_router.include_router(
    researchers.router,
    prefix="/chercheurs",
    tags=["researchers"]
)

api_router.include_router(
    api_keys.router,
    prefix="/cles-api",
    tags=["api-keys"]
)

api_router.include_router(
    similarity.router,
    prefix="/similarity",
    tags=["similarity-search"]
)
