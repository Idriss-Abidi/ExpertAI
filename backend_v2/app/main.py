"""
Main FastAPI application.
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .core.config import settings
from .db.database import init_db, close_db
from .api import api_router
from .services.similarity_service import rag_service


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    # Startup
    await init_db()
    print("✅ Database connection established and tables verified!")
    
    # Initialize RAG service
    try:
        await rag_service.initialize()
        print("✅ RAG service initialized successfully!")
    except Exception as e:
        print(f"⚠️ RAG service initialization failed: {e}")
        print("📝 Similarity search endpoints may not work properly")
    
    yield
    # Shutdown
    await close_db()


def create_application() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title=settings.APP_NAME,
        description="Modern API for research database management",
        version=settings.APP_VERSION,
        lifespan=lifespan,
        openapi_url=f"{settings.API_V1_STR}/openapi.json"
    )

    # Add CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.BACKEND_CORS_ORIGINS,
        allow_origin_regex=".*",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Include API router
    app.include_router(api_router, prefix=settings.API_V1_STR)

    return app


# Create the application instance
app = create_application()


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "message": "Database Management API v2",
        "version": settings.APP_VERSION,
        "status": "running",
        "documentation": "/docs",
        "endpoints": {
            "utilisateurs": f"{settings.API_V1_STR}/utilisateurs",
            "chercheurs": f"{settings.API_V1_STR}/chercheurs",
            "api_keys": f"{settings.API_V1_STR}/cles-api",
            "auth": f"{settings.API_V1_STR}/auth",
            "similarity": f"{settings.API_V1_STR}/similarity"
        }
    }


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "version": settings.APP_VERSION}
