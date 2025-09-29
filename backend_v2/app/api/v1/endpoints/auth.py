"""
Authentication endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import timedelta

from ....db.database import get_session
from ....models.user import Utilisateur
from ....schemas.auth import LoginRequest, Token, MessageResponse
from ....schemas.user import PasswordChangeRequest, UtilisateurCreate
from ....core.security import create_access_token, verify_password
from ....core.config import settings
from ....services.user_service import UserService
from ..dependencies.auth import get_current_active_user

router = APIRouter()


@router.post("/login", response_model=Token)
async def login(
    login_data: LoginRequest,
    session: AsyncSession = Depends(get_session)
):
    """Login endpoint that returns JWT token."""
    # Find user by email
    user = await UserService.get_user_by_email(session, login_data.email)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Verify password
    if not verify_password(login_data.mot_de_passe, user.mot_de_passe_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Check if user is active
    if not user.est_actif:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user"
        )
    
    # Create access token with user ID and admin status
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={
            "sub": user.email,
            "user_id": user.id,
            "is_admin": user.est_admin,
            "is_active": user.est_actif
        },
        expires_delta=access_token_expires
    )
    
    return Token(
        access_token=access_token,
        token_type="bearer",
        user=user
    )


@router.post("/register", response_model=Token)
async def register(
    user_data: UtilisateurCreate,
    session: AsyncSession = Depends(get_session)
):
    """Register a new user."""
    # Check if user already exists
    existing_user = await UserService.get_user_by_email(session, user_data.email)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Create new user
    new_user = await UserService.create_user(session, user_data)
    
    # Create access token for immediate login
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={
            "sub": new_user.email,
            "user_id": new_user.id,
            "is_admin": new_user.est_admin,
            "is_active": new_user.est_actif
        },
        expires_delta=access_token_expires
    )
    
    return Token(
        access_token=access_token,
        token_type="bearer",
        user=new_user
    )


@router.get("/me")
async def get_current_user_info(
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """Get current user information."""
    return current_user


@router.post("/change-password", response_model=MessageResponse)
async def change_password(
    password_data: PasswordChangeRequest,
    current_user: Utilisateur = Depends(get_current_active_user),
    session: AsyncSession = Depends(get_session)
):
    """Change user password."""
    await UserService.change_password(
        session,
        current_user,
        password_data.old_password,
        password_data.new_password
    )
    
    return MessageResponse(message="Password changed successfully")
