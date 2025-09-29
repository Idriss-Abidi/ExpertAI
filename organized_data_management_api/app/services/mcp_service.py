"""
MCP (Model Context Protocol) service functions
"""

import json
import requests
import asyncio
import traceback
from typing import Dict, List, Optional, Any
from ..models.database import SimpleDatabaseCreate, SimpleDatabaseResponse
from ..utils.database_utils import parse_mcp_response, call_mcp, extract_json_from_sse

# Global variables for database management
simple_databases: Dict[int, SimpleDatabaseResponse] = {}
frontend_to_mcp_id: Dict[int, str] = {}
next_db_id = 1
import os
DB_MCP_URL = os.getenv("MCP_DB_SERVER_URL", "http://localhost:8017/mcp")  # Multi-DB MCP server
ORCID_MCP_URL = os.getenv("MCP_ORCID_SERVER_URL", "http://localhost:8001/mcp")  # ORCID MCP server


def extract_json_from_sse(text):
    """Extract JSON from Server-Sent Events text"""
    lines = text.strip().split('\n')
    for line in lines:
        if line.startswith('data: '):
            try:
                return json.loads(line[6:])
            except json.JSONDecodeError:
                continue
    return None


async def initialize_mcp_servers():
    """Initialize MCP servers on startup"""
    try:
        print("Initializing MCP servers...")
        # Test connection to MCP server
        test_result = await call_mcp_list_dbs()
        if test_result["success"]:
            print("MCP server connection successful")
        else:
            print(f"MCP server connection failed: {test_result['error']}")
    except Exception as e:
        print(f"Error initializing MCP servers: {e}")


async def sync_databases_from_mcp():
    """Sync databases from MCP server to FastAPI backend memory"""
    try:
        print("Syncing databases from MCP server...")
        
        # Get databases from MCP server
        mcp_result = await call_mcp_list_dbs()
        
        if not mcp_result["success"]:
            print(f"Failed to get databases from MCP: {mcp_result['error']}")
            return
            
        mcp_databases = mcp_result["data"]
        print(f"Found {len(mcp_databases)} databases in MCP: {mcp_databases}")
        
        global next_db_id
        
        # Clear existing databases and mappings
        simple_databases.clear()
        frontend_to_mcp_id.clear()
        
        # For each database in MCP, create a SimpleDatabaseResponse with actual details
        for i, db_info in enumerate(mcp_databases, 1):
            # Extract actual connection details from MCP response
            db_response = SimpleDatabaseResponse(
                id=i,  # Use sequential ID for frontend
                id_user=1,
                conn_name=db_info.get('conn_name', f"Database {i}"),
                dbName=db_info.get('dbname', f"database_{db_info.get('id', 'unknown')}"),
                type=db_info.get('dbtype', 'postgres'),
                host=db_info.get('host', 'localhost'),
                port=db_info.get('port', 5432),
                username=db_info.get('user', 'postgres'),
                pw=db_info.get('password', '****'),  # Password is hidden in MCP response
                schema_name=db_info.get('schema', 'public'),
                status="connected"
            )
            
            simple_databases[i] = db_response
            # Create mapping between frontend ID and MCP ID
            mcp_id = db_info.get('id', f"db_{i}")
            frontend_to_mcp_id[i] = mcp_id  # Keep MCP ID as-is (could be int or string)
            print(f"Added database ID {i} (MCP: {mcp_id}) - {db_info.get('dbname', 'unknown')}")
        
        next_db_id = len(mcp_databases) + 1
        print(f"Database sync complete. Next DB ID: {next_db_id}")
        
    except Exception as e:
        print(f"Error syncing databases from MCP: {str(e)}")


async def call_mcp_add_db(db_config: SimpleDatabaseCreate) -> dict:
    """Call the multi_db_mcp server to add a new database using the add_db tool"""
    try:
        mcp_url = DB_MCP_URL
        
        # Prepare arguments for the add_db tool
        arguments = {
            "conn_name": db_config.conn_name,  # Use conn_name as connection name
            "host": db_config.host,
            "port": db_config.port,
            "dbname": db_config.dbName,
            "user": db_config.username,
            "password": db_config.pw,  # Use password directly
            "dbtype": db_config.type,
            "schema": db_config.schema_name  # Use schema from config
        }
        
        # Enhanced MCP message format
        mcp_message = {
            "jsonrpc": "2.0",
            "id": 3,
            "method": "tools/call",
            "params": {
                "name": "add_db",
                "arguments": arguments
            }
        }
        
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream"
        }
        
        response = requests.post(mcp_url, json=mcp_message, headers=headers, timeout=10)
        response.encoding = 'utf-8'
        
        if response.status_code == 200:
            raw_response = response.text
            print(f"[DEBUG] Raw MCP add_db response: {raw_response[:500]}...")
            
            result = parse_mcp_response(raw_response)
            print(f"[DEBUG] Parsed add_db result: {result}")
            
            if result is not None:
                return {
                    "success": True,
                    "message": f"Database '{db_config.dbName}' added successfully",
                    "data": result
                }
            else:
                # Try to extract error text from SSE payload for better diagnostics
                try:
                    data = extract_json_from_sse(raw_response) or json.loads(raw_response)
                    if isinstance(data, dict):
                        res = data.get("result") or {}
                        if res and res.get("isError") and isinstance(res.get("content"), list) and res["content"]:
                            first = res["content"][0]
                            err_text = first.get("text") or first.get("error") or str(first)
                            return {"success": False, "error": err_text}
                except Exception:
                    pass
                return {"success": False, "error": "Failed to parse MCP response"}
        else:
            return {"success": False, "error": f"MCP server error: {response.status_code} - {response.text}"}
            
    except Exception as e:
        return {"success": False, "error": f"Failed to add database: {str(e)}"}


async def call_mcp_list_dbs() -> dict:
    """Call the multi_db_mcp server to list databases using enhanced patterns from data.py"""
    try:
        mcp_url = DB_MCP_URL

        # Enhanced MCP message format based on data.py patterns
        mcp_message = {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/call",
            "params": {
                "name": "list_dbs",
                "arguments": {}
            }
        }

        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream"
        }

        response = requests.post(mcp_url, json=mcp_message, headers=headers, timeout=10)
        response.encoding = 'utf-8'  # Ensure correct decoding of Unicode characters

        if response.status_code == 200:
            # Enhanced response parsing based on data.py patterns
            raw_response = response.text
            print(f"[DEBUG] Raw MCP response: {raw_response[:500]}...")

            # Parse result using data.py pattern
            result = parse_mcp_response(raw_response)
            print(f"[DEBUG] Parsed result: {result}")

            if result is not None:
                # Transform the MCP response to match the expected format
                if isinstance(result, list):
                    transformed_databases = []
                    for db in result:
                        transformed_db = {
                            "id": str(db.get("id", "")),
                            "name": db.get("conn_name", db.get("id", "")),
                            "type": db.get("dbtype", "postgres"),
                            "host": db.get("host", ""),
                            "port": db.get("port", 5432),
                            "username": db.get("user", ""),
                            "password": "****",  # Password is masked in MCP response
                            "database": db.get("dbname", ""),
                            "schema": db.get("schema", "public"),  # Include schema field!
                            "status": "connected",  # Assume connected if listed
                            "created_at": None,
                            "last_tested": None
                        }
                        transformed_databases.append(transformed_db)
                    
                    return {"success": True, "data": transformed_databases}
                elif isinstance(result, dict) and "result" in result:
                    # Handle case where result is wrapped in another dict
                    db_list = result["result"]
                    if isinstance(db_list, list):
                        transformed_databases = []
                        for db in db_list:
                            transformed_db = {
                                "id": str(db.get("id", "")),
                                "name": db.get("conn_name", db.get("id", "")),
                                "type": db.get("dbtype", "postgres"),
                                "host": db.get("host", ""),
                                "port": db.get("port", 5432),
                                "username": db.get("user", ""),
                                "password": "****",  # Password is masked in MCP response
                                "database": db.get("dbname", ""),
                                "schema": db.get("schema", "public"),  # Include schema field!
                                "status": "connected",  # Assume connected if listed
                                "created_at": None,
                                "last_tested": None
                            }
                            transformed_databases.append(transformed_db)
                        
                        return {"success": True, "data": transformed_databases}
                    else:
                        return {"success": False, "error": f"Expected list of databases, got: {type(db_list)}"}
                else:
                    return {"success": False, "error": f"Unexpected result format: {type(result)}"}
            else:
                return {"success": False, "error": "Failed to parse MCP response"}
        else:
            return {"success": False, "error": f"MCP server error: {response.status_code} - {response.text}"}

    except Exception as e:
        print(f"[DEBUG] Exception in call_mcp_list_dbs: {e}")
        return {"success": False, "error": f"Failed to connect to MCP server: {str(e)}"}


async def call_mcp_schema_by_type(db_id: str, db_type: str) -> dict:
    """Call the appropriate MCP schema tool based on database type using the exact pattern from data.py"""
    try:
        mcp_url = DB_MCP_URL

        # Choose the appropriate tool based on database type (exact pattern from data.py)
        if db_type == "postgres":
            tool_name = "introspect_postgres_schema"
        elif db_type == "mysql":
            tool_name = "introspect_mysql_schema"
        else:
            return {"success": False, "error": f"Unsupported database type: {db_type}"}
        
        print(f"Using tool: {tool_name} for database {db_id} (type: {db_type})")
        
        # Convert string ID to integer for MCP server
        try:
            db_id_int = int(db_id)
        except ValueError:
            return {"success": False, "error": f"Invalid database ID: {db_id}"}
        
        # Get database configuration to retrieve the schema
        try:
            # Get fresh database info from MCP server instead of relying on local cache
            mcp_db_list = await call_mcp_list_dbs()
            schema_name = "public"  # Default fallback
            
            if mcp_db_list["success"]:
                # Find the database in the MCP response
                for db_info in mcp_db_list["data"]:
                    if int(db_info.get("id", 0)) == db_id_int:
                        # Use the schema from the MCP server configuration
                        schema_name = db_info.get("schema", "public")
                        print(f"Retrieved schema '{schema_name}' for database {db_id_int} from MCP server")
                        break
                else:
                    print(f"Database {db_id_int} not found in MCP server response, using default schema: {schema_name}")
            else:
                print(f"Failed to get databases from MCP server: {mcp_db_list.get('error')}")
                # Try to get schema from our local database mapping as fallback
                if db_id_int in simple_databases:
                    db_info = simple_databases[db_id_int]
                    schema_name = getattr(db_info, 'schema_name', 'public')
                    print(f"Retrieved schema '{schema_name}' for database {db_id_int} from local cache")
                
        except Exception as e:
            print(f"Warning: Could not retrieve schema from MCP server, using default: {e}")
            schema_name = "public"  # Default fallback
        
        # Call the MCP tool with schema parameter
        if db_type == "postgres":
            raw_response = call_mcp(tool_name, {"db_id": db_id_int, "schema_name": schema_name})
        else:
            raw_response = call_mcp(tool_name, {"db_id": db_id_int})
        
        if raw_response is None:
            return {"success": False, "error": "MCP call returned None"}
        
        print(f"Raw MCP response: {str(raw_response)[:200]}...")
        
        # Parse the response using the exact pattern from data.py
        schema = parse_mcp_response(raw_response)
        
        if schema is None:
            return {"success": False, "error": "Failed to parse MCP response"}
        
        print(f"Parsed schema type: {type(schema)}")
        
        # Process schema following data.py pattern
        if schema:
            # flatten 'structuredContent' if present (exact pattern from data.py)
            if (
                isinstance(schema, dict)
                and len(schema) == 1
                and "structuredContent" in schema
                and isinstance(schema["structuredContent"], dict)
            ):
                schema = schema["structuredContent"]
            
            # build {table_name: columns_dict} skipping _metadata or any key starting with _
            result = {}
            if isinstance(schema, dict):
                for table_name, columns in schema.items():
                    if table_name.startswith("_"):
                        continue
                    if isinstance(columns, dict):
                        # Remove any _metadata or keys starting with _ inside columns dict as well
                        filtered_columns = {k: v for k, v in columns.items() if not k.startswith("_")}
                        result[table_name] = filtered_columns
            
            if result:
                print(f"Successfully extracted {len(result)} tables from schema")
                return {"success": True, "data": result, "tool_used": tool_name}
            else:
                return {"success": False, "error": f"No tables found in schema for database {db_id}"}
           

    except Exception as e:
        print(f"Exception in call_mcp_schema_by_type: {e}")
        traceback.print_exc()
        return {"success": False, "error": f"Failed to get schema: {str(e)}"}


async def call_mcp_select_data(db_id: str, table: str, columns: List[str], conditions: Dict[str, str] = {}) -> dict:
    """Call the multi_db_mcp server to select data from a table using enhanced patterns from data.py"""
    try:
        mcp_url = DB_MCP_URL

        # Convert string ID to integer for MCP server
        try:
            db_id_int = int(db_id)
        except ValueError:
            return {"success": False, "error": f"Invalid database ID: {db_id}"}

        mcp_message = {
            "jsonrpc": "2.0",
            "id": 6,
            "method": "tools/call",
            "params": {
                "name": "select_data",
                "arguments": {
                    "db_id": db_id_int,
                    "table": table,
                    "columns": columns,
                    "conditions": conditions
                }
            }
        }

        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream"
        }

        response = requests.post(mcp_url, json=mcp_message, headers=headers, timeout=15)
        response.encoding = 'utf-8'  # Ensure correct decoding of Unicode characters
        
        if response.status_code == 200:
            # Enhanced response parsing based on data.py patterns
            raw_response = response.text
            
            # Parse result using data.py pattern
            result = parse_mcp_response(raw_response)
            if result is not None:
                return {"success": True, "data": result if isinstance(result, list) else []}
            else:
                return {"success": False, "error": "Failed to parse MCP response"}
        else:
            return {"success": False, "error": f"MCP server error: {response.status_code} - {response.text}"}
    except Exception as e:
        return {"success": False, "error": f"Failed to connect to MCP server: {str(e)}"}


async def call_mcp_get_dbtype(db_id: str) -> dict:
    """Get database type using the exact pattern from data.py"""
    try:
        print(f"Getting database type for {db_id}")
        
        # Convert string ID to integer for MCP server
        try:
            db_id_int = int(db_id)
        except ValueError:
            return {"success": False, "error": f"Invalid database ID: {db_id}"}
        
        # Call get_dbtype (exact pattern from data.py)
        db_type_result = call_mcp("get_dbtype", {"db_id": db_id_int})
        
        if db_type_result is None:
            return {"success": False, "error": "MCP call returned None"}
        
        print(f"Raw dbtype response: {db_type_result[:200]}...")
        
        # Parse using the exact pattern from data.py
        db_type_json = extract_json_from_sse(db_type_result)
        
        if db_type_json is None:
            return {"success": False, "error": "Failed to extract JSON from SSE response"}
        
        print(f"Parsed dbtype JSON: {db_type_json}")
        
        # Extract database type (exact pattern from data.py)
        try:
            db_type = db_type_json["result"]["content"][0]["text"].strip().lower()
            print(f"Database type: {db_type}")
            return {"success": True, "dbtype": db_type}
        except (KeyError, IndexError) as e:
            print(f"Error extracting dbtype from response: {e}")
            return {"success": False, "error": f"Failed to extract database type from response: {e}"}

    except Exception as e:
        print(f"Exception in call_mcp_get_dbtype: {e}")
        traceback.print_exc()
        return {"success": False, "error": f"Failed to get database type: {str(e)}"}


async def call_mcp_remove_db(db_id: str) -> dict:
    """Remove database from MCP server"""
    try:
        # Use the database ID directly instead of relying on mapping
        # The frontend sends the same ID that the MCP server uses
        
        mcp_url = DB_MCP_URL
        
        # Convert db_id to integer for the MCP call
        try:
            mcp_id_int = int(db_id)
        except ValueError:
            return {"success": False, "error": f"Invalid database ID format: {db_id}"}
        
        mcp_message = {
            "jsonrpc": "2.0",
            "id": 7,
            "method": "tools/call",
            "params": {
                "name": "remove_db",
                "arguments": {
                    "db_id": mcp_id_int
                }
            }
        }
        
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream"
        }
        
        response = requests.post(mcp_url, json=mcp_message, headers=headers, timeout=10)
        response.encoding = 'utf-8'
        
        if response.status_code == 200:
            raw_response = response.text
            result = parse_mcp_response(raw_response)
            
            if result is not None:
                # Remove from local mappings
                if int(db_id) in simple_databases:
                    del simple_databases[int(db_id)]
                if int(db_id) in frontend_to_mcp_id:
                    del frontend_to_mcp_id[int(db_id)]
                
                return {
                    "success": True,
                    "message": f"Database {db_id} removed successfully",
                    "data": result
                }
            else:
                return {"success": False, "error": "Failed to parse MCP response"}
        else:
            return {"success": False, "error": f"MCP server error: {response.status_code} - {response.text}"}
            
    except Exception as e:
        return {"success": False, "error": f"Failed to remove database: {str(e)}"}


def extract_json_from_sse(text):
    """Extract JSON payload from SSE (text/event-stream) response."""
    if not text:
        return None
    
    # Handle multi-line SSE response by reconstructing the data line
    lines = text.splitlines()
    data_lines = []
    
    for line in lines:
        if line.startswith('data: '):
            data_lines.append(line[len('data: '):])
    
    if data_lines:
        # Join all data lines and try to parse as JSON
        combined_data = ''.join(data_lines)
        try:
            return json.loads(combined_data)
        except Exception:
            return None

    return None


def parse_mcp_response_local(raw):
    """Parse MCP JSON-RPC response and return structuredContent.result if present."""
    if raw is None:
        return None
    data = extract_json_from_sse(raw)
    if data is None:
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            print(f"[ERROR] Could not decode JSON. Raw response:\n{raw}")
            return None
    # Try to extract schema from structuredContent or structuredContent.result
    try:
        print(data)
        sc = data["result"].get("structuredContent")
        if isinstance(sc, dict):
            # If there's a nested 'result', return that, else return the dict itself
            if "result" in sc and isinstance(sc["result"], dict):
                return sc["result"]
            return sc
        # fallback: if result is a dict, return it
        if isinstance(data["result"], dict):
            return data["result"]
        return data["result"]
    except Exception:
        return data.get("result")


def call_mcp(tool_name, arguments):
    """Send a JSON-RPC request to the MCP server."""
    # Use container-aware URL from env (set at module load time)
    MCP_URL = DB_MCP_URL
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {
            "name": tool_name,
            "arguments": arguments
        }
    }
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream"
    }
    try:
        response = requests.post(MCP_URL, json=payload, headers=headers)
        response.encoding = 'utf-8'  # Ensure correct decoding of Unicode characters
        response.raise_for_status()
        return response.text
    except requests.RequestException as e:
        print(f"[ERROR] MCP request failed: {e}")
        return None


def get_connected_databases():
    raw = call_mcp("list_dbs", {})
    dbs = parse_mcp_response_local(raw)
    if dbs:
        return dbs
    else:
        return []

def get_mcp_id_for_frontend_id(frontend_id: int) -> Optional[str]:
    """Get MCP ID for a frontend database ID"""
    return frontend_to_mcp_id.get(frontend_id)
