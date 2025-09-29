"""
Researcher management endpoints.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional, Dict, Any

from ....db.database import get_session
from ....models.researcher import Chercheur
from ....schemas.researcher import ChercheurCreate, ChercheurRead
from ....schemas.auth import MessageResponse
from ....services.researcher_service import ResearcherService
# Temporarily disabled for light build
# from ....schemas.similarity import ProjectQuery, ResearcherMatch
# from ....services.similarity_service import rag_service

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/", response_model=ChercheurRead)
async def create_researcher(
    researcher_data: ChercheurCreate,
    session: AsyncSession = Depends(get_session)
):
    """Create a new researcher."""
    try:
        return await ResearcherService.create_researcher(session, researcher_data)
    except HTTPException:
        # Re-raise HTTP exceptions (like 409 for duplicates)
        raise
    except Exception as e:
        await session.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create researcher: {str(e)}")


@router.post("/save")
async def save_researchers_bulk(
    request: Dict[str, Any],
    session: AsyncSession = Depends(get_session)
):
    """Save multiple researchers from ORCID search results."""
    try:
        researchers_data = request.get("chercheurs", [])
        if not researchers_data:
            raise HTTPException(status_code=400, detail="No researchers data provided")
        
        return await ResearcherService.save_researchers_bulk(session, researchers_data)
        
    except Exception as e:
        await session.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to save researchers: {str(e)}")


@router.post("/check-orcid")
async def check_researcher_by_orcid(
    request: Dict[str, Any],
    session: AsyncSession = Depends(get_session)
):
    """Check if a researcher with the given ORCID ID already exists."""
    try:
        orcid_id = request.get("orcid_id")
        if not orcid_id:
            raise HTTPException(status_code=400, detail="ORCID ID is required")
        
        # Query for existing researcher with this ORCID
        existing_researcher = await ResearcherService.get_researcher_by_orcid(session, orcid_id)
        
        if existing_researcher:
            return {
                "exists": True,
                "researcher": {
                    "id": existing_researcher.id,
                    "nom": existing_researcher.nom,
                    "prenom": existing_researcher.prenom,
                    "affiliation": existing_researcher.affiliation,
                    "orcid_id": existing_researcher.orcid_id,
                    "domaines_recherche": existing_researcher.domaines_recherche,
                    "mots_cles_specifiques": existing_researcher.mots_cles_specifiques
                }
            }
        else:
            return {
                "exists": False,
                "researcher": None
            }
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to check ORCID: {str(e)}")


@router.get("/", response_model=List[ChercheurRead])
async def list_researchers(
    skip: int = 0,
    limit: int = 100,
    search: Optional[str] = None,
    session: AsyncSession = Depends(get_session)
):
    """Get all researchers with optional search."""
    return await ResearcherService.get_all_researchers(session, skip, limit, search)


# Temporarily disabled for light build
# @router.post("/search", response_model=List[ResearcherMatch])
# async def search_researchers_by_similarity(query: ProjectQuery):
#     """
#     Search for researchers using RAG-based similarity search.
#     This provides intelligent matching based on project descriptions.
#     """
#     try:
#         # Combine title and description for comprehensive search
#         search_query = f"{query.title} {query.description}".strip()
#         
#         if not search_query:
#             raise HTTPException(
#                 status_code=400, 
#                 detail="Project title or description must be provided"
#             )
#         
#         logger.info(f"RAG search for: {search_query[:100]}...")
#         
#         matches = await rag_service.search_similar_researchers(
#             query=search_query,
#             top_k=query.top_k or 10,
#             similarity_threshold=query.similarity_threshold or 0.0
#         )
#         
#         logger.info(f"Found {len(matches)} matching researchers via RAG")
#         return matches
#         
#     except Exception as e:
#         logger.error(f"RAG search endpoint error: {e}")
#         raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")


@router.get("/{researcher_id}", response_model=ChercheurRead)
async def get_researcher(
    researcher_id: int,
    session: AsyncSession = Depends(get_session)
):
    """Get a specific researcher by ID."""
    researcher = await ResearcherService.get_researcher_by_id(session, researcher_id)
    if not researcher:
        raise HTTPException(status_code=404, detail="Researcher not found")
    return researcher


@router.post("/overwrite")
async def overwrite_researchers(
    request: Dict[str, Any],
    session: AsyncSession = Depends(get_session)
):
    """Overwrite existing researchers with new data."""
    try:
        researchers_data = request.get("chercheurs", [])
        if not researchers_data:
            raise HTTPException(status_code=400, detail="No researchers data provided")
        
        return await ResearcherService.overwrite_researchers(session, researchers_data)
        
    except Exception as e:
        await session.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to overwrite researchers: {str(e)}")


@router.put("/{researcher_id}", response_model=ChercheurRead)
async def update_researcher(
    researcher_id: int,
    researcher_data: ChercheurCreate,
    session: AsyncSession = Depends(get_session)
):
    """Update an existing researcher."""
    researcher = await ResearcherService.get_researcher_by_id(session, researcher_id)
    if not researcher:
        raise HTTPException(status_code=404, detail="Researcher not found")
    
    try:
        return await ResearcherService.update_researcher(session, researcher, researcher_data)
    except Exception as e:
        await session.rollback()
        raise HTTPException(status_code=400, detail=f"Failed to update researcher: {str(e)}")


@router.delete("/{researcher_id}", response_model=MessageResponse)
async def delete_researcher(
    researcher_id: int,
    session: AsyncSession = Depends(get_session)
):
    """Delete a researcher."""
    researcher = await ResearcherService.get_researcher_by_id(session, researcher_id)
    if not researcher:
        raise HTTPException(status_code=404, detail="Researcher not found")

    try:
        await ResearcherService.delete_researcher(session, researcher)
        return MessageResponse(message=f"Researcher {researcher.prenom} {researcher.nom} deleted")
    except Exception as e:
        await session.rollback()
        raise HTTPException(status_code=400, detail=f"Failed to delete researcher: {str(e)}")
