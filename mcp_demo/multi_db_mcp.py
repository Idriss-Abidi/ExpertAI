# multi_db_mcp.py
import psycopg
from fastmcp import FastMCP
from psycopg import sql
import mysql.connector
import yaml
from typing import List, Dict, Any
import os
from config_loader import load_configs, get_db_config, list_db_configs, DatabaseConfig, CONFIG_FILE

mcp = FastMCP("Multi-Database Server")

# Helpers to make localhost work from inside containers
LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}

def _pg_connect_with_fallback(cfg: dict):
    """Try PostgreSQL connection with host fallbacks when 'localhost' is used inside containers."""
    base = {k: v for k, v in cfg.items() if k in ['host', 'port', 'dbname', 'user', 'password']}
    host = str(base.get('host') or '').strip()
    candidates: List[str]
    if host in LOCAL_HOSTS:
        # Prefer docker service name, then host bridge, then loopback
        candidates = ['postgres', 'host.docker.internal', '127.0.0.1']
    else:
        candidates = [host]
    last_exc = None
    for h in candidates:
        params = dict(base)
        params['host'] = h
        try:
            conn = psycopg.connect(**params)
            return conn
        except Exception as e:
            last_exc = e
            continue
    if last_exc:
        raise last_exc
    raise RuntimeError("No PostgreSQL connection candidates available")

def _mysql_connect_with_fallback(cfg: dict):
    """Try MySQL connection with host fallbacks when 'localhost' is used inside containers."""
    host = str(cfg.get('host') or '').strip()
    candidates: List[str]
    if host in LOCAL_HOSTS:
        candidates = ['host.docker.internal', '127.0.0.1']
    else:
        candidates = [host]
    last_exc = None
    for h in candidates:
        try:
            conn = mysql.connector.connect(
                host=h,
                port=cfg['port'],
                database=cfg['dbname'],
                user=cfg['user'],
                password=cfg['password'],
                charset='utf8mb4'
            )
            return conn
        except Exception as e:
            last_exc = e
            continue
    if last_exc:
        raise last_exc
    raise RuntimeError("No MySQL connection candidates available")
# Load database configurations from YAML file
try:
    configs = load_configs()
    if configs:
        DBS = {config.id: {
            'host': config.host,
            'port': config.port,
            'dbname': config.dbname,
            'user': config.user,
            'password': config.password,
            'dbtype': config.dbtype,
            'conn_name': config.conn_name,
            'schema': config.schema
        } for config in configs.values()}
        print(f"✅ Loaded {len(DBS)} database configurations from YAML")
    else:
        print("⚠️  No database configurations found in YAML file")
        DBS = {}
except Exception as e:
    print(f"⚠️  Warning: Could not load database configurations: {e}")
    DBS = {}

@mcp.tool()
def add_db(
    conn_name: str,
    host: str,
    port: int,
    dbname: str,
    user: str,
    password: str,
    dbtype: str = 'postgres',
    schema: str = 'public'
) -> Dict[str, Any]:
    """
    Add a new database configuration to the YAML file.
    Args:
        conn_name: User-friendly name for the connection
        host: Database host
        port: Database port
        dbname: Database name
        user: Database username
        password: Database password (stored directly in YAML)
        dbtype: Database type ('postgres' or 'mysql')
        schema: Database schema (defaults to 'public' for PostgreSQL)
    """
    if dbtype not in ('postgres', 'mysql'):
        raise ValueError("dbtype must be exactly 'postgres' or 'mysql' (case-sensitive, no abbreviations)")
    
    # Load existing configs
    config_path = os.getenv("CONFIG_FILE", CONFIG_FILE)
    with open(config_path, "r") as f:
        configs = yaml.safe_load(f) or {}
    
    # Find the next available ID
    existing_ids = [cfg.get('id', 0) for cfg in configs.values() if isinstance(cfg.get('id'), int)]
    next_id = max(existing_ids) + 1 if existing_ids else 1
    
    # Create new config entry
    new_config = {
        'id': next_id,
        'conn_name': conn_name,
        'type': dbtype,
        'host': host,
        'port': port,
        'dbname': dbname,
        'user': user,
        'password': password,
        'schema': schema
    }
    
    # Use conn_name as the key (lowercase, no spaces)
    key = conn_name.lower().replace(' ', '_').replace('-', '_')
    
    # Add to configs
    configs[key] = new_config
    
    # Write back to YAML file
    with open(config_path, "w") as f:
        yaml.dump(configs, f, default_flow_style=False, sort_keys=False)
    
    # Reload configurations in memory
    global DBS
    try:
        DBS = {config.id: {
            'host': config.host,
            'port': config.port,
            'dbname': config.dbname,
            'user': config.user,
            'password': config.password,
            'dbtype': config.dbtype,
            'conn_name': config.conn_name,
            'schema': config.schema
        } for config in load_configs().values()}
    except Exception as e:
        print(f"Warning: Could not reload configurations: {e}")
    
    # Return structured JSON so clients can parse reliably
    return {
        "id": next_id,
        "conn_name": conn_name,
        "host": host,
        "port": port,
        "dbname": dbname,
        "user": user,
        "dbtype": dbtype,
        "schema": schema,
        "message": f"Database '{conn_name}' (ID: {next_id}, {dbtype}) added to YAML configuration."
    }

@mcp.tool()
def get_dbtype(db_id: int):
    cfg = DBS.get(db_id)
    if not cfg:
        raise ValueError(f"No DB with id '{db_id}'.")
    return cfg.get('dbtype')

@mcp.tool()
def list_dbs() -> List[Dict[str, Any]]:
    """
    List all registered databases with full details.
    Returns a list of dictionaries containing database information.
    """
    databases = []
    for db_id, config in DBS.items():
        # Create a safe copy without password for listing
        safe_config = {
            "id": db_id,
            "conn_name": config.get('conn_name', db_id),
            "host": config.get('host', ''),
            "port": config.get('port', 5432),
            "dbname": config.get('dbname', ''),
            "user": config.get('user', ''),
            "dbtype": config.get('dbtype', 'postgres'),
            "schema": config.get('schema', 'public'),
            "password": "****"  # Hide actual password
        }
        databases.append(safe_config)
    
    if not databases:
        print("ℹ️  No databases configured. Use add_db tool to add databases.")
    
    return databases

@mcp.tool()
def remove_db(db_id: int) -> str:
    """
    Remove a database from the YAML configuration file.
    """
    if db_id not in DBS:
        raise ValueError(f"No DB with id '{db_id}'.")
    
    # Load existing configs
    config_path = os.getenv("CONFIG_FILE", CONFIG_FILE)
    with open(config_path, "r") as f:
        configs = yaml.safe_load(f) or {}
    
    # Find and remove the config with the specified ID
    key_to_remove = None
    for key, cfg in configs.items():
        if cfg.get('id') == db_id:
            key_to_remove = key
            break
    
    if key_to_remove is None:
        raise ValueError(f"No database configuration found with ID '{db_id}' in YAML file.")
    
    # Remove from configs
    del configs[key_to_remove]
    
    # Write back to YAML file
    with open(config_path, "w") as f:
        yaml.dump(configs, f, default_flow_style=False, sort_keys=False)
    
    # Remove from memory
    del DBS[db_id]
    
    return f"Database '{db_id}' removed from YAML configuration."

@mcp.tool()
def reload_configs() -> str:
    """
    Reload database configurations from the YAML file.
    Useful when you've updated the configuration file.
    """
    global DBS
    try:
        DBS = {config.id: {
            'host': config.host,
            'port': config.port,
            'dbname': config.dbname,
            'user': config.user,
            'password': config.password,
            'dbtype': config.dbtype,
            'conn_name': config.conn_name,
            'schema': config.schema
        } for config in load_configs().values()}
        return f"Successfully reloaded {len(DBS)} database configurations."
    except Exception as e:
        return f"Error reloading configurations: {e}"

@mcp.tool()
def get_db_by_conn_name(conn_name: str) -> Dict[str, Any]:
    """
    Get database configuration by connection name.
    """
    for db_id, config in DBS.items():
        if config.get('conn_name') == conn_name:
                    return {
            "id": db_id,
            "conn_name": config.get('conn_name', db_id),
            "host": config.get('host', ''),
            "port": config.get('port', 5432),
            "dbname": config.get('dbname', ''),
            "user": config.get('user', ''),
            "dbtype": config.get('dbtype', 'postgres'),
            "schema": config.get('schema', 'public'),
            "password": "****"  # Hide actual password
        }
    raise ValueError(f"No database found with connection name '{conn_name}'")

@mcp.tool()
def introspect_schema(db_id: int, schema_name: str = 'public') -> dict[str, dict[str, str]]:
    """
    Return tables and columns (name → type) for the given db_id.
    This is a generic tool that delegates to specific database type tools.
    Args:
        db_id: Database identifier
        schema_name: Schema name to inspect (default: 'public' for PostgreSQL, ignored for MySQL)
    """
    cfg = DBS.get(db_id)
    if not cfg:
        raise ValueError(f"No DB with id '{db_id}'.")
    dbtype = cfg.get('dbtype', 'postgres')
    
    if dbtype == 'postgres':
        return introspect_postgres_schema(db_id, schema_name)
    elif dbtype == 'mysql':
        return introspect_mysql_schema(db_id)
    else:
        raise ValueError(f"Unsupported dbtype: {dbtype}")

@mcp.tool()
def introspect_postgres_schema(db_id: int, schema_name: str = 'public') -> dict[str, dict[str, str]]:
    """
    Return PostgreSQL database schema with detailed table and column information.
    Args:
        db_id: Database identifier
        schema_name: Schema name to inspect (default: 'public')
    Returns: Dict with table names as keys and column info as nested dict.
    """
    cfg = DBS.get(db_id)
    if not cfg:
        raise ValueError(f"No DB with id '{db_id}'.")
    
    if cfg.get('dbtype') != 'postgres':
        raise ValueError(f"Database '{db_id}' is not a PostgreSQL database")
    
    # Use explicit connection parameters to avoid issues with container networking
    try:
        conn = _pg_connect_with_fallback(cfg)
    except Exception as e:
        return {
            '_metadata': {
                'error': f'connection_failed: {e}',
                'connection_params': f"host={cfg.get('host')} port={cfg.get('port')} dbname={cfg.get('dbname')} user={cfg.get('user')}"
            }
        }
    cur = conn.cursor()
    
    # First, let's check if the schema exists and list all available schemas
    cur.execute("""
        SELECT schema_name 
        FROM information_schema.schemata 
        WHERE schema_name NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
          AND schema_name NOT LIKE 'pg_%'
        ORDER BY schema_name;
    """)
    available_schemas = [row[0] for row in cur.fetchall()]
    
    # Add 'public' as fallback if no schemas found
    if not available_schemas:
        available_schemas = ['public']
    
    # If the requested schema doesn't exist, use the first available one or 'public'
    if schema_name not in available_schemas:
        if 'public' in available_schemas:
            schema_name = 'public'
        elif available_schemas:
            schema_name = available_schemas[0]
    
    # Check if there are any tables in the schema first
    cur.execute("""
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = %s AND table_type = 'BASE TABLE'
        ORDER BY table_name;
    """, (schema_name,))
    
    table_names = [row[0] for row in cur.fetchall()]
    
    # If no tables found in requested schema, let's check ALL schemas
    if not table_names:
        cur.execute("""
            SELECT table_schema, table_name 
            FROM information_schema.tables 
            WHERE table_type = 'BASE TABLE'
            ORDER BY table_schema, table_name;
        """)
        all_tables = cur.fetchall()
        
        conn.close()
        return {
            '_metadata': {
                'requested_schema': schema_name,
                'available_schemas': ', '.join(available_schemas),
                'table_count': '0',
                'message': f'No tables found in schema "{schema_name}". Available schemas: {", ".join(available_schemas)}',
                'all_tables_found': f'Found {len(all_tables)} tables in database: ' + ', '.join([f'{schema}.{table}' for schema, table in all_tables[:10]]) + ('...' if len(all_tables) > 10 else ''),
                'debug_info': f'Queried schema: {schema_name}, Available schemas: {available_schemas}'
            }
        }
    
    # Now get detailed column information for all tables
    cur.execute("""
        SELECT 
            t.table_name,
            c.column_name,
            c.data_type,
            c.is_nullable,
            c.column_default,
            CASE 
                WHEN pk.column_name IS NOT NULL THEN 'PRIMARY KEY'
                WHEN fk.column_name IS NOT NULL THEN 'FOREIGN KEY'
                ELSE ''
            END as key_type,
            c.character_maximum_length,
            c.numeric_precision,
            c.numeric_scale
        FROM information_schema.tables t
        LEFT JOIN information_schema.columns c ON t.table_name = c.table_name AND t.table_schema = c.table_schema
        LEFT JOIN (
            SELECT kcu.column_name, kcu.table_name, kcu.table_schema
            FROM information_schema.key_column_usage kcu
            JOIN information_schema.table_constraints tc 
                ON kcu.constraint_name = tc.constraint_name
                AND kcu.table_schema = tc.table_schema
            WHERE tc.constraint_type = 'PRIMARY KEY'
        ) pk ON c.column_name = pk.column_name AND c.table_name = pk.table_name AND c.table_schema = pk.table_schema
        LEFT JOIN (
            SELECT kcu.column_name, kcu.table_name, kcu.table_schema
            FROM information_schema.key_column_usage kcu
            JOIN information_schema.table_constraints tc 
                ON kcu.constraint_name = tc.constraint_name
                AND kcu.table_schema = tc.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY'
        ) fk ON c.column_name = fk.column_name AND c.table_name = fk.table_name AND c.table_schema = fk.table_schema
        WHERE t.table_schema = %s AND t.table_type = 'BASE TABLE'
        ORDER BY t.table_name, c.ordinal_position;
    """, (schema_name,))
    
    rows = cur.fetchall()
    conn.close()
    
    schema: dict[str, dict[str, str]] = {}
    
    # Add metadata about the schema
    schema['_metadata'] = {
        'requested_schema': schema_name,
        'available_schemas': ', '.join(available_schemas),
        'table_count': str(len(table_names)),
        'tables_found': ', '.join(table_names)
    }
    
    for row in rows:
        if row[0] is None or row[1] is None:  # Skip if table_name or column_name is None
            continue
            
        table_name, column_name, data_type, is_nullable, column_default, key_type, char_max_len, num_precision, num_scale = row
        
        # Build detailed column type info
        type_info = data_type or 'unknown'
        if char_max_len:
            type_info += f"({char_max_len})"
        elif num_precision and num_scale:
            type_info += f"({num_precision},{num_scale})"
        elif num_precision:
            type_info += f"({num_precision})"
            
        if is_nullable == 'NO':
            type_info += " NOT NULL"
        if column_default:
            type_info += f" DEFAULT {column_default}"
        if key_type:
            type_info += f" [{key_type}]"
            
        schema.setdefault(table_name, {})[column_name] = type_info
    
    return schema

@mcp.tool()
def debug_postgres_connection(db_id: int) -> dict[str, str]:
    """
    Debug PostgreSQL connection and return basic database information.
    """
    cfg = DBS.get(db_id)
    if not cfg:
        raise ValueError(f"No DB with id '{db_id}'.")
    
    if cfg.get('dbtype') != 'postgres':
        raise ValueError(f"Database '{db_id}' is not a PostgreSQL database")
    
    try:
        conn_params = {k: v for k, v in cfg.items() if k in ['host', 'port', 'dbname', 'user', 'password']}
        conn = psycopg.connect(**conn_params)
        cur = conn.cursor()
        
        # Get basic database info
        cur.execute("SELECT current_database(), current_schema(), version();")
        db_info = cur.fetchone()
        current_db, current_schema, version = db_info
        
        # Get all schemas
        cur.execute("SELECT schema_name FROM information_schema.schemata ORDER BY schema_name;")
        all_schemas = [row[0] for row in cur.fetchall()]
        
        # Get all tables across all schemas
        cur.execute("""
            SELECT table_schema, table_name, table_type
            FROM information_schema.tables 
            WHERE table_type = 'BASE TABLE'
            ORDER BY table_schema, table_name;
        """)
        all_tables = cur.fetchall()
        
        # Get tables in 'public' schema specifically
        cur.execute("""
            SELECT table_name
            FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
            ORDER BY table_name;
        """)
        public_tables = [row[0] for row in cur.fetchall()]
        
        conn.close()
        
        return {
            'current_database': current_db,
            'current_schema': current_schema,
            'postgres_version': version,
            'all_schemas': ', '.join(all_schemas),
            'all_tables': ', '.join([f'{schema}.{table}' for schema, table, _ in all_tables]),
            'public_tables': ', '.join(public_tables),
            'total_schemas': str(len(all_schemas)),
            'total_tables': str(len(all_tables)),
            'public_table_count': str(len(public_tables))
        }
        
    except Exception as e:
        return {
            'error': str(e),
            'connection_config': f"host={cfg.get('host')}, port={cfg.get('port')}, dbname={cfg.get('dbname')}, user={cfg.get('user')}"
        }

@mcp.tool()
def introspect_mysql_schema(db_id: int) -> dict[str, dict[str, str]]:
    """
    Return MySQL database schema with detailed table and column information.
    Returns: Dict with table names as keys and column info as nested dict.
    """
    cfg = DBS.get(db_id)
    if not cfg:
        raise ValueError(f"No DB with id '{db_id}'.")
    
    if cfg.get('dbtype') != 'mysql':
        raise ValueError(f"Database '{db_id}' is not a MySQL database")
    
    conn = _mysql_connect_with_fallback(cfg)
    cur = conn.cursor()
    
    # Enhanced MySQL schema query with more details
    cur.execute("""
        SELECT 
            c.TABLE_NAME,
            c.COLUMN_NAME,
            c.COLUMN_TYPE,
            c.IS_NULLABLE,
            c.COLUMN_DEFAULT,
            c.COLUMN_KEY,
            c.EXTRA,
            c.COLUMN_COMMENT
        FROM INFORMATION_SCHEMA.COLUMNS c
        JOIN INFORMATION_SCHEMA.TABLES t 
            ON c.TABLE_SCHEMA = t.TABLE_SCHEMA 
            AND c.TABLE_NAME = t.TABLE_NAME
        WHERE c.TABLE_SCHEMA = %s 
            AND t.TABLE_TYPE = 'BASE TABLE'
        ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION;
    """, (cfg['dbname'],))
    
    rows = cur.fetchall()
    conn.close()
    
    schema: dict[str, dict[str, str]] = {}
    for row in rows:
        table_name, column_name, column_type, is_nullable, column_default, column_key, extra, column_comment = row
        
        # Build detailed column type info
        type_info = column_type
        
        if is_nullable == 'NO':
            type_info += " NOT NULL"
        if column_default is not None:
            type_info += f" DEFAULT {column_default}"
        if column_key:
            key_labels = {
                'PRI': 'PRIMARY KEY',
                'UNI': 'UNIQUE KEY',
                'MUL': 'INDEX'
            }
            type_info += f" [{key_labels.get(column_key, column_key)}]"
        if extra:
            type_info += f" {extra}"
        if column_comment:
            type_info += f" COMMENT '{column_comment}'"
            
        schema.setdefault(table_name, {})[column_name] = type_info
    
    return schema

def to_serializable(results):
    serializable = []
    for row in results:
        serializable.append({k: str(v) if v is not None else "" for k, v in row.items()})
    return serializable

@mcp.tool()
def select_data(
    db_id: int,
    table: str,
    columns: list[str],
    conditions: dict[str, str] = {}
) -> list[dict[str, str]]:
    """
    Execute a SELECT on one of the registered databases.
    """
    cfg = DBS.get(db_id)
    if not cfg:
        raise ValueError(f"No DB with id '{db_id}'.")
    dbtype = cfg.get('dbtype', 'postgres')
    if dbtype == 'postgres':
        conn = _pg_connect_with_fallback(cfg)
        # Ensure UTF-8 encoding for the session
        with conn.cursor() as cur_set:
            cur_set.execute("SET client_encoding TO 'UTF8';")
        cur = conn.cursor(row_factory=psycopg.rows.dict_row)
        from psycopg import sql
        cols = sql.SQL(',').join(map(sql.Identifier, columns))
        cond_sql = (
            sql.SQL(' AND ').join(
                sql.Composed([sql.Identifier(k), sql.SQL("=%s")])
                for k in conditions
            )
            if conditions else sql.SQL("TRUE")
        )
        query = sql.SQL("SELECT {} FROM {} WHERE {}" ).format(
            cols, sql.Identifier(table), cond_sql
        )
        cur.execute(query, tuple(conditions.values()))
        results = cur.fetchall()
        conn.close()
        print("select_data returning (postgres):", results)
        return to_serializable(results)
    elif dbtype == 'mysql':
        conn = _mysql_connect_with_fallback(cfg)
        cur = conn.cursor(dictionary=True)
        # Ensure UTF-8 for the session
        cur.execute("SET NAMES utf8mb4;")
        cols = ','.join(f'`{c}`' for c in columns)
        conds = ' AND '.join(f'`{k}`=%s' for k in conditions) if conditions else '1'
        query = f"SELECT {cols} FROM `{table}` WHERE {conds}"
        cur.execute(query, tuple(conditions.values()))
        results = cur.fetchall()
        conn.close()
        print("select_data returning (mysql):", results)
        return to_serializable(results)
    else:
        raise ValueError(f"Unsupported dbtype: {dbtype}")

if __name__ == "__main__":
    # mcp.run(transport="stdio")  # Or SSE for remote use
    mcp.http_app()
    mcp.run(
        transport="streamable-http",
        host="0.0.0.0",
        port=8017,
        path="/mcp",
        stateless_http=True
        # log_level="debug"
    )