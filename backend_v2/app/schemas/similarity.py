"""
Schemas for similarity search endpoints.
"""
from typing import Optional, List
from pydantic import BaseModel


class ProjectQuery(BaseModel):
    """Project query for similarity search."""
    title: str
    description: str
    top_k: Optional[int] = 10
    similarity_threshold: Optional[float] = 0.7


class ResearcherMatch(BaseModel):
    """Researcher match result."""
    id: int
    nom: str
    prenom: str
    affiliation: Optional[str] = None
    orcid_id: Optional[str] = None
    domaines_recherche: Optional[str] = None
    mots_cles_specifiques: Optional[str] = None
    similarity_score: float
    matched_content: str


class DetailedResearcherMatch(ResearcherMatch):
    """Detailed researcher match with breakdown."""
    domain_similarity: float
    keywords_similarity: float
    best_match_type: str


class HealthStatus(BaseModel):
    """RAG system health status."""
    status: str
    database: Optional[str] = None
    ollama: Optional[str] = None
    vector_store: Optional[str] = None
    documents_count: Optional[int] = None
    error: Optional[str] = None


class SystemStats(BaseModel):
    """RAG system statistics."""
    total_researchers: int
    embedding_model: str
    vector_store_type: str
    retriever_type: str


class RefreshResponse(BaseModel):
    """Data refresh response."""
    message: str