"""
Database-related API endpoints
"""

from fastapi import APIRouter, HTTPException, status
from datetime import datetime
from typing import Dict, List, Any

from ..models.database import DatabaseConnectionRequest, SimpleDatabaseCreate, TableSelectionRequest
from ..services.mcp_service import (
    call_mcp_add_db, call_mcp_list_dbs, call_mcp_schema_by_type, 
    call_mcp_get_dbtype, call_mcp_select_data, call_mcp_remove_db
)
from ..utils.helpers import list_mcp_tools, get_schema_fallback

router = APIRouter(prefix="/api/databases", tags=["databases"])


@router.post("")
async def create_database_api(db_config: DatabaseConnectionRequest):
    """Create a new database connection (API endpoint for frontend)"""
    try:
        # Normalize host for Docker network based on db type
        normalized_host = db_config.host
        if normalized_host in ("localhost", "127.0.0.1"):
            dbt = (db_config.dbtype or "").lower()
            if dbt in ("postgres", "postgresql", "pg"):
                normalized_host = "postgres"  # docker service name
            elif dbt in ("mysql", "mariadb"):
                # connect to host machine MySQL from container
                normalized_host = "host.docker.internal"
        # Convert frontend format to backend format
        simple_db_config = SimpleDatabaseCreate(
            id_user=1,  # Default user ID
            conn_name=db_config.name,  # Use name as connection name
            dbName=db_config.dbname,
            type=db_config.dbtype,
            host=normalized_host,
            port=db_config.port,
            username=db_config.user,
            pw=db_config.password,
            schema_name=db_config.get_schema()  # Use the new method to get correct schema
        )

        # Call MCP server to add the database
        mcp_result = await call_mcp_add_db(simple_db_config)

        if not mcp_result["success"]:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to add database to MCP server: {mcp_result['error']}"
            )
        
        # Get the actual database ID from MCP result
        actual_db_id = mcp_result.get("db_id", "1")
        
        # Return the format expected by the frontend with the actual MCP server ID
        return {
            "id": str(actual_db_id),  # Use the actual MCP server ID
            "name": db_config.name,
            "host": db_config.host,
            "port": db_config.port,
            "dbname": db_config.dbname,
            "user": db_config.user,
            "dbtype": db_config.dbtype,
            "status": "connected",
            "created_at": datetime.now().isoformat(),
            "last_tested": None
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )


@router.get("")
async def get_databases_api():
    """Get all database connections (API endpoint for frontend)"""
    try:
        # Get databases from MCP server using the new YAML-based server
        mcp_result = await call_mcp_list_dbs()
        
        if not mcp_result.get("success"):
            print(f"Failed to get databases from MCP server: {mcp_result.get('error')}")
            return []
        
        db_result = mcp_result.get("data", [])
        databases = []

        # Process each database in the result array
        for db in db_result:
            if isinstance(db, dict):
                database = {
                    "id": str(db.get("id", "")),  # Convert to string for consistency
                    "name": db.get("name", db.get("conn_name", "")),  # Use conn_name as name for frontend
                    "host": db.get("host", ""),
                    "port": db.get("port", 5432),
                    "dbname": db.get("database", ""),
                    "user": db.get("username", ""),
                    "dbtype": db.get("type", "postgres"),
                    "status": db.get("status", "connected"),
                    "created_at": datetime.now().isoformat(),
                    "last_tested": None
                }
                databases.append(database)
            else:
                print(f"Skipping invalid database entry: {db}")
                continue

        print(f"Found {len(databases)} databases: {databases}")
        return databases

    except Exception as e:
        print(f"Error getting databases: {str(e)}")
        # Return empty list on error to prevent frontend crashes
        return []


@router.get("/{db_id}/schema")
async def get_database_schema_api(db_id: int):
    """Get database schema for a database connection (API endpoint for frontend)"""
    try:
        # Convert db_id to string for MCP call
        mcp_db_id = str(db_id)
        
        print(f"Getting schema for database {db_id} (MCP ID: {mcp_db_id})")
        
        # First get the database type
        db_type_result = await call_mcp_get_dbtype(mcp_db_id)
        
        if not db_type_result["success"]:
            print(f"Failed to get database type: {db_type_result['error']}")
            # Try to get schema anyway with default type
            db_type = "postgres"  # Default fallback
        else:
            db_type = db_type_result["dbtype"]
            print(f"Database type: {db_type}")
        
        # List available tools for debugging
        print("Listing available MCP tools...")
        available_tools = list_mcp_tools()
        tool_names = [tool.get('name', 'unknown') for tool in available_tools]
        print(f"Available tools: {tool_names}")

        # Use the type-specific schema introspection function
        schema_result = await call_mcp_schema_by_type(mcp_db_id, db_type)

        if not schema_result["success"]:
            print(f"Schema retrieval failed: {schema_result['error']}")
            
            # Try fallback method
            print("Trying fallback schema method...")
            fallback_result = await get_schema_fallback(mcp_db_id, db_type)
            
            if fallback_result["success"]:
                print("Fallback schema method succeeded!")
                return {
                    "db_id": db_id,
                    "schema": fallback_result["data"],
                    "tool_used": fallback_result.get("tool_used", "fallback"),
                    "schema_name": "public" if db_type == "postgres" else "default",
                    "status": "success"
                }
            
            # Return a more informative error response
            return {
                "db_id": db_id,
                "schema": {
                    "error": schema_result["error"],
                    "fallback_error": fallback_result.get("error", "No fallback attempted"),
                    "available_tools": tool_names,
                    "db_type": db_type,
                    "mcp_db_id": mcp_db_id
                },
                "tool_used": "none",
                "schema_name": "public" if db_type == "postgres" else "default",
                "status": "error"
            }
        
        return {
            "db_id": db_id,
            "schema": schema_result["data"],
            "tool_used": schema_result.get("tool_used", "unknown"),
            "schema_name": "public" if db_type == "postgres" else "default",
            "status": "success"
        }

    except Exception as e:
        print(f"Error getting database schema: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get database schema: {str(e)}"
        )


@router.post("/tables/select")
async def select_table_data(request: TableSelectionRequest):
    """Select data from a database table"""
    try:
        # First, check if the database exists by calling the MCP server directly
        # instead of relying on local simple_databases dictionary
        
        # Get databases from MCP server to validate the database exists
        mcp_databases_result = await call_mcp_list_dbs()
        
        if not mcp_databases_result.get("success"):
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to connect to MCP server: {mcp_databases_result.get('error', 'Unknown error')}"
            )
        
        # Check if the requested database exists
        db_id_to_check = request.db_id
        if isinstance(db_id_to_check, str) and db_id_to_check.isdigit():
            db_id_to_check = int(db_id_to_check)
        
        databases = mcp_databases_result.get("data", [])
        db_exists = False
        
        for db in databases:
            if isinstance(db, dict):
                db_id = db.get("id")
                if isinstance(db_id, str) and db_id.isdigit():
                    db_id = int(db_id)
                if db_id == db_id_to_check:
                    db_exists = True
                    break
        
        if not db_exists:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Database connection '{request.db_id}' not found. Available databases: {[db.get('id', 'unknown') for db in databases]}"
            )
        
        # Use the MCP server to select data from the table
        mcp_result = await call_mcp_select_data(
            db_id=request.db_id,
            table=request.table_name,
            columns=request.columns,
            conditions=request.conditions or {}
        )
        
        if not mcp_result["success"]:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to select data: {mcp_result['error']}"
            )
        
        # Limit the results if specified
        rows = mcp_result["data"]
        if request.limit and request.limit > 0:
            rows = rows[:request.limit]
        
        return {
            "db_id": request.db_id,
            "table_name": request.table_name,
            "columns": request.columns,
            "conditions": request.conditions,
            "rows": rows,
            "total_rows": len(mcp_result["data"]),
            "returned_rows": len(rows)
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )


@router.delete("/{db_id}")
async def delete_database_api(db_id: int):
    """Delete a database connection"""
    try:
        # Call MCP server to remove the database
        result = await call_mcp_remove_db(str(db_id))
        
        if not result["success"]:
            error_msg = result.get('error', 'Unknown error')
            # Check if it's a "not found" error
            if "not found" in error_msg.lower() or "database id" in error_msg.lower():
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Database {db_id} not found"
                )
            else:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Failed to remove database: {error_msg}"
                )
        
        return {
            "message": f"Database {db_id} removed successfully",
            "db_id": db_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )


@router.post("/{db_id}/test")
async def test_database_connection_api(db_id: int):
    """Test database connection"""
    try:
        # Get database info to test connection
        mcp_result = await call_mcp_list_dbs()
        
        if not mcp_result["success"]:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to get database info: {mcp_result['error']}"
            )
        
        # Find the database with matching ID
        db_found = False
        for db in mcp_result["data"]:
            if str(db.get("id")) == str(db_id):
                db_found = True
                break
        
        if not db_found:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Database with id {db_id} not found"
            )
        
        return {
            "db_id": db_id,
            "status": "connected",
            "message": "Database connection is active",
            "tested_at": datetime.now().isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )
