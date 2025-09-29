"""
Authentication Pydantic schemas.
"""
from pydantic import BaseModel
from typing import Optional
from .user import UtilisateurRead


class Token(BaseModel):
    """Token response schema."""
    access_token: str
    token_type: str
    user: UtilisateurRead


class TokenData(BaseModel):
    """Token data schema."""
    email: Optional[str] = None


class LoginRequest(BaseModel):
    """Login request schema."""
    email: str
    mot_de_passe: str


class MessageResponse(BaseModel):
    """Generic message response schema."""
    message: str
