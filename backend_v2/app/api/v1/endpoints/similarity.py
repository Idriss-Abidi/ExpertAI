"""
Similarity search endpoints.
"""
import logging
from typing import List
from fastapi import APIRouter, HTTPException, BackgroundTasks

from ....schemas.similarity import (
    ProjectQuery, 
    ResearcherMatch, 
    DetailedResearcherMatch,
    HealthStatus,
    SystemStats,
    RefreshResponse
)
from ....services.similarity_service import rag_service

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/search", response_model=List[ResearcherMatch])
async def search_researchers(query: ProjectQuery):
    """
    Search for researchers based on project title and description using RAG.
    """
    try:
        # Combine title and description for comprehensive search
        search_query = f"{query.title} {query.description}".strip()
        
        if not search_query:
            raise HTTPException(
                status_code=400, 
                detail="Project title or description must be provided"
            )
        
        logger.info(f"Searching for: {search_query[:100]}...")
        
        matches = await rag_service.search_similar_researchers(
            query=search_query,
            top_k=query.top_k,
            similarity_threshold=query.similarity_threshold
        )
        
        logger.info(f"Found {len(matches)} matching researchers")
        return matches
        
    except Exception as e:
        logger.error(f"Search endpoint error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/search/detailed", response_model=List[DetailedResearcherMatch])
async def detailed_search(query: ProjectQuery):
    """
    Enhanced search with detailed matching information.
    """
    try:
        search_query = f"{query.title} {query.description}".strip()
        
        if not search_query:
            raise HTTPException(
                status_code=400, 
                detail="Project title or description must be provided"
            )
        
        logger.info(f"Detailed search for: {search_query[:100]}...")
        
        matches = await rag_service.detailed_search(
            query=search_query,
            top_k=query.top_k,
            similarity_threshold=query.similarity_threshold
        )
        
        logger.info(f"Found {len(matches)} detailed matches")
        return matches
        
    except Exception as e:
        logger.error(f"Detailed search endpoint error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/health", response_model=HealthStatus)
async def health_check():
    """Health check endpoint for RAG system."""
    try:
        health_data = await rag_service.get_health_status()
        return HealthStatus(**health_data)
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return HealthStatus(
            status="unhealthy",
            error=str(e)
        )


@router.get("/stats", response_model=SystemStats)
async def get_stats():
    """Get statistics about the RAG system."""
    try:
        stats_data = rag_service.get_stats()
        return SystemStats(**stats_data)
    except Exception as e:
        logger.error(f"Stats endpoint error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/refresh", response_model=RefreshResponse)
async def refresh_data(background_tasks: BackgroundTasks):
    """Refresh the vector store with latest database data."""
    try:
        background_tasks.add_task(rag_service.refresh_data)
        return RefreshResponse(message="Data refresh initiated in background")
    except Exception as e:
        logger.error(f"Refresh endpoint error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/debug")
async def debug_info():
    """Debug endpoint to inspect service state."""
    try:
        return {
            "service_initialized": rag_service.vectorstore is not None,
            "embeddings_initialized": rag_service.embeddings is not None,
            "documents_loaded": len(rag_service.documents),
            "researcher_metadata_count": len(rag_service.researcher_metadata),
            "sample_researcher_ids": list(rag_service.researcher_metadata.keys())[:5],
            "bm25_retriever": rag_service.bm25_retriever is not None,
            "ensemble_retriever": rag_service.ensemble_retriever is not None,
            "sample_documents": [
                {
                    "content": doc.page_content[:100] + "..." if len(doc.page_content) > 100 else doc.page_content,
                    "metadata": doc.metadata
                } for doc in rag_service.documents[:3]
            ]
        }
    except Exception as e:
        logger.error(f"Debug endpoint error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/test-search/{query}")
async def test_search(query: str):
    """Test search endpoint for debugging."""
    logger.info(f"Test search called with query: {query}")
    
    if not rag_service.ensemble_retriever:
        logger.error("Ensemble retriever not initialized")
        return {"error": "Service not properly initialized", "retriever_status": "not_initialized"}
    
    try:
        # Test retrieval
        docs = rag_service.ensemble_retriever.get_relevant_documents(query)
        logger.info(f"Retrieved {len(docs)} documents")
        
        results = []
        for doc in docs[:5]:  # Limit to top 5 for testing
            doc_id = doc.metadata.get('researcher_id')
            if doc_id and doc_id in rag_service.researcher_metadata:
                researcher_data = rag_service.researcher_metadata[doc_id]
                results.append({
                    "id": doc_id,
                    "name": f"{researcher_data.get('prenom', '')} {researcher_data.get('nom', '')}",
                    "content": doc.page_content[:200] + "..." if len(doc.page_content) > 200 else doc.page_content,
                    "metadata": doc.metadata
                })
        
        return {
            "query": query,
            "total_docs_retrieved": len(docs),
            "results": results,
            "status": "success"
        }
    except Exception as e:
        logger.error(f"Test search failed: {e}")
        return {"error": str(e), "status": "failed"}