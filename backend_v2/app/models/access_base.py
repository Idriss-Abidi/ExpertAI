"""
Database access model definitions.
"""
from sqlalchemy.orm import mapped_column, Mapped
from sqlalchemy import String, BigInteger, ForeignKey, DateTime
import sqlalchemy as sa
from datetime import datetime
from ..db.database import Base


class AccesBase(Base):
    """Database access model."""
    __tablename__ = "acces_bases"
    
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    utilisateur_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("utilisateurs.id"))
    configuration_base_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("configurations_bases.id"))
    niveau_acces: Mapped[str] = mapped_column(String(20))
    date_creation: Mapped[datetime] = mapped_column(DateTime, server_default=sa.func.now())
