"""
Base models and data classes
"""

from dataclasses import dataclass
from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field, field_validator
from datetime import datetime


@dataclass
class TableInfo:
    name: str
    columns: Dict[str, str]


class LLMConfig(BaseModel):
    model_name: str
    api_key: str
    provider: str = "openai"


class TaskStatus(BaseModel):
    task_id: str
    status: str  # pending, running, completed, failed
    created_at: datetime
    completed_at: Optional[datetime] = None
    result: Optional[Any] = None
    error: Optional[str] = None
    progress: Optional[int] = None  # Percentage (0-100)
    progress_details: Optional[Dict[str, Any]] = None  # Detailed progress info


class ChatRequest(BaseModel):
    message: str
    history: List[tuple] = []
    llm_config: Optional[LLMConfig] = None
