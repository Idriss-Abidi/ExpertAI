"""
Researcher service layer for business logic.
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from fastapi import HTTPException, status
from typing import List, Optional, Dict, Any

from ..models.researcher import Chercheur
from ..schemas.researcher import ChercheurCreate


class ResearcherService:
    """Researcher service class."""
    
    @staticmethod
    async def create_researcher(
        session: AsyncSession,
        researcher_data: ChercheurCreate
    ) -> Chercheur:
        """Create a new researcher."""
        # Check if researcher with this ORCID already exists
        if researcher_data.orcid_id:
            existing_query = select(Chercheur).where(Chercheur.orcid_id == researcher_data.orcid_id)
            existing_result = await session.execute(existing_query)
            existing_researcher = existing_result.scalar_one_or_none()
            
            if existing_researcher:
                raise HTTPException(
                    status_code=409,
                    detail=f"Researcher with ORCID ID {researcher_data.orcid_id} already exists (ID: {existing_researcher.id})"
                )
        
        # Truncate affiliation to 255 characters if it's too long
        researcher_dict = researcher_data.dict()
        if researcher_dict.get("affiliation") and len(researcher_dict["affiliation"]) > 255:
            researcher_dict["affiliation"] = researcher_dict["affiliation"][:255]
        
        db_researcher = Chercheur(**researcher_dict)
        session.add(db_researcher)
        await session.commit()
        await session.refresh(db_researcher)
        return db_researcher
    
    @staticmethod
    async def get_researcher_by_id(
        session: AsyncSession,
        researcher_id: int
    ) -> Optional[Chercheur]:
        """Get researcher by ID."""
        return await session.get(Chercheur, researcher_id)
    
    @staticmethod
    async def get_researcher_by_orcid(
        session: AsyncSession,
        orcid_id: str
    ) -> Optional[Chercheur]:
        """Get researcher by ORCID ID."""
        result = await session.execute(
            select(Chercheur).where(Chercheur.orcid_id == orcid_id)
        )
        return result.scalar_one_or_none()
    
    @staticmethod
    async def get_all_researchers(
        session: AsyncSession,
        skip: int = 0,
        limit: int = 100,
        search: Optional[str] = None
    ) -> List[Chercheur]:
        """Get all researchers with optional search."""
        query = select(Chercheur)
        
        # Add search functionality across all fields
        if search:
            search_term = f"%{search}%"
            query = query.where(
                or_(
                    Chercheur.nom.ilike(search_term),
                    Chercheur.prenom.ilike(search_term),
                    Chercheur.affiliation.ilike(search_term),
                    Chercheur.orcid_id.ilike(search_term),
                    Chercheur.domaines_recherche.ilike(search_term),
                    Chercheur.mots_cles_specifiques.ilike(search_term)
                )
            )
        
        query = query.offset(skip).limit(limit)
        result = await session.execute(query)
        return result.scalars().all()
    
    @staticmethod
    async def update_researcher(
        session: AsyncSession,
        researcher: Chercheur,
        researcher_data: ChercheurCreate
    ) -> Chercheur:
        """Update an existing researcher."""
        researcher_dict = researcher_data.dict()
        
        # Truncate affiliation to 255 characters if it's too long
        if researcher_dict.get("affiliation") and len(researcher_dict["affiliation"]) > 255:
            researcher_dict["affiliation"] = researcher_dict["affiliation"][:255]
        
        for key, value in researcher_dict.items():
            setattr(researcher, key, value)
        
        await session.commit()
        await session.refresh(researcher)
        return researcher
    
    @staticmethod
    async def delete_researcher(
        session: AsyncSession,
        researcher: Chercheur
    ) -> None:
        """Delete a researcher."""
        await session.delete(researcher)
        await session.commit()
    
    @staticmethod
    async def save_researchers_bulk(
        session: AsyncSession,
        researchers_data: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Save multiple researchers from ORCID search results."""
        saved_researchers = []
        duplicate_researchers = []
        failed_researchers = []
        
        for researcher_data in researchers_data:
            try:
                # Check if researcher with this ORCID already exists
                orcid_id = researcher_data.get("orcid_id")
                if orcid_id:
                    existing_query = select(Chercheur).where(Chercheur.orcid_id == orcid_id)
                    existing_result = await session.execute(existing_query)
                    existing_researcher = existing_result.scalar_one_or_none()
                    
                    if existing_researcher:
                        duplicate_researchers.append({
                            "orcid_id": orcid_id,
                            "nom": researcher_data.get("nom", ""),
                            "prenom": researcher_data.get("prenom", ""),
                            "existing_id": existing_researcher.id
                        })
                        continue
                
                # Create researcher instance - map frontend fields to database schema
                # Truncate affiliation to 255 characters if it's too long
                affiliation = researcher_data.get("affiliation", "")
                if affiliation and len(affiliation) > 255:
                    affiliation = affiliation[:255]
                
                db_researcher = Chercheur(
                    nom=researcher_data.get("nom", ""),
                    prenom=researcher_data.get("prenom", ""),
                    affiliation=affiliation,
                    orcid_id=orcid_id,
                    # Map frontend field names to database field names
                    domaines_recherche=researcher_data.get("domaine_recherche"),  # frontend sends singular, DB expects plural
                    mots_cles_specifiques=researcher_data.get("mots_cles_specifiques")
                )
                
                session.add(db_researcher)
                await session.flush()  # Flush to get the ID
                await session.refresh(db_researcher)
                saved_researchers.append(db_researcher)
                
            except Exception as e:
                failed_researchers.append({
                    "orcid_id": researcher_data.get("orcid_id"),
                    "nom": researcher_data.get("nom", ""),
                    "prenom": researcher_data.get("prenom", ""),
                    "error": str(e)
                })
                continue
        
        await session.commit()
        
        return {
            "message": f"Successfully saved {len(saved_researchers)} chercheurs",
            "saved_count": len(saved_researchers),
            "duplicate_count": len(duplicate_researchers),
            "failed_count": len(failed_researchers),
            "chercheurs": [
                {
                    "id": c.id,
                    "nom": c.nom,
                    "prenom": c.prenom,
                    "orcid_id": c.orcid_id,
                    "affiliation": c.affiliation
                } for c in saved_researchers
            ],
            "duplicates": duplicate_researchers,
            "failed": failed_researchers
        }
    
    @staticmethod
    async def overwrite_researchers(
        session: AsyncSession,
        researchers_data: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Overwrite existing researchers with new data."""
        overwritten_researchers = []
        
        for researcher_data in researchers_data:
            orcid_id = researcher_data.get("orcid_id")
            if not orcid_id:
                continue
                
            # Find existing researcher
            existing_query = select(Chercheur).where(Chercheur.orcid_id == orcid_id)
            existing_result = await session.execute(existing_query)
            existing_researcher = existing_result.scalar_one_or_none()
            
            if existing_researcher:
                # Update existing researcher
                existing_researcher.nom = researcher_data.get("nom", existing_researcher.nom)
                existing_researcher.prenom = researcher_data.get("prenom", existing_researcher.prenom)
                
                # Truncate affiliation to 255 characters if it's too long
                affiliation = researcher_data.get("affiliation", existing_researcher.affiliation)
                if affiliation and len(affiliation) > 255:
                    affiliation = affiliation[:255]
                existing_researcher.affiliation = affiliation
                
                existing_researcher.domaines_recherche = researcher_data.get("domaine_recherche", existing_researcher.domaines_recherche)
                existing_researcher.mots_cles_specifiques = researcher_data.get("mots_cles_specifiques", existing_researcher.mots_cles_specifiques)
                
                overwritten_researchers.append(existing_researcher)
            else:
                # Create new researcher if not found
                # Truncate affiliation to 255 characters if it's too long
                affiliation = researcher_data.get("affiliation", "")
                if affiliation and len(affiliation) > 255:
                    affiliation = affiliation[:255]
                
                db_researcher = Chercheur(
                    nom=researcher_data.get("nom", ""),
                    prenom=researcher_data.get("prenom", ""),
                    affiliation=affiliation,
                    orcid_id=orcid_id,
                    domaines_recherche=researcher_data.get("domaine_recherche"),
                    mots_cles_specifiques=researcher_data.get("mots_cles_specifiques")
                )
                session.add(db_researcher)
                overwritten_researchers.append(db_researcher)
        
        await session.commit()
        
        # Refresh all researchers to get their IDs
        for researcher in overwritten_researchers:
            await session.refresh(researcher)
        
        return {
            "message": f"Successfully overwrote {len(overwritten_researchers)} chercheurs",
            "overwritten_count": len(overwritten_researchers),
            "chercheurs": [
                {
                    "id": c.id,
                    "nom": c.nom,
                    "prenom": c.prenom,
                    "orcid_id": c.orcid_id,
                    "affiliation": c.affiliation
                } for c in overwritten_researchers
            ]
        }
