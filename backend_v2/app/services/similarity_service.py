"""
RAG-based similarity search service.
"""
import asyncio
import logging
from typing import List, Optional, Dict, Any
import psycopg2
import numpy as np
import os
from fastapi import HTTPException

from langchain_community.embeddings import OllamaEmbeddings
from langchain_community.vectorstores import Chroma
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.schema import Document
from langchain_community.retrievers import BM25Retriever
from langchain.retrievers import EnsembleRetriever

from ..schemas.similarity import ResearcherMatch, DetailedResearcherMatch
from ..core.config import settings

# Configure logging
logger = logging.getLogger(__name__)

# Configuration
DATABASE_CONFIG = {
    "host": os.getenv("POSTGRES_HOST", "postgres"),
    "port": int(os.getenv("POSTGRES_PORT", "5432")),
    "database": os.getenv("POSTGRES_DB", "research_db"),
    "user": os.getenv("POSTGRES_USER", "postgres"),
    "password": os.getenv("POSTGRES_PASSWORD", "postgres")
}

# Ollama model for embeddings - using a fast, efficient model
EMBEDDING_MODEL = "nomic-embed-text"  # Fast and efficient for embeddings
CHAT_MODEL = "llama3.1:latest"          # For potential chat completions


class RAGService:
    """RAG-based similarity search service."""
    
    def __init__(self):
        self.embeddings = None
        self.vectorstore = None
        self.bm25_retriever = None
        self.ensemble_retriever = None
        self.documents = []
        self.researcher_metadata = {}
        
    async def initialize(self):
        """Initialize the RAG service with embeddings and vector store"""
        try:
            # Initialize Ollama embeddings
            logger.info("Initializing Ollama embeddings...")
            # Use host.docker.internal to connect to host machine from Docker
            ollama_url = os.getenv("OLLAMA_BASE_URL", "http://host.docker.internal:11434")
            logger.info(f"Connecting to Ollama at: {ollama_url}")
            self.embeddings = OllamaEmbeddings(
                model=EMBEDDING_MODEL,
                base_url=ollama_url
            )
            
            # Test if Ollama is available
            try:
                test_embed = await asyncio.to_thread(
                    self.embeddings.embed_query, "test"
                )
                logger.info("Ollama connection successful")
            except Exception as e:
                logger.error(f"Ollama connection failed: {e}")
                raise HTTPException(
                    status_code=500, 
                    detail="Ollama service not available. Please ensure Ollama is running."
                )
            
            # Load and process researcher data
            await self.load_researcher_data()
            
            # Create vector store
            await self.create_vector_store()
            
            logger.info("RAG service initialized successfully")
            
        except Exception as e:
            logger.error(f"Failed to initialize RAG service: {e}")
            raise

    async def load_researcher_data(self):
        """Load researcher data from PostgreSQL database"""
        try:
            conn = psycopg2.connect(**DATABASE_CONFIG)
            cursor = conn.cursor()
            
            query = """
            SELECT id, nom, prenom, affiliation, orcid_id, 
                   domaines_recherche, mots_cles_specifiques
            FROM chercheurs
            WHERE domaines_recherche IS NOT NULL 
               OR mots_cles_specifiques IS NOT NULL
            """
            
            cursor.execute(query)
            researchers = cursor.fetchall()
            
            logger.info(f"Loaded {len(researchers)} researchers from database")
            
            # Process each researcher
            documents = []
            for researcher in researchers:
                researcher_id, nom, prenom, affiliation, orcid_id, domaines, mots_cles = researcher
                
                # Combine research domains and keywords for better matching
                content_parts = []
                if domaines:
                    content_parts.append(f"Domaines de recherche: {domaines}")
                if mots_cles:
                    content_parts.append(f"Mots-clés spécifiques: {mots_cles}")
                
                if content_parts:
                    content = " | ".join(content_parts)
                    
                    # Create document for vector store
                    doc = Document(
                        page_content=content,
                        metadata={
                            "researcher_id": researcher_id,
                            "nom": nom,
                            "prenom": prenom,
                            "affiliation": affiliation,
                            "orcid_id": orcid_id,
                            "domaines_recherche": domaines,
                            "mots_cles_specifiques": mots_cles
                        }
                    )
                    documents.append(doc)
                    
                    # Store metadata for quick lookup
                    self.researcher_metadata[researcher_id] = {
                        "nom": nom,
                        "prenom": prenom,
                        "affiliation": affiliation,
                        "orcid_id": orcid_id,
                        "domaines_recherche": domaines,
                        "mots_cles_specifiques": mots_cles
                    }
            
            self.documents = documents
            cursor.close()
            conn.close()
            
            logger.info(f"Processed {len(documents)} researcher documents")
            
        except Exception as e:
            logger.error(f"Database connection error: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"Database connection failed: {str(e)}"
            )

    async def create_vector_store(self):
        """Create vector store and hybrid retriever"""
        if not self.documents:
            raise ValueError("No documents loaded")
        
        try:
            # Create Chroma vector store
            logger.info("Creating vector store...")
            self.vectorstore = await asyncio.to_thread(
                Chroma.from_documents,
                documents=self.documents,
                embedding=self.embeddings,
                collection_name="researchers",
                persist_directory="./chroma_db"
            )
            
            # Create BM25 retriever for keyword matching
            self.bm25_retriever = BM25Retriever.from_documents(self.documents)
            self.bm25_retriever.k = 20  # Get more candidates for ensemble
            
            # Create ensemble retriever (combines semantic + keyword search)
            vector_retriever = self.vectorstore.as_retriever(
                search_kwargs={"k": 20}
            )
            
            self.ensemble_retriever = EnsembleRetriever(
                retrievers=[vector_retriever, self.bm25_retriever],
                weights=[0.7, 0.3]  # Favor semantic search slightly
            )
            
            logger.info("Vector store and retrievers created successfully")
            
        except Exception as e:
            logger.error(f"Vector store creation failed: {e}")
            raise

    async def search_similar_researchers(
        self, 
        query: str, 
        top_k: int = 10,
        similarity_threshold: float = 0.0
    ) -> List[ResearcherMatch]:
        """Search for researchers similar to the query using true cosine similarity, and penalize/filter placeholder profiles."""
        try:
            logger.info(f"[DEBUG] Query: {query}")

            # Define placeholder/generic values to filter or penalize
            PLACEHOLDER_DOMAINS = [
                None,
                "",
                "No research data found in ORCID profile",
                "N/A",
                "Not available",
                "Not specified"
            ]
            PLACEHOLDER_KEYWORDS = [
                None,
                "",
                "Unable to extract keywords",
                "N/A",
                "Not available",
                "Not specified"
            ]

            # Get query embedding once
            query_embedding = await asyncio.to_thread(self.embeddings.embed_query, query)
            query_embedding = np.array(query_embedding, dtype=np.float32)

            # Use ensemble retriever for hybrid search
            relevant_docs = await asyncio.to_thread(
                self.ensemble_retriever.get_relevant_documents,
                query
            )

            matches = []
            seen_researchers = set()

            for doc in relevant_docs:
                researcher_id = doc.metadata["researcher_id"]

                # Avoid duplicates
                if researcher_id in seen_researchers:
                    continue
                seen_researchers.add(researcher_id)

                domaines = doc.metadata.get("domaines_recherche")
                mots_cles = doc.metadata.get("mots_cles_specifiques")

                # Filter out researchers with both domains and keywords as placeholders
                is_placeholder_domain = (domaines in PLACEHOLDER_DOMAINS)
                is_placeholder_keywords = (mots_cles in PLACEHOLDER_KEYWORDS)

                # Get document embedding
                doc_embedding = await asyncio.to_thread(
                    self.embeddings.embed_query,
                    doc.page_content
                )
                doc_embedding = np.array(doc_embedding, dtype=np.float32)

                # Compute cosine similarity
                numerator = np.dot(query_embedding, doc_embedding)
                denominator = (np.linalg.norm(query_embedding) * np.linalg.norm(doc_embedding))
                similarity_score = float(numerator / denominator) if denominator else 0.0

                # Penalize if either domains or keywords is a placeholder (but not both)
                if is_placeholder_domain or is_placeholder_keywords:
                    similarity_score *= 0.7  # Reduce score by 30%

                # Apply threshold filtering
                if similarity_score < similarity_threshold:
                    continue

                # Append match
                matches.append(ResearcherMatch(
                    id=researcher_id,
                    nom=doc.metadata["nom"],
                    prenom=doc.metadata["prenom"],
                    affiliation=doc.metadata.get("affiliation"),
                    orcid_id=doc.metadata.get("orcid_id"),
                    domaines_recherche=domaines,
                    mots_cles_specifiques=mots_cles,
                    similarity_score=similarity_score,
                    matched_content=doc.page_content
                ))

                if len(matches) >= top_k:
                    break

            # Sort results by similarity score (highest first)
            matches.sort(key=lambda x: x.similarity_score, reverse=True)

            logger.info(f"[DEBUG] Top 3 matches: {[(m.nom, m.similarity_score) for m in matches[:3]]}")
            return matches[:top_k]

        except Exception as e:
            logger.error(f"Search failed: {e}")
            raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")

    async def detailed_search(
        self,
        query: str,
        top_k: int = 10,
        similarity_threshold: float = 0.0
    ) -> List[DetailedResearcherMatch]:
        """Enhanced search with detailed matching information"""
        try:
            # Get base matches
            matches = await self.search_similar_researchers(
                query=query,
                top_k=top_k,
                similarity_threshold=similarity_threshold
            )
            
            # Add detailed analysis for each match
            def clamp(val, minv=0.0, maxv=1.0):
                return max(minv, min(maxv, val))
                
            detailed_results = []
            for match in matches:
                # Analyze which parts matched better
                domain_similarity = 0
                keywords_similarity = 0
                
                if match.domaines_recherche:
                    domain_results = await asyncio.to_thread(
                        self.vectorstore.similarity_search_with_score,
                        f"Domaines de recherche: {match.domaines_recherche}",
                        k=1
                    )
                    if domain_results:
                        domain_similarity = clamp(1 - domain_results[0][1])
                        
                if match.mots_cles_specifiques:
                    keywords_results = await asyncio.to_thread(
                        self.vectorstore.similarity_search_with_score,
                        f"Mots-clés spécifiques: {match.mots_cles_specifiques}",
                        k=1
                    )
                    if keywords_results:
                        keywords_similarity = clamp(1 - keywords_results[0][1])
                
                detailed_match = DetailedResearcherMatch(
                    id=match.id,
                    nom=match.nom,
                    prenom=match.prenom,
                    affiliation=match.affiliation,
                    orcid_id=match.orcid_id,
                    domaines_recherche=match.domaines_recherche,
                    mots_cles_specifiques=match.mots_cles_specifiques,
                    similarity_score=match.similarity_score,
                    matched_content=match.matched_content,
                    domain_similarity=domain_similarity,
                    keywords_similarity=keywords_similarity,
                    best_match_type="domains" if domain_similarity > keywords_similarity else "keywords"
                )
                detailed_results.append(detailed_match)
                
            return detailed_results
            
        except Exception as e:
            logger.error(f"Detailed search error: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    async def refresh_data(self):
        """Refresh the vector store with latest database data"""
        logger.info("Refreshing researcher data...")
        await self.load_researcher_data()
        await self.create_vector_store()
        logger.info("Data refresh completed")

    async def get_health_status(self) -> Dict[str, Any]:
        """Get health status of the RAG system"""
        try:
            # Test database connection
            conn = psycopg2.connect(**DATABASE_CONFIG)
            cursor = conn.cursor()
            cursor.execute("SELECT 1")
            cursor.close()
            conn.close()
            
            # Test Ollama connection
            test_embed = await asyncio.to_thread(
                self.embeddings.embed_query, "test"
            )
            
            return {
                "status": "healthy",
                "database": "connected",
                "ollama": "connected",
                "vector_store": "ready" if self.vectorstore else "not_ready",
                "documents_count": len(self.documents)
            }
        except Exception as e:
            return {
                "status": "unhealthy",
                "error": str(e)
            }

    def get_stats(self) -> Dict[str, Any]:
        """Get statistics about the RAG system"""
        return {
            "total_researchers": len(self.documents),
            "embedding_model": EMBEDDING_MODEL,
            "vector_store_type": "Chroma",
            "retriever_type": "Ensemble (Semantic + BM25)"
        }


# Global RAG service instance
rag_service = RAGService()
