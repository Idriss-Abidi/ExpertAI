"""
System and health check API endpoints
"""

from fastapi import APIRouter, HTTPException, status
from datetime import datetime
import platform
import sys

from ..services.mcp_service import call_mcp_list_dbs

router = APIRouter(prefix="/api", tags=["system"])


@router.get("/health")
async def health_check():
    """Health check endpoint"""
    try:
        # Test MCP server connection
        mcp_result = await call_mcp_list_dbs()
        mcp_status = "connected" if mcp_result.get("success") else "disconnected"
        
        return {
            "status": "healthy",
            "timestamp": datetime.now().isoformat(),
            "mcp_server": mcp_status,
            "version": "1.0.0"
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "timestamp": datetime.now().isoformat(),
            "error": str(e),
            "version": "1.0.0"
        }


@router.get("/system/info")
async def system_info():
    """Get system information"""
    try:
        return {
            "platform": platform.platform(),
            "python_version": sys.version,
            "architecture": platform.architecture(),
            "processor": platform.processor(),
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get system info: {str(e)}"
        )


@router.get("/")
async def root():
    """Root endpoint with API information"""
    return {
        "message": "Research Database Management System API",
        "version": "1.0.0",
        "description": "Multi-agent system for managing research databases and ORCID integration",
        "endpoints": {
            "databases": "/api/databases",
            "orcid": "/api/orcid",
            "tasks": "/api/tasks",
            "health": "/api/health",
            "system": "/api/system/info"
        },
        "documentation": "/docs",
        "timestamp": datetime.now().isoformat()
    }
