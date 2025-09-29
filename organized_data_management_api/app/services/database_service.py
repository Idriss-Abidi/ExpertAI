"""
Database service for accessing API keys and other data
"""

import os
import asyncpg  # Explicitly import asyncpg to ensure it's available
import traceback
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import declarative_base, mapped_column, Mapped
from sqlalchemy import String, Text, Boolean, Integer, BigInteger, ForeignKey, DateTime, create_engine
import sqlalchemy as sa
from typing import Optional
from datetime import datetime

# Database configuration
from ..core.config import DATABASE_URL

# Create engine and session with explicit asyncpg driver
try:
    engine = create_async_engine(DATABASE_URL, echo=False, pool_pre_ping=True)
    async_session = async_sessionmaker(engine, expire_on_commit=False)
    print(f"✅ Database engine created successfully with URL: {DATABASE_URL}")
except Exception as e:
    print(f"❌ Failed to create database engine: {e}")
    # Fallback: try with explicit asyncpg driver
    try:
        engine = create_engine(DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://"), echo=False)
        async_session = async_sessionmaker(engine, expire_on_commit=False)
        print(f"✅ Fallback database engine created")
    except Exception as e2:
        print(f"❌ Fallback also failed: {e2}")
        raise e2
Base = declarative_base()


class CleApi(Base):
    """API Keys model matching backend_v2 structure"""
    __tablename__ = "cles_api"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    utilisateur_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("utilisateurs.id", ondelete="CASCADE"))
    cle_openai: Mapped[Optional[str]] = mapped_column(Text)
    cle_gemini: Mapped[Optional[str]] = mapped_column(Text)
    cle_claude: Mapped[Optional[str]] = mapped_column(Text)
    cle_deepseek: Mapped[Optional[str]] = mapped_column(Text)


async def get_session() -> AsyncSession:
    """Get database session"""
    async with async_session() as session:
        yield session


async def get_api_key_for_model(model_name: str) -> dict:
    """Get API key for a specific model from the database"""
    try:
        print(f"🔑 Connecting to database: {DATABASE_URL}")
        async with async_session() as session:
            # Get the first API key record (assuming global API keys)
            result = await session.execute(sa.select(CleApi))
            api_keys = result.scalar_one_or_none()
            
            if not api_keys:
                print("🔑 No API keys found in database")
                return {}
            
            # Determine which API key to return based on model name
            print(f"🔑 Model name: {model_name}")
            print(f"🔑 Available keys - OpenAI: {bool(api_keys.cle_openai)}, Gemini: {bool(api_keys.cle_gemini)}, DeepSeek: {bool(api_keys.cle_deepseek)}")
            
            if model_name.startswith("o4-") or model_name.startswith("gpt-"):
                api_key = api_keys.cle_openai
                provider = "openai"
                print(f"🔑 Using OpenAI key for {model_name}")
            elif model_name.startswith("gemini") or "gemini" in model_name:
                if api_keys.cle_gemini:
                    api_key = api_keys.cle_gemini
                    provider = "gemini"
                    print(f"🔑 Using Gemini key for {model_name}")
                else:
                    # Fallback to OpenAI key for Gemini models if Gemini key not available
                    api_key = api_keys.cle_openai
                    provider = "openai"
                    print(f"🔑 Gemini key not available, using OpenAI key for {model_name}")
            elif model_name.startswith("deepseek") or "deepseek" in model_name:
                api_key = api_keys.cle_deepseek
                provider = "deepseek"
                print(f"🔑 Using DeepSeek key for {model_name}")
            else:
                # Default to OpenAI
                api_key = api_keys.cle_openai
                provider = "openai"
                print(f"🔑 Defaulting to OpenAI key for {model_name}")
            
            if not api_key:
                print(f"🔑 API key not found for model: {model_name}")
                return {}
            
            print(f"🔑 Found API key: {api_key[:10]}...")
            return {
                "model_name": model_name,
                "api_key": api_key,
                "provider": provider
            }
    except Exception as e:
        print(f"🔑 Error retrieving API key from database: {str(e)}")
        traceback.print_exc()
        return {}


async def get_all_api_keys() -> dict:
    """Get all API keys from the database"""
    try:
        async with async_session() as session:
            result = await session.execute(sa.select(CleApi))
            api_keys = result.scalar_one_or_none()
            
            if api_keys:
                return {
                    "cle_openai": api_keys.cle_openai or "",
                    "cle_gemini": api_keys.cle_gemini or "",
                    "cle_claude": api_keys.cle_claude or "",
                    "cle_deepseek": api_keys.cle_deepseek or ""
                }
            else:
                return {}
    except Exception as e:
        print(f"Error retrieving API keys from database: {str(e)}")
        return {}
