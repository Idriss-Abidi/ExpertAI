import os
import yaml
from typing import Dict, Any
from dataclasses import dataclass
from dotenv import load_dotenv

# In-container default: file lives at /app/db_configs.yaml
# Allow override via CONFIG_FILE env var
CONFIG_FILE = os.getenv("CONFIG_FILE", "db_configs.yaml")

# Load .env file (only for local dev)
load_dotenv()

@dataclass
class DatabaseConfig:
    """Database configuration with all required fields"""
    id: int
    conn_name: str
    host: str
    port: int
    dbname: str
    user: str
    password: str
    dbtype: str
    schema: str = "public"  # Default schema for PostgreSQL

def load_configs() -> Dict[str, DatabaseConfig]:
    """
    Load database configurations from YAML file and resolve environment variables.
    Returns a dictionary of DatabaseConfig objects.
    """
    # Ensure file exists; if not, create an empty YAML mapping
    if not os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "w") as f:
                f.write("{}\n")
        except Exception:
            # Return empty if cannot create
            return {}

    with open(CONFIG_FILE, "r") as f:
        configs = yaml.safe_load(f) or {}

    db_configs = {}
    
    for name, cfg in configs.items():
        # Get password - try environment variable first, then direct password field
        env_var = cfg.get("password_var")
        direct_password = cfg.get("password")
        
        if env_var:
            password = os.getenv(env_var)
            if password is None:
                # Fall back to direct password if env var not found
                if direct_password:
                    password = direct_password
                else:
                    print(f"⚠️  Warning: Missing env var: {env_var} and no direct password. Using placeholder.")
                    password = "placeholder_password"
        elif direct_password:
            # Use direct password from YAML
            password = direct_password
        else:
            print(f"⚠️  Warning: No password specified for database '{name}'. Using placeholder password.")
            password = "placeholder_password"
        
        # Use custom ID if specified, otherwise use the key name
        db_id = cfg.get("id", name)
        if isinstance(db_id, str):
            # If ID is a string, try to convert to int, otherwise use as-is
            try:
                db_id = int(db_id)
            except ValueError:
                pass  # Keep as string if it can't be converted
        conn_name = cfg.get("conn_name", name)
        
        # Create DatabaseConfig object
        db_config = DatabaseConfig(
            id=db_id,
            conn_name=conn_name,
            host=cfg.get("host"),
            port=cfg.get("port"),
            dbname=cfg.get("dbname", ""),  # Default empty string if not specified
            user=cfg.get("user"),
            password=password,
            dbtype=cfg.get("type"),
            schema=cfg.get("schema", "public")  # Default to "public" for PostgreSQL
        )
        
        db_configs[db_id] = db_config
    
    return db_configs

def get_db_config(db_id: int) -> DatabaseConfig:
    """
    Get a specific database configuration by ID.
    """
    configs = load_configs()
    if db_id not in configs:
        raise ValueError(f"No database configuration found for ID: {db_id}")
    return configs[db_id]

def list_db_configs() -> Dict[str, DatabaseConfig]:
    """
    List all available database configurations.
    """
    return load_configs()
