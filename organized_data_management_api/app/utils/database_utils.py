"""
Database utility functions from data.py
"""

import json
import requests
from dataclasses import dataclass, asdict
from typing import Dict, List
from ..models.base import TableInfo


# === Database Schema Handling ===
@dataclass
class TableInfo:
    name: str
    columns: Dict[str, str]


# --- Separate schema parsers for Postgres and MySQL ---
def parse_postgres_schema(schema_json: dict) -> List[TableInfo]:
    """Parse Postgres MCP schema JSON (flat dict) into TableInfo list, ignoring _metadata."""
    tables = []
    # If schema_json is wrapped in 'structuredContent', extract it
    if (
        isinstance(schema_json, dict)
        and len(schema_json) == 1
        and "structuredContent" in schema_json
        and isinstance(schema_json["structuredContent"], dict)
    ):
        schema_json = schema_json["structuredContent"]
    # If schema_json has a single key and that key is a table, flatten it
    if isinstance(schema_json, dict) and len(schema_json) == 1 and next(iter(schema_json)).startswith("_"):
        # Only _metadata, skip
        return []
    if isinstance(schema_json, dict):
        for table_name, table_info in schema_json.items():
            if table_name.startswith("_"):
                continue
            if isinstance(table_info, dict):
                tables.append(TableInfo(name=table_name, columns=table_info))
    return tables


def parse_mysql_schema(schema_json: dict) -> List[TableInfo]:
    """Parse MySQL MCP schema JSON (flat dict) into TableInfo list, ignoring _metadata."""
    tables = []
    # If schema_json is wrapped in 'structuredContent', extract it
    if (
        isinstance(schema_json, dict)
        and len(schema_json) == 1
        and "structuredContent" in schema_json
        and isinstance(schema_json["structuredContent"], dict)
    ):
        schema_json = schema_json["structuredContent"]
    # If schema_json has a single key and that key is a table, flatten it
    if isinstance(schema_json, dict) and len(schema_json) == 1 and next(iter(schema_json)).startswith("_"):
        # Only _metadata, skip
        return []
    if isinstance(schema_json, dict):
        for table_name, table_info in schema_json.items():
            if table_name.startswith("_"):
                continue
            if isinstance(table_info, dict):
                tables.append(TableInfo(name=table_name, columns=table_info))
    return tables


def call_mcp(tool_name, arguments, mcp_url=None):
    if mcp_url is None:
        import os
        mcp_url = os.getenv("MCP_DB_SERVER_URL", "http://localhost:8017/mcp")
    """Send a JSON-RPC request to the MCP server."""
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
        response = requests.post(mcp_url, json=payload, headers=headers, timeout=30)
        response.encoding = 'utf-8'  # Ensure correct decoding of Unicode characters
        response.raise_for_status()
        return response.text  # Return raw text, not parsed JSON
    except requests.RequestException as e:
        print(f"[ERROR] MCP request failed: {e}")
        return None


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


def parse_mcp_response(raw):
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

    # Try to extract data from the response based on the actual structure
    try:
        # Check if result exists
        if "result" not in data:
            print("[DEBUG] No 'result' key found in response")
            return None
            
        result = data["result"]
        
        # Check for structuredContent first (newer format)
        if isinstance(result, dict) and "structuredContent" in result:
            sc = result["structuredContent"]
            if isinstance(sc, dict) and "result" in sc:
                print("[DEBUG] Found structuredContent.result")
                return sc["result"]
            elif isinstance(sc, dict):
                print("[DEBUG] Found structuredContent (no nested result)")
                return sc
        
        # Check for content array (format we saw in data.py output)
        if isinstance(result, dict) and "content" in result:
            content = result["content"]
            if isinstance(content, list) and len(content) > 0:
                first_content = content[0]
                if isinstance(first_content, dict):
                    # Some MCP servers return JSON directly in a 'json' field
                    if "json" in first_content and isinstance(first_content["json"], (dict, list)):
                        print("[DEBUG] Parsed content from json field")
                        return first_content["json"]
                    # Fallback to text field containing JSON string
                    if "text" in first_content:
                        try:
                            parsed_content = json.loads(first_content["text"])
                            print("[DEBUG] Parsed content from text field")
                            return parsed_content
                        except json.JSONDecodeError:
                            print(f"[DEBUG] Could not parse text content as JSON: {str(first_content['text'])[:100]}...")
                            return None
        
        # Fallback: return the result directly if it's a dict
        if isinstance(result, dict):
            print("[DEBUG] Returning result dict directly")
            return result
        
        # Last resort: return the raw data
        print("[DEBUG] Returning raw data as fallback")
        return data
        
    except Exception as e:
        print(f"[ERROR] Exception in parse_mcp_response: {e}")
        return raw


# Unified schema parser for both Postgres and MySQL
def parse_schema_to_tables(schema_json: dict) -> List[TableInfo]:
    """Parse schema JSON into TableInfo list, handling both Postgres and MySQL formats"""
    tables = []
    
    # Handle wrapped content
    if (
        isinstance(schema_json, dict)
        and len(schema_json) == 1
        and "structuredContent" in schema_json
        and isinstance(schema_json["structuredContent"], dict)
    ):
        schema_json = schema_json["structuredContent"]
    
    # Skip if only metadata
    if isinstance(schema_json, dict) and len(schema_json) == 1 and next(iter(schema_json)).startswith("_"):
        return []
    
    if isinstance(schema_json, dict):
        for table_name, table_info in schema_json.items():
            if table_name.startswith("_"):
                continue
            if isinstance(table_info, dict):
                tables.append(TableInfo(name=table_name, columns=table_info))
    
    return tables


def show_schema():
    """Show database schema"""
    print("Available databases:")
    databases = show_connected_databases()
    
    if not databases:
        print("No databases connected.")
        return
    
    for db in databases:
        print(f"\nDatabase: {db['name']} (ID: {db['id']})")
        print(f"Type: {db['type']}")
        print(f"Host: {db['host']}:{db['port']}")
        print(f"Database: {db['dbName']}")
        
        # Get schema for this database
        schema_result = call_mcp("get_schema", {"db_id": db['id']})
        if "error" not in schema_result:
            schema_data = parse_mcp_response(schema_result)
            tables = parse_schema_to_tables(schema_data)
            
            if tables:
                print("Tables:")
                for table in tables:
                    print(f"  - {table.name}")
                    for col_name, col_type in table.columns.items():
                        print(f"    {col_name}: {col_type}")
            else:
                print("  No tables found or schema not available")
        else:
            print(f"  Error getting schema: {schema_result['error']}")


def add_database():
    """Add a new database connection"""
    print("Add Database Connection")
    print("=" * 30)
    
    name = input("Connection name: ")
    db_type = input("Database type (postgres/mysql): ").lower()
    host = input("Host: ")
    port = int(input("Port: "))
    db_name = input("Database name: ")
    username = input("Username: ")
    password = input("Password: ")
    schema = input("Schema (default: public): ") or "public"
    
    db_config = {
        "id_user": 1,
        "conn_name": name,
        "dbName": db_name,
        "type": db_type,
        "host": host,
        "port": port,
        "username": username,
        "pw": password,
        "schema": schema
    }
    
    result = call_mcp("add_db", db_config)
    if "error" not in result:
        print(f"Database added successfully! ID: {result.get('id', 'Unknown')}")
    else:
        print(f"Error adding database: {result['error']}")


def show_connected_databases():
    """Show all connected databases"""
    result = call_mcp("list_dbs", {})
    if "error" not in result:
        databases = parse_mcp_response(result)
        if isinstance(databases, list):
            return databases
        elif isinstance(databases, dict) and "databases" in databases:
            return databases["databases"]
    return []


def select_query():
    """Interactive database query"""
    print("Database Query")
    print("=" * 20)
    
    databases = show_connected_databases()
    if not databases:
        print("No databases connected.")
        return
    
    print("Available databases:")
    for i, db in enumerate(databases):
        print(f"{i+1}. {db['name']} ({db['type']})")
    
    try:
        choice = int(input("Select database (number): ")) - 1
        if choice < 0 or choice >= len(databases):
            print("Invalid choice.")
            return
        
        selected_db = databases[choice]
        print(f"\nSelected: {selected_db['name']}")
        
        # Get schema
        schema_result = call_mcp("get_schema", {"db_id": selected_db['id']})
        if "error" in schema_result:
            print(f"Error getting schema: {schema_result['error']}")
            return
        
        schema_data = parse_mcp_response(schema_result)
        tables = parse_schema_to_tables(schema_data)
        
        if not tables:
            print("No tables found.")
            return
        
        print("\nAvailable tables:")
        for i, table in enumerate(tables):
            print(f"{i+1}. {table.name}")
        
        table_choice = int(input("Select table (number): ")) - 1
        if table_choice < 0 or table_choice >= len(tables):
            print("Invalid choice.")
            return
        
        selected_table = tables[table_choice]
        print(f"\nSelected table: {selected_table.name}")
        print("Columns:")
        for col_name, col_type in selected_table.columns.items():
            print(f"  {col_name}: {col_type}")
        
        # Get column selection
        columns_input = input("\nEnter columns to select (comma-separated, or 'all'): ")
        if columns_input.lower() == 'all':
            columns = list(selected_table.columns.keys())
        else:
            columns = [col.strip() for col in columns_input.split(',')]
        
        # Get conditions
        conditions_input = input("Enter WHERE conditions (optional, format: column=value): ")
        conditions = {}
        if conditions_input:
            for condition in conditions_input.split(','):
                if '=' in condition:
                    key, value = condition.split('=', 1)
                    conditions[key.strip()] = value.strip()
        
        # Execute query
        result = call_mcp("select_data", {
            "db_id": selected_db['id'],
            "table": selected_table.name,
            "columns": columns,
            "conditions": conditions
        })
        
        if "error" not in result:
            data = parse_mcp_response(result)
            if isinstance(data, list):
                print(f"\nQuery results ({len(data)} rows):")
                for row in data:
                    print(row)
            else:
                print(f"\nQuery result: {data}")
        else:
            print(f"Query error: {result['error']}")
    
    except ValueError:
        print("Invalid input.")
    except KeyboardInterrupt:
        print("\nQuery cancelled.")


def select_query_results() -> List[Dict[str, str]]:
    """Execute a database query and return results"""
    databases = show_connected_databases()
    if not databases:
        print("No databases connected.")
        return []
    
    # For now, use the first database
    selected_db = databases[0]
    
    # Get schema
    schema_result = call_mcp("get_schema", {"db_id": selected_db['id']})
    if "error" in schema_result:
        print(f"Error getting schema: {schema_result['error']}")
        return []
    
    schema_data = parse_mcp_response(schema_result)
    tables = parse_schema_to_tables(schema_data)
    
    if not tables:
        print("No tables found.")
        return []
    
    # For now, use the first table
    selected_table = tables[0]
    
    # Get all columns
    columns = list(selected_table.columns.keys())
    
    # Execute query
    result = call_mcp("select_data", {
        "db_id": selected_db['id'],
        "table": selected_table.name,
        "columns": columns,
        "conditions": {}
    })
    
    if "error" not in result:
        data = parse_mcp_response(result)
        if isinstance(data, list):
            return data
        else:
            return [data] if data else []
    else:
        print(f"Query error: {result['error']}")
        return []


def select_query_results_v2(db_id, table_name, columns_chosen) -> List[Dict[str, str]]:
    """Execute a database query with specific parameters and return results (matches working version exactly)"""
    # Import the functions we added to mcp_service
    from ..services.mcp_service import call_mcp, parse_mcp_response_local, extract_json_from_sse
    
    # Ensure db_id is an integer for MCP server
    if isinstance(db_id, str):
        try:
            db_id = int(db_id)
        except ValueError:
            print(f"Invalid database ID: {db_id}")
            return []
    table_name = table_name.strip()
    
    # Handle columns_chosen as either a list or a string
    if isinstance(columns_chosen, list):
        # If it's a list, use it directly
        columns = [col.strip() for col in columns_chosen if col.strip()]
    else:
        # If it's a string, strip it and process
        columns_chosen = columns_chosen.strip()
        # Handle comma-separated string
        columns = [col.strip() for col in columns_chosen.split(",") if col.strip()]
    
    args = {
        "db_id": db_id,
        "table": table_name,
        "columns": columns
    }
    raw = call_mcp("select_data", args)
    print(f"Raw MCP response for select_data: {raw[:500]}...")
    result = parse_mcp_response_local(raw)
    print(f"Parsed result: {result}")
    if result:
        return result
    else:
        print(f"No results found for query on {table_name} in database {db_id}.")
        return []
