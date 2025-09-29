"""
User management endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from ....db.database import get_session
from ....models.user import Utilisateur
from ....schemas.user import (
    UtilisateurCreate,
    UtilisateurRead,
    UserProfileUpdate,
    UserStatusUpdate,
    UserAdminUpdate
)
from ....schemas.auth import MessageResponse
from ....services.user_service import UserService
from ..dependencies.auth import get_current_active_user, get_current_admin_user

router = APIRouter()


@router.post("/", response_model=UtilisateurRead)
async def create_user(
    user_data: UtilisateurCreate,
    session: AsyncSession = Depends(get_session),
    current_user: Utilisateur = Depends(get_current_admin_user)
):
    """Create a new user (admin only)."""
    return await UserService.create_user(session, user_data)


@router.get("/", response_model=List[UtilisateurRead])
async def list_users(
    session: AsyncSession = Depends(get_session),
    current_user: Utilisateur = Depends(get_current_admin_user)
):
    """List all users (admin only)."""
    return await UserService.get_all_users(session)


@router.get("/{user_id}", response_model=UtilisateurRead)
async def get_user(
    user_id: int,
    session: AsyncSession = Depends(get_session),
    current_user: Utilisateur = Depends(get_current_admin_user)
):
    """Get a specific user (admin only)."""
    user = await UserService.get_user_by_id(session, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.delete("/{user_id}", response_model=MessageResponse)
async def delete_user(
    user_id: int,
    session: AsyncSession = Depends(get_session),
    current_user: Utilisateur = Depends(get_current_admin_user)
):
    """Delete a user (admin only)."""
    user = await UserService.get_user_by_id(session, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    await UserService.delete_user(session, user)
    return MessageResponse(message=f"User {user.nom} {user.prenom} deleted")


@router.patch("/{user_id}/toggle-status", response_model=MessageResponse)
async def toggle_user_status(
    user_id: int,
    status_update: UserStatusUpdate,
    current_user: Utilisateur = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session)
):
    """Toggle user active status (admin only)."""
    user = await UserService.get_user_by_id(session, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    await UserService.update_user_status(session, user, status_update, current_user)
    
    status_text = "activated" if status_update.est_actif else "deactivated"
    return MessageResponse(message=f"User {user.prenom} {user.nom} {status_text}")


@router.patch("/{user_id}/toggle-admin", response_model=MessageResponse)
async def toggle_user_admin(
    user_id: int,
    admin_update: UserAdminUpdate,
    current_user: Utilisateur = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session)
):
    """Toggle user admin privileges (admin only)."""
    user = await UserService.get_user_by_id(session, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    await UserService.update_user_admin(session, user, admin_update, current_user)
    
    admin_text = "promoted to admin" if admin_update.est_admin else "removed from admins"
    return MessageResponse(message=f"User {user.prenom} {user.nom} {admin_text}")


@router.patch("/profile", response_model=UtilisateurRead)
async def update_user_profile(
    profile_update: UserProfileUpdate,
    current_user: Utilisateur = Depends(get_current_active_user),
    session: AsyncSession = Depends(get_session)
):
    """Update current user's profile information."""
    return await UserService.update_user_profile(session, current_user, profile_update)
