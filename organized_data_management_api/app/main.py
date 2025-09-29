"""
Main FastAPI application
"""

import os
import asyncio
import logging
from datetime import datetime
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Disable OpenAI tracing to avoid network warnings
os.environ["OPENAI_API_TRACING"] = "false"

from .core.config import (
    PROJECT_NAME, BACKEND_CORS_ORIGINS, LOG_LEVEL
)
from .services.mcp_service import initialize_mcp_servers, sync_databases_from_mcp
from .services.agent_service import initialize_orcid_server
import os
from .routes import database, orcid, tasks, system, chat

# Configure logging
logging.basicConfig(level=getattr(logging, LOG_LEVEL.upper()))
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan management"""
    # Startup
    logger.info("Starting Research Database Management API...")
    
    # Try to initialize MCP servers on startup, but don't fail if they're not ready
    try:
        await initialize_mcp_servers()
        logger.info("MCP servers initialized successfully")
    except Exception as e:
        logger.warning(f"Failed to initialize MCP servers on startup: {e}")
        logger.info("MCP servers will be initialized on first use")
    
    # Optionally initialize ORCID server (can be disabled to avoid startup failure)
    enable_orcid = os.getenv("ENABLE_ORCID_INIT", "false").lower() in {"1", "true", "yes"}
    if enable_orcid:
        try:
            await initialize_orcid_server()
            logger.info("ORCID server initialized successfully")
        except Exception as e:
            logger.warning(f"Failed to initialize ORCID server on startup: {e}")
            logger.info("ORCID server will be initialized on first use")
    else:
        logger.info("Skipping ORCID initialization on startup (ENABLE_ORCID_INIT is false)")
    
    # Optionally sync databases from MCP server on startup
    enable_sync = os.getenv("ENABLE_MCP_SYNC_ON_START", "false").lower() in {"1", "true", "yes"}
    if enable_sync:
        try:
            await sync_databases_from_mcp()
            logger.info("Database sync completed successfully")
        except Exception as e:
            logger.warning(f"Failed to sync databases on startup: {e}")
            logger.info("Databases will be synced on first request")
    else:
        logger.info("Skipping database sync on startup (ENABLE_MCP_SYNC_ON_START is false)")
    
    yield
    
    # Shutdown
    logger.info("Shutting down Research Database Management API...")


# Create FastAPI app
app = FastAPI(
    title=PROJECT_NAME,
    description="Multi-agent system for managing research databases and ORCID integration",
    version="1.0.0",
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins explicitly
    allow_origin_regex=".*",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Include routers
app.include_router(system.router)
app.include_router(database.router)
app.include_router(orcid.router)
app.include_router(tasks.router)
app.include_router(chat.router)


@app.get("/health")
async def health_check():
    """Health check endpoint for Docker."""
    return {
        "status": "healthy", 
        "timestamp": datetime.now().isoformat(),
        "service": "organized_data_management_api"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8080,
        reload=True,
        log_level=LOG_LEVEL.lower()
    )
