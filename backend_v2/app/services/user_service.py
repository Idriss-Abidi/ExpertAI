"""
User service layer for business logic.
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException, status
from datetime import datetime
from typing import List, Optional

from ..models.user import Utilisateur
from ..schemas.user import UtilisateurCreate, UserProfileUpdate, UserStatusUpdate, UserAdminUpdate
from ..core.security import get_password_hash, verify_password


class UserService:
    """User service class."""
    
    @staticmethod
    async def create_user(
        session: AsyncSession, 
        user_data: UtilisateurCreate
    ) -> Utilisateur:
        """Create a new user."""
        # Check if email exists
        result = await session.execute(
            select(Utilisateur).where(Utilisateur.email == user_data.email)
        )
        if result.scalar_one_or_none():
            raise HTTPException(
                status_code=400, 
                detail="Email already registered"
            )
        
        # Create user with bcrypt hash
        hashed_password = get_password_hash(user_data.mot_de_passe)
        db_user = Utilisateur(
            nom=user_data.nom,
            prenom=user_data.prenom,
            email=user_data.email,
            mot_de_passe_hash=hashed_password,
            telephone=user_data.telephone,
            est_admin=user_data.est_admin,
            est_actif=user_data.est_actif
        )
        session.add(db_user)
        await session.commit()
        await session.refresh(db_user)
        return db_user
    
    @staticmethod
    async def get_user_by_id(
        session: AsyncSession, 
        user_id: int
    ) -> Optional[Utilisateur]:
        """Get user by ID."""
        return await session.get(Utilisateur, user_id)
    
    @staticmethod
    async def get_user_by_email(
        session: AsyncSession, 
        email: str
    ) -> Optional[Utilisateur]:
        """Get user by email."""
        result = await session.execute(
            select(Utilisateur).where(Utilisateur.email == email)
        )
        return result.scalar_one_or_none()
    
    @staticmethod
    async def get_all_users(
        session: AsyncSession
    ) -> List[Utilisateur]:
        """Get all users."""
        result = await session.execute(select(Utilisateur))
        return result.scalars().all()
    
    @staticmethod
    async def update_user_profile(
        session: AsyncSession,
        user: Utilisateur,
        profile_data: UserProfileUpdate
    ) -> Utilisateur:
        """Update user profile."""
        # Check if email is being changed and if it already exists
        if profile_data.email != user.email:
            result = await session.execute(
                select(Utilisateur).where(Utilisateur.email == profile_data.email)
            )
            if result.scalar_one_or_none():
                raise HTTPException(
                    status_code=400, 
                    detail="Email already registered"
                )
        
        # Update user profile
        user.nom = profile_data.nom
        user.prenom = profile_data.prenom
        user.email = profile_data.email
        user.telephone = profile_data.telephone
        user.date_modification = datetime.utcnow()
        
        await session.commit()
        await session.refresh(user)
        return user
    
    @staticmethod
    async def update_user_status(
        session: AsyncSession,
        user: Utilisateur,
        status_data: UserStatusUpdate,
        current_user: Utilisateur
    ) -> Utilisateur:
        """Update user status."""
        # Prevent admin from deactivating themselves
        if user.id == current_user.id:
            raise HTTPException(
                status_code=400, 
                detail="Cannot modify your own status"
            )
        
        user.est_actif = status_data.est_actif
        user.date_modification = datetime.utcnow()
        
        await session.commit()
        await session.refresh(user)
        return user
    
    @staticmethod
    async def update_user_admin(
        session: AsyncSession,
        user: Utilisateur,
        admin_data: UserAdminUpdate,
        current_user: Utilisateur
    ) -> Utilisateur:
        """Update user admin status."""
        # Prevent admin from removing admin from themselves
        if user.id == current_user.id:
            raise HTTPException(
                status_code=400, 
                detail="Cannot modify your own admin status"
            )
        
        user.est_admin = admin_data.est_admin
        user.date_modification = datetime.utcnow()
        
        await session.commit()
        await session.refresh(user)
        return user
    
    @staticmethod
    async def change_password(
        session: AsyncSession,
        user: Utilisateur,
        old_password: str,
        new_password: str
    ) -> None:
        """Change user password."""
        # Verify old password
        if not verify_password(old_password, user.mot_de_passe_hash):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Current password is incorrect"
            )
        
        # Hash new password
        new_password_hash = get_password_hash(new_password)
        
        # Update password in database
        user.mot_de_passe_hash = new_password_hash
        user.date_modification = datetime.utcnow()
        
        await session.commit()
    
    @staticmethod
    async def delete_user(
        session: AsyncSession,
        user: Utilisateur
    ) -> None:
        """Delete a user."""
        await session.delete(user)
        await session.commit()
