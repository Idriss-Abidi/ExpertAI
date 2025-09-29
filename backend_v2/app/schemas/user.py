"""
User Pydantic schemas.
"""
from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class UtilisateurBase(BaseModel):
    """Base user schema."""
    nom: str
    prenom: str
    email: str
    telephone: Optional[str] = None
    est_admin: bool = False
    est_actif: bool = True


class UtilisateurCreate(UtilisateurBase):
    """Schema for creating a user."""
    mot_de_passe: str


class UtilisateurRead(UtilisateurBase):
    """Schema for reading user data."""
    id: int
    date_creation: datetime

    class Config:
        from_attributes = True


class UserProfileUpdate(BaseModel):
    """Schema for updating user profile."""
    nom: str
    prenom: str
    email: str
    telephone: Optional[str] = None


class UserStatusUpdate(BaseModel):
    """Schema for updating user status."""
    est_actif: bool


class UserAdminUpdate(BaseModel):
    """Schema for updating user admin status."""
    est_admin: bool


class PasswordChangeRequest(BaseModel):
    """Schema for password change request."""
    old_password: str
    new_password: str
