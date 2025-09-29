"""
API Key model definitions.
"""
from sqlalchemy.orm import mapped_column, Mapped
from sqlalchemy import Text, BigInteger, ForeignKey
from typing import Optional
from ..db.database import Base


class CleApi(Base):
    """API Key model."""
    __tablename__ = "cles_api"
    
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    utilisateur_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("utilisateurs.id", ondelete="CASCADE"))
    cle_openai: Mapped[Optional[str]] = mapped_column(Text)
    cle_gemini: Mapped[Optional[str]] = mapped_column(Text)
    cle_claude: Mapped[Optional[str]] = mapped_column(Text)
    cle_deepseek: Mapped[Optional[str]] = mapped_column(Text)
    cle_scopus: Mapped[Optional[str]] = mapped_column(Text)
