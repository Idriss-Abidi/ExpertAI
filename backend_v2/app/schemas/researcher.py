"""
Researcher Pydantic schemas.
"""
from pydantic import BaseModel
from typing import Optional


class ChercheurBase(BaseModel):
    """Base researcher schema."""
    nom: str
    prenom: str
    affiliation: Optional[str] = None
    orcid_id: Optional[str] = None
    domaines_recherche: Optional[str] = None
    mots_cles_specifiques: Optional[str] = None


class ChercheurCreate(ChercheurBase):
    """Schema for creating a researcher."""
    pass


class ChercheurRead(ChercheurBase):
    """Schema for reading researcher data."""
    id: int

    class Config:
        from_attributes = True
