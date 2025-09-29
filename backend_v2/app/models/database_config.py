"""
Database configuration model definitions.
"""
from sqlalchemy.orm import mapped_column, Mapped
from sqlalchemy import String, Text, Boolean, BigInteger, DateTime
import sqlalchemy as sa
from datetime import datetime
from typing import Optional
from ..db.database import Base


class ConfigurationBase(Base):
    """Database configuration model."""
    __tablename__ = "configurations_bases"
    
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    nom_base: Mapped[str] = mapped_column(String(100), unique=True)
    type_base: Mapped[str] = mapped_column(String(50))
    description: Mapped[Optional[str]] = mapped_column(Text)
    parametres_connexion: Mapped[Optional[str]] = mapped_column(Text)
    est_active: Mapped[bool] = mapped_column(Boolean, default=True)
    date_creation: Mapped[datetime] = mapped_column(DateTime, server_default=sa.func.now())
