"""
Configuration and environment setup
"""

import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# MCP Server Configuration
MCP_SERVER_URL = os.getenv("MCP_SERVER_URL", "http://localhost:8017/mcp")

# Database Configuration
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:a@localhost:5432/results")

# API Configuration
API_V1_STR = "/api"
PROJECT_NAME = "Research Database Management System"

# CORS Configuration
BACKEND_CORS_ORIGINS = os.getenv("CORS_ALLOW_ORIGINS", "*")

# OpenAI Configuration
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
DEFAULT_MODEL = os.getenv("DEFAULT_MODEL", "gpt-4")

# Logging Configuration
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
