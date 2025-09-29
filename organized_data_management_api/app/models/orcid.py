"""
ORCID-related models
"""

from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field, field_validator
from .base import LLMConfig


class ORCIDSearchRequest(BaseModel):
    researchers: List[Dict[str, str]] = Field(..., description="List of researchers with name/affiliation")
    limit_per_researcher: int = Field(10, ge=1, le=50, description="Max ORCID results per researcher")
    model_name: Optional[str] = None
    
    @field_validator('researchers')
    @classmethod
    def validate_researchers(cls, v):
        if not v:
            raise ValueError('At least one researcher must be provided')
        for researcher in v:
            if not isinstance(researcher, dict):
                raise ValueError('Each researcher must be a dictionary')
            if 'name' not in researcher and 'affiliation' not in researcher:
                raise ValueError('Each researcher must have at least name or affiliation')
        return v


class ORCIDTableSearchRequest(BaseModel):
    db_id: int = Field(..., description="Database ID")
    table_name: str = Field(..., description="Table name to search")
    selected_columns: List[str] = Field(..., description="Selected columns for ORCID search")
    limit: int = Field(100, ge=1, le=1000, description="Maximum rows to process")
    confidence_threshold: float = Field(0.7, ge=0.1, le=1.0, description="Confidence threshold for matches")
    llm_config: Optional[LLMConfig] = None

    @field_validator('db_id', mode='before')
    @classmethod
    def coerce_db_id(cls, v):
        # Accept int, numeric strings, or strings like "db_1"
        if isinstance(v, str):
            if v.startswith('db_'):
                return int(v[3:])
            try:
                return int(v)
            except ValueError:
                raise ValueError(f'Invalid db_id format: {v}')
        return int(v)


class ORCIDProfileRequest(BaseModel):
    orcid_id: str = Field(..., description="ORCID identifier (e.g., 0000-0001-2345-6789)")
    include_works: bool = Field(True, description="Whether to include research works")
    works_limit: int = Field(10, ge=1, le=50, description="Maximum number of works to retrieve")
    llm_config: Optional[LLMConfig] = None


class ResearcherInfo(BaseModel):
    firstname: Optional[str]
    lastname: Optional[str]
    email: Optional[str]
    affiliation: Optional[str]
    country: Optional[str]
    orcid_id: Optional[str]


class ResearcherInfoList(BaseModel):
    researchers: List[Dict[str, Any]] = Field(default_factory=list)
    total_found: int = 0


class ResearcherInfoTable(BaseModel):
    orcid_id: Optional[str] = Field(None, description="The researcher's ORCID ID")
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    country: Optional[str] = None
    affiliation: Optional[str] = None
    main_research_area: Optional[str] = None  # comma-separated string
    specific_research_area: Optional[str] = None  # comma-separated string


class CandidateScore(BaseModel):
    source_result_index: int
    orcid_id: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    affiliation: Optional[str] = None
    country: Optional[str] = None
    name_match: float = 0.0
    affiliation_match: float = 0.0
    country_match: float = 0.0
    email_match: float = 0.0
    total: float = 0.0
    evidence: Dict[str, Any] = Field(default_factory=dict)


class PickerReasoning(BaseModel):
    summary: str
    confidence: float = Field(..., ge=0, le=1)
    selected_orcid_id: Optional[str]
    selected_from_result_index: Optional[int]
    scores: List[CandidateScore] = Field(default_factory=list)


class PickerOutput(BaseModel):
    result: ResearcherInfoTable
    reasoning: PickerReasoning


class ORCIDTableSearchRequest_v2(BaseModel):
    db_id: int = Field(..., description="Database ID")
    table_name: str = Field(..., description="Table name to search")
    selected_columns: List[str] = Field(..., description="Selected columns for ORCID search")
    limit: int = Field(100, ge=1, le=1000, description="Maximum rows to process")
    model_name: str = Field("o4-mini", description="AI model name to use")


class OrcidSearchResult(BaseModel):
    orcid_id: Optional[str] = Field(None, description="The researcher's ORCID ID")
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    country: Optional[str] = None
    affiliation: Optional[str] = None
    main_research_area: Optional[str] = None  # comma-separated string
    specific_research_area: Optional[str] = None  # comma-separated string
    reasoning: Optional[str] = None
    confidence: float = Field(0.0, ge=0.0, le=1.0, description="Confidence score between 0 and 1")
    original_data: Optional[Dict[str, Any]] = Field(None, description="Original data from the database table")
