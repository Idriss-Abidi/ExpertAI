"""
Researcher model definitions.
"""
from sqlalchemy.orm import mapped_column, Mapped
from sqlalchemy import String, Text, BigInteger
from typing import Optional
from ..db.database import Base


class Chercheur(Base):
    """Researcher model."""
    __tablename__ = "chercheurs"
    
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    nom: Mapped[str] = mapped_column(String(255))
    prenom: Mapped[str] = mapped_column(String(255))
    affiliation: Mapped[Optional[str]] = mapped_column(String(255))
    orcid_id: Mapped[Optional[str]] = mapped_column(String(19), unique=True)
    domaines_recherche: Mapped[Optional[str]] = mapped_column(Text)
    mots_cles_specifiques: Mapped[Optional[str]] = mapped_column(Text)
