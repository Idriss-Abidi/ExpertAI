"""
Authentication dependencies.
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional

from ....core.security import verify_token
from ....db.database import get_session
from ....models.user import Utilisateur
from ....schemas.auth import TokenData

# Security
security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    session: AsyncSession = Depends(get_session)
) -> Utilisateur:
    """Get the current authenticated user."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = verify_token(credentials.credentials)
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
        token_data = TokenData(email=email)
    except HTTPException:
        raise credentials_exception
    
    # Get user from database
    result = await session.execute(
        select(Utilisateur).where(Utilisateur.email == token_data.email)
    )
    user = result.scalar_one_or_none()
    
    if user is None:
        raise credentials_exception
    
    if not user.est_actif:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user"
        )
    
    return user


async def get_current_active_user(
    current_user: Utilisateur = Depends(get_current_user)
) -> Utilisateur:
    """Get the current active user."""
    if not current_user.est_actif:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user


async def get_current_admin_user(
    current_user: Utilisateur = Depends(get_current_active_user)
) -> Utilisateur:
    """Get the current admin user."""
    if not current_user.est_admin:
        raise HTTPException(status_code=403, detail="Admin privileges required")
    return current_user
