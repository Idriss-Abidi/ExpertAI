"""
Database-related models
"""

from typing import Dict, List, Optional
from pydantic import BaseModel, Field, field_validator
from datetime import datetime


class DatabaseConnectionRequest(BaseModel):
    id: Optional[str] = Field(None, description="Unique identifier for the database connection (optional, will be assigned by MCP server)")
    name: str = Field(..., description="Display name for the connection")
    host: str = Field(..., description="Database host address")
    port: int = Field(..., ge=1, le=65535, description="Database port number")
    dbname: str = Field(..., description="Database name")
    user: str = Field(..., description="Database username")
    password: str = Field(..., description="Database password")
    dbtype: str = Field("postgres", description="Database type (postgres, mysql, sqlite, mongodb)")
    schema_name: Optional[str] = Field("public", description="Database schema (for PostgreSQL)")
    schema: Optional[str] = Field(None, description="Database schema (alternative field name for compatibility)")
    
    def get_schema(self) -> str:
        """Get schema value, preferring schema_name over schema, with 'public' as default"""
        if self.schema_name and self.schema_name != "public":
            return self.schema_name
        elif self.schema:
            return self.schema
        else:
            return "public"
    
    @field_validator('dbtype')
    @classmethod
    def validate_dbtype(cls, v):
        val = (v or '').strip().lower()
        # Normalize common synonyms
        if val in ['postgresql', 'pg']: 
            val = 'postgres'
        if val in ['mariadb']: 
            val = 'mysql'
        allowed_types = ['postgres', 'mysql', 'sqlite', 'mongodb']
        if val not in allowed_types:
            raise ValueError(f'Database type must be one of: {allowed_types}')
        return val


class DatabaseConnectionResponse(BaseModel):
    id: str
    name: str
    host: str
    port: int
    dbname: str
    user: str
    dbtype: str
    schema_name: Optional[str] = None
    status: str
    created_at: datetime
    last_tested: Optional[datetime] = None


class TableSelectionRequest(BaseModel):
    db_id: str = Field(..., description="Database connection ID")
    table_name: str = Field(..., description="Table name to query")
    columns: List[str] = Field(..., description="Columns to select")
    conditions: Optional[Dict[str, str]] = Field(None, description="WHERE conditions")
    limit: Optional[int] = Field(100, ge=1, le=1000, description="Maximum rows to return")


class SimpleDatabaseCreate(BaseModel):
    id_user: int = Field(default=1, description="User ID")
    conn_name: str = Field(..., description="Connection name (display name)")
    dbName: str = Field(..., description="Database name")
    type: str = Field(..., description="Database type (postgres or mysql)")
    host: str = Field(..., description="Database host")
    port: int = Field(..., description="Database port")
    username: str = Field(..., description="Database username")
    pw: str = Field(..., description="Database password")
    schema_name: str = Field(default="public", description="Database schema (for PostgreSQL)")
    
    @field_validator('type')
    @classmethod
    def validate_type(cls, v):
        val = (v or '').strip().lower()
        if val in ['postgresql', 'pg']:
            val = 'postgres'
        if val in ['mariadb']:
            val = 'mysql'
        allowed_types = ['postgres', 'mysql']
        if val not in allowed_types:
            raise ValueError(f'Database type must be one of: {allowed_types}')
        return val


class FrontendDatabaseCreate(BaseModel):
    """Model to accept frontend database creation requests with different field names"""
    id: str = Field(..., description="Database ID from frontend")
    name: str = Field(..., description="Database name")
    host: str = Field(..., description="Database host")
    port: int = Field(..., description="Database port")
    dbname: str = Field(..., description="Database name")
    user: str = Field(..., description="Database username")
    password: str = Field(..., description="Database password")
    dbtype: str = Field(..., description="Database type (postgres or mysql)")
    schema_name: str = Field(default="public", description="Database schema (for PostgreSQL)")
    
    @field_validator('dbtype')
    @classmethod
    def validate_dbtype(cls, v):
        allowed_types = ['postgres', 'mysql']
        if v.lower() not in allowed_types:
            raise ValueError(f'Database type must be one of: {allowed_types}')
        return v.lower()
    
    def to_simple_database_create(self) -> SimpleDatabaseCreate:
        """Convert to SimpleDatabaseCreate format"""
        return SimpleDatabaseCreate(
            id_user=1,  # Default user ID
            conn_name=self.name,
            dbName=self.dbname,
            type=self.dbtype,
            host=self.host,
            port=self.port,
            username=self.user,
            pw=self.password,
            schema_name=self.schema_name
        )


class SimpleDatabaseResponse(BaseModel):
    id: int
    id_user: int
    conn_name: str
    dbName: str
    type: str
    host: str
    port: int
    username: str
    pw: str
    schema_name: str = "public"
    status: str = "connected"
    created_at: datetime = Field(default_factory=datetime.now)
    last_tested: Optional[datetime] = None


class ColumnMapping(BaseModel):
    # required_key -> table_column
    mapping: Dict[str, str]
