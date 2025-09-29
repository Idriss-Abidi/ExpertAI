"""
API Key management endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from ....db.database import get_session
from ....models.user import Utilisateur
from ....schemas.api_key import CleApiCreate, CleApiUpdate, CleApiRead
from ....schemas.auth import MessageResponse
from ....services.api_key_service import ApiKeyService
from ..dependencies.auth import get_current_active_user, get_current_admin_user

router = APIRouter()


@router.get("/{user_id}", response_model=CleApiRead)
async def get_api_keys(
    user_id: int,
    session: AsyncSession = Depends(get_session),
    current_user: Utilisateur = Depends(get_current_active_user)
):
    """Get API keys for a specific user."""
    api_keys = await ApiKeyService.get_api_keys(session, user_id)
    
    if not api_keys:
        # Return empty API keys if none exist
        return CleApiRead(
            id=0,
            utilisateur_id=user_id,
            cle_openai=None,
            cle_gemini=None,
            cle_claude=None,
            cle_deepseek=None,
            cle_scopus=None
        )
    
    return api_keys


@router.post("/", response_model=CleApiRead)
async def create_api_keys(
    api_keys_data: CleApiCreate,
    session: AsyncSession = Depends(get_session),
    current_user: Utilisateur = Depends(get_current_admin_user)
):
    """Create new API keys for a user (admin only)."""
    return await ApiKeyService.create_api_keys(session, api_keys_data)


@router.put("/{user_id}", response_model=CleApiRead)
async def update_api_keys(
    user_id: int,
    api_keys_data: CleApiUpdate,
    session: AsyncSession = Depends(get_session),
    current_user: Utilisateur = Depends(get_current_admin_user)
):
    """Update API keys for a user (admin only)."""
    return await ApiKeyService.update_api_keys(session, user_id, api_keys_data)


@router.delete("/{user_id}", response_model=MessageResponse)
async def delete_api_keys(
    user_id: int,
    session: AsyncSession = Depends(get_session),
    current_user: Utilisateur = Depends(get_current_admin_user)
):
    """Delete API keys for a user (admin only)."""
    await ApiKeyService.delete_api_keys(session, user_id)
    return MessageResponse(message="API keys deleted successfully")


@router.get("/model/{model_name}")
async def get_api_key_for_model(
    model_name: str,
    session: AsyncSession = Depends(get_session)
):
    """Get API key for a specific model from the database."""
    try:
        return await ApiKeyService.get_api_key_for_model(session, model_name)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving API key: {str(e)}")
