"""
User model definitions.
"""
from sqlalchemy.orm import mapped_column, Mapped
from sqlalchemy import String, Text, Boolean, BigInteger, DateTime
import sqlalchemy as sa
from datetime import datetime
from typing import Optional
from ..db.database import Base


class Utilisateur(Base):
    """User model."""
    __tablename__ = "utilisateurs"
    
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    nom: Mapped[str] = mapped_column(String(255))
    prenom: Mapped[str] = mapped_column(String(255))
    email: Mapped[str] = mapped_column("email", String(255), unique=True)
    mot_de_passe_hash: Mapped[str] = mapped_column("mot_de_passe_hash", Text)
    date_creation: Mapped[datetime] = mapped_column("date_creation", DateTime, server_default=sa.func.now())
    date_modification: Mapped[datetime] = mapped_column("date_modification", DateTime, server_default=sa.func.now())
    est_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    telephone: Mapped[Optional[str]] = mapped_column(String(20))
    est_actif: Mapped[bool] = mapped_column("est_actif", Boolean, default=True)
