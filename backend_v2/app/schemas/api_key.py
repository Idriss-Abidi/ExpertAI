"""
API Key Pydantic schemas.
"""
from pydantic import BaseModel
from typing import Optional


class CleApiBase(BaseModel):
    """Base API key schema."""
    cle_openai: Optional[str] = None
    cle_gemini: Optional[str] = None
    cle_claude: Optional[str] = None
    cle_deepseek: Optional[str] = None
    cle_scopus: Optional[str] = None


class CleApiCreate(CleApiBase):
    """Schema for creating API keys."""
    utilisateur_id: int = 1  # Default to user 1


class CleApiUpdate(CleApiBase):
    """Schema for updating API keys."""
    pass


class CleApiRead(CleApiBase):
    """Schema for reading API key data."""
    id: int
    utilisateur_id: int

    class Config:
        from_attributes = True
