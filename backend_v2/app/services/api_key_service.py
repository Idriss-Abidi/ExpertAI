"""
API Key service layer for business logic.
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException, status
from typing import Optional

from ..models.api_key import CleApi
from ..schemas.api_key import CleApiCreate, CleApiUpdate


class ApiKeyService:
    """API Key service class."""
    
    @staticmethod
    async def get_api_keys(
        session: AsyncSession,
        user_id: int
    ) -> Optional[CleApi]:
        """Get API keys for a specific user."""
        result = await session.execute(
            select(CleApi).where(CleApi.utilisateur_id == user_id)
        )
        return result.scalar_one_or_none()
    
    @staticmethod
    async def create_api_keys(
        session: AsyncSession,
        api_keys_data: CleApiCreate
    ) -> CleApi:
        """Create new API keys for a user."""
        # Check if API keys already exist for this user
        existing_result = await session.execute(
            select(CleApi).where(CleApi.utilisateur_id == api_keys_data.utilisateur_id)
        )
        existing_keys = existing_result.scalar_one_or_none()
        
        if existing_keys:
            raise HTTPException(
                status_code=400,
                detail="API keys already exist for this user. Use PUT to update them."
            )
        
        # Create new API keys
        db_keys = CleApi(
            utilisateur_id=api_keys_data.utilisateur_id,
            cle_openai=api_keys_data.cle_openai,
            cle_gemini=api_keys_data.cle_gemini,
            cle_claude=api_keys_data.cle_claude,
            cle_deepseek=api_keys_data.cle_deepseek,
            cle_scopus=api_keys_data.cle_scopus
        )
        
        session.add(db_keys)
        await session.commit()
        await session.refresh(db_keys)
        return db_keys
    
    @staticmethod
    async def update_api_keys(
        session: AsyncSession,
        user_id: int,
        api_keys_data: CleApiUpdate
    ) -> CleApi:
        """Update API keys for a user."""
        # Check if API keys exist for this user
        result = await session.execute(
            select(CleApi).where(CleApi.utilisateur_id == user_id)
        )
        db_keys = result.scalar_one_or_none()
        
        if not db_keys:
            # Create new API keys if they don't exist
            db_keys = CleApi(utilisateur_id=user_id)
            session.add(db_keys)
        
        # Update only the provided fields
        if api_keys_data.cle_openai is not None:
            db_keys.cle_openai = api_keys_data.cle_openai
        if api_keys_data.cle_gemini is not None:
            db_keys.cle_gemini = api_keys_data.cle_gemini
        if api_keys_data.cle_claude is not None:
            db_keys.cle_claude = api_keys_data.cle_claude
        if api_keys_data.cle_deepseek is not None:
            db_keys.cle_deepseek = api_keys_data.cle_deepseek
        if api_keys_data.cle_scopus is not None:
            db_keys.cle_scopus = api_keys_data.cle_scopus
        
        await session.commit()
        await session.refresh(db_keys)
        return db_keys
    
    @staticmethod
    async def delete_api_keys(
        session: AsyncSession,
        user_id: int
    ) -> None:
        """Delete API keys for a user."""
        result = await session.execute(
            select(CleApi).where(CleApi.utilisateur_id == user_id)
        )
        db_keys = result.scalar_one_or_none()
        
        if not db_keys:
            raise HTTPException(
                status_code=404,
                detail="API keys not found for this user"
            )
        
        await session.delete(db_keys)
        await session.commit()
    
    @staticmethod
    async def get_api_key_for_model(
        session: AsyncSession,
        model_name: str
    ) -> dict:
        """Get API key for a specific model from the database."""
        # Get the first API key record (assuming global API keys)
        result = await session.execute(select(CleApi))
        api_keys = result.scalar_one_or_none()
        
        if not api_keys:
            raise HTTPException(
                status_code=404,
                detail="No API keys found in database"
            )
        
        # Determine which API key to return based on model name
        print(f"[DEBUG] Model name: {model_name}")
        print(f"[DEBUG] Available keys - OpenAI: {bool(api_keys.cle_openai)}, Gemini: {bool(api_keys.cle_gemini)}, DeepSeek: {bool(api_keys.cle_deepseek)}")
        
        if model_name.startswith("o4-") or model_name.startswith("gpt-"):
            api_key = api_keys.cle_openai
            provider = "openai"
            print(f"[DEBUG] Using OpenAI key for {model_name}")
        elif model_name.startswith("gemini") or "gemini" in model_name:
            if api_keys.cle_gemini:
                api_key = api_keys.cle_gemini
                provider = "gemini"
                print(f"[DEBUG] Using Gemini key for {model_name}")
            else:
                # Fallback to OpenAI key for Gemini models if Gemini key not available
                api_key = api_keys.cle_openai
                provider = "openai"
                print(f"[DEBUG] Gemini key not available, using OpenAI key for {model_name}")
        elif model_name.startswith("deepseek") or "deepseek" in model_name:
            api_key = api_keys.cle_deepseek
            provider = "deepseek"
            print(f"[DEBUG] Using DeepSeek key for {model_name}")
        else:
            # Default to OpenAI
            api_key = api_keys.cle_openai
            provider = "openai"
            print(f"[DEBUG] Defaulting to OpenAI key for {model_name}")
        
        if not api_key:
            raise HTTPException(
                status_code=404,
                detail=f"API key not found for model: {model_name}"
            )
        
        return {
            "model_name": model_name,
            "api_key": api_key,
            "provider": provider
        }
