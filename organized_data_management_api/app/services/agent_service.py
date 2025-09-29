"""
Agent service functions for creating and managing AI agents
"""

import json
from typing import Optional, Any, Dict, List
from contextlib import nullcontext
from pydantic import BaseModel, Field
from agents import Agent, AgentOutputSchema
from agents.extensions.models.litellm_model import LitellmModel
from agents.mcp import MCPServerStreamableHttp

from ..models.base import LLMConfig
from ..models.database import ColumnMapping
from ..models.orcid import (
    ResearcherInfo, ResearcherInfoList, ResearcherInfoTable, 
    PickerOutput, CandidateScore, PickerReasoning
)

# Global MCP server instance
orcid_server = None


async def initialize_orcid_server():
    """Initialize and connect the ORCID MCP server"""
    global orcid_server
    try:
        print("🔧 Initializing ORCID MCP server...")
        import os
        orcid_url = os.getenv("MCP_ORCID_SERVER_URL", "http://orcid-mcp:8001/mcp")
        orcid_server = MCPServerStreamableHttp(
            name="ORCID Server",
            params={"url": orcid_url, "timeout": 30},
            cache_tools_list=True
        )
        print(f"🔧 Created ORCID server instance: {orcid_server}")
        # Connect the server
        await orcid_server.connect()
        print("✅ ORCID MCP server initialized and connected successfully")
        print(f"🔧 Global orcid_server variable: {orcid_server}")
    except Exception as e:
        print(f"❌ Warning: Failed to initialize ORCID MCP server: {e}")
        import traceback
        traceback.print_exc()


def make_column_mapper_agent(model_name: str, api_key: str):
    return Agent(
        name="column_mapper_agent",
        instructions=(
            "You are given a list of selected column names and their values.\n"
            "Map them to target keys for ORCID search:\n"
            "  - required: first_name, last_name\n"
            "  - optional: email, affiliation, country\n"
            "Use robust fuzzy matching: handle variations like first/firstname/given_name/givenNames; "
            "family/surname/last/lastname; org/organization/university/institution for affiliation; "
            "country/nation for country. If an optional key has no good match, omit it.\n\n"
            "Return STRICT JSON with keys:\n"
            "{\n"
            "  \"mapping\": {\"first_name\": \"colA\", \"last_name\": \"colB\", ...},\n"
            "}\n"
            "- Ensure mapping includes first_name and last_name.\n"
        ),
        output_type=AgentOutputSchema(ColumnMapping, strict_json_schema=False),
        model=LitellmModel(model=model_name, api_key=api_key)
    )


def make_orcid_search_agent(model_name: str, api_key: str):
    # Check if it's a Gemini model
    is_gemini = "gemini" in model_name.lower()
    print(f"DEBUG: Model name: '{model_name}', is_gemini: {is_gemini}")
    
    if is_gemini:
        
        class GeminiResearcherInfo(BaseModel):
            orcid_id: Optional[str] = None
            first_name: Optional[str] = None
            last_name: Optional[str] = None
            email: Optional[str] = None
            country: Optional[str] = None
            affiliation: Optional[str] = None
            main_research_area: Optional[str] = None
            specific_research_area: Optional[str] = None
        
        class GeminiResearcherInfoList(BaseModel):
            researchers: List[GeminiResearcherInfo] = Field(default_factory=list)
            total_found: int = 0
        
        return Agent(
            name="orcid_search",
            instructions=(
                "You are an ORCID search agent. You MUST use the available MCP tools to search for researchers.\n\n"
                "Available tools:\n"
                "- search_by_name(first_name, last_name, limit): Search by name only\n"
                "- search_by_name_and_institution(first_name, last_name, institution, limit): Search by name and institution\n"
                "- search_by_name_and_email(first_name, last_name, email, limit): Search by name and email\n"
                "- search_by_name_and_country(first_name, last_name, country, limit): Search by name and country\n"
                "- search_by_swapped_name(first_name, last_name, limit): Search with swapped names\n\n"
                "Based on the input variant, call the appropriate tool:\n"
                "- 'name_only': Use search_by_name\n"
                "- 'name_affiliation': Use search_by_name_and_institution\n"
                "- 'name_email': Use search_by_name_and_email\n"
                "- 'name_country': Use search_by_name_and_country\n"
                "- 'swapped': Use search_by_swapped_name\n\n"
                "CRITICAL: After calling the MCP tool, you MUST return the results as a valid JSON object with this exact format:\n"
                "{\n"
                "  \"researchers\": [\n"
                "    {\n"
                "      \"orcid_id\": \"string or null\",\n"
                "      \"first_name\": \"string or null\",\n"
                "      \"last_name\": \"string or null\",\n"
                "      \"email\": \"string or null\",\n"
                "      \"country\": \"string or null\",\n"
                "      \"affiliation\": \"string or null\",\n"
                "      \"main_research_area\": \"string or null\",\n"
                "      \"specific_research_area\": \"string or null\"\n"
                "    }\n"
                "  ],\n"
                "  \"total_found\": 0\n"
                "}\n\n"
                "Return ONLY the JSON object, no additional text or explanation."
            ),
            mcp_servers=[orcid_server],
            output_type=None,  # Remove structured output for Gemini to avoid function calling conflicts
            model=LitellmModel(model=model_name, api_key=api_key),
        )
    else:
        # For non-Gemini models, use the original configuration
        return Agent(
            name="orcid_search",
            instructions="Search for the researcher's ORCID ID using provided information using the server's search tools.",
            mcp_servers=[orcid_server],
            mcp_config={
                "input": {
                    "type": "object",
                    "properties": {
                        "first_name": {"type": "string"},
                        "last_name": {"type": "string"},
                        "email": {"type": ["string", "null"]},
                        "affiliation": {"type": ["string", "null"]},
                        "country": {"type": ["string", "null"]},
                        "variant": {
                            "type": "string",
                            "enum": [
                                "name_only",
                                "name_affiliation",
                                "name_email",
                                "name_country",
                                "swapped"
                            ]
                        }
                    },
                    "required": ["first_name", "last_name", "variant"]
                },
                "output": {
                    "type": "object",
                    "properties": {
                        "researchers": {"type": "array", "items": {"type": "object"}},
                        "total_found": {"type": "integer"}
                    },
                    "required": ["researchers", "total_found"]
                }
            },
            output_type=AgentOutputSchema(ResearcherInfoList, strict_json_schema=False),
            model=LitellmModel(model=model_name, api_key=api_key),
        )


def make_extract_agent(model_name: str, api_key: str):
    # Check if it's a Gemini model
    is_gemini = "gemini" in model_name.lower()
    
    # Use appropriate output_type configuration for Gemini
    if is_gemini:
        output_type = AgentOutputSchema(ResearcherInfo, strict_json_schema=False)
    else:
        output_type = ResearcherInfo
    
    return Agent(
        name="extract_agent",
        instructions=(
            "Extract relevant researcher information from the natural-language description. "
            "Return JSON with fields: firstname, lastname, email, country, affiliation (all optional except name)."
        ),
        output_type=output_type,
        model=LitellmModel(model=model_name, api_key=api_key)
    )
    

def make_works_extract_agent(model_name: str, api_key: str):
    return Agent(
        name="works_extract_agent",
        instructions=(
            "You are given a JSON object describing the selected ORCID profile. "
            "Using the ORCID MCP tools, do the following:\n"
            "1) Call get_researcher(orcid_id) to retrieve biography and profile-level keywords.\n"
            "2) Call get_works(orcid_id, limit=30) to get works, then extract titles. "
            "   Optionally call get_work_detail for a few items if needed to clarify titles.\n"
            "3) From the works titles, biography and profile-level keywords, generate:\n"
            "   - main_research_area: 4–8 broader themes **as a single string with items separated by commas**\n"
            "   - specific_research_area: 4–12 more technical/targeted terms if there are enough to warrant it **as a single string with items separated by commas**\n"
            "4) Return a JSON object that includes ALL of the original input fields plus the two new fields.\n"
            "5) Never return lists or arrays for these fields — always a plain string.\n"
            "If nothing useful is found in works, leave both fields as empty strings."
        ),
        mcp_servers=[orcid_server],
        mcp_config={
            "input": {
                "type": "object",
                "properties": {
                    "orcid_id": {"type": "string"},
                    "first_name": {"type": ["string", "null"]},
                    "last_name": {"type": ["string", "null"]},
                    "email": {"type": ["string", "null"]},
                    "country": {"type": ["string", "null"]},
                    "affiliation": {"type": ["string", "null"]}
                },
                "required": ["orcid_id"]
            }
        },
        output_type=AgentOutputSchema(ResearcherInfoTable, strict_json_schema=False),
        model=LitellmModel(model=model_name, api_key=api_key)
    )


def make_orcid_result_picker(model_name: str, api_key: str):
    # Check model type for appropriate handling
    is_openai_model = model_name.startswith(('gpt-', 'openai/', 'o4', 'o3'))
    is_gemini_model = model_name.startswith(('gemini-', 'google/'))
    is_deepseek_model = model_name.startswith(('deepseek/', 'deepseek-'))
    
    if is_gemini_model:
        # For Gemini models, create a custom output schema that works with Gemini's strict validation
        
        class GeminiEvidence(BaseModel):
            name: Optional[str] = None
            affiliation: Optional[str] = None
            country: Optional[str] = None
            email: Optional[str] = None
            # Allow additional properties
            class Config:
                extra = "allow"
        
        class GeminiCandidateScore(BaseModel):
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
            evidence: GeminiEvidence = Field(default_factory=GeminiEvidence)
        
        class GeminiPickerReasoning(BaseModel):
            summary: str
            confidence: float = Field(..., ge=0, le=1)
            selected_orcid_id: Optional[str] = None
            selected_from_result_index: Optional[int] = None
            scores: List[GeminiCandidateScore] = Field(default_factory=list)
        
        class GeminiPickerOutput(BaseModel):
            result: ResearcherInfoTable
            reasoning: GeminiPickerReasoning
        
        return Agent(
            name="orcid_result_picker",
            instructions=(
                "You are given: (1) a 'wanted_researcher' object and (2) up to 5 ORCID search result sets. "
                "Each result set has 'researchers' (array) containing ORCID profiles. "
                "Choose the best single ORCID profile that matches the wanted researcher.\n\n"
                "Return JSON matching the provided schema (result + reasoning)."
            ),
            mcp_servers=[orcid_server],
            mcp_config={
                "input": {
                    "type": "object",
                    "properties": {
                        "wanted_researcher": {"type": "object"},
                        "results": {"type": "array", "items": {"type": "object"}}
                    },
                    "required": ["wanted_researcher", "results"]
                }
            },
            output_type=AgentOutputSchema(GeminiPickerOutput, strict_json_schema=False),
            model=LitellmModel(model=model_name, api_key=api_key)
        )
    elif is_openai_model:
        # For OpenAI models, use the original configuration
        return Agent(
            name="orcid_result_picker",
            instructions=(
                "You are given: (1) a 'wanted_researcher' object and (2) up to 5 ORCID search result sets. "
                "Each result set has 'researchers' (array) containing ORCID profiles. "
                "Choose the best single ORCID profile that matches the wanted researcher.\n\n"
                "Return JSON matching the provided schema (result + reasoning)."
            ),
            mcp_servers=[orcid_server],
            output_type=AgentOutputSchema(PickerOutput, strict_json_schema=False),
            model=LitellmModel(model=model_name, api_key=api_key)
        )
    else:
        # For non-OpenAI models (DeepSeek, etc.), use post-processing approach
        return Agent(
            name="orcid_result_picker",
            instructions=(
                "You are given: (1) a 'wanted_researcher' object and (2) up to 5 ORCID search result sets. "
                "Each result set has 'researchers' (array) containing ORCID profiles. "
                "Choose the best single ORCID profile that matches the wanted researcher.\n\n"
                "CRITICAL: Return ONLY valid JSON matching the provided schema. "
                "Do not include any markdown formatting, code blocks, or explanatory text. "
                "Ensure all JSON arrays and objects are properly formatted without extra quotes, newlines, or commas. "
                "The output must be parseable by standard JSON parsers.\n\n"
                "Schema: {\"result\": {...}, \"reasoning\": {\"summary\": \"...\", \"confidence\": 0.0, \"scores\": [...]}}"
            ),
            mcp_servers=[orcid_server],
            output_type=None,  # Use post-processing
            model=LitellmModel(model=model_name, api_key=api_key)
        )


def safe_json_loads(x: Any) -> Any:
    if x is None:
        return None
    if isinstance(x, (dict, list)):
        return x
    if hasattr(x, "model_dump"):
        return x.model_dump()
    if isinstance(x, str):
        try:
            return json.loads(x)
        except Exception:
            return x
    return x


def to_serializable(obj: Any) -> Any:
    if hasattr(obj, "model_dump"):
        return obj.model_dump()
    if isinstance(obj, (list, tuple)):
        return [to_serializable(x) for x in obj]
    if isinstance(obj, dict):
        return {k: to_serializable(v) for k, v in obj.items()}
    return obj


def make_deepseek_orcid_search_agent(model_name: str, api_key: str, orcid_server_instance=None):
    """Create a DeepSeek-specific ORCID search agent (matches original data_management_api_fixed.py)"""
    # Use provided server instance or create a new one
    if orcid_server_instance is None:
        import os
        orcid_url = os.getenv("MCP_ORCID_SERVER_URL", "http://orcid-mcp:8001/mcp")
        orcid_server_instance = MCPServerStreamableHttp(
            name="ORCID Server",
            params={"url": orcid_url, "timeout": 30},
            cache_tools_list=True,
        )
    
    return Agent(
        name="deepseek_orcidsearch_agent",
        instructions=(  
            "You are an ORCID search agent using DeepSeek. Given researcher information, use the server's search tools to find possible ORCID matches. "
            "Then using the ORCID ID selected (the one that has the highest confidence), get the researcher's works (all works) using the server's tools and generate keywords for main_research_area (4 to 8 separated by comma) and specific_research_area fields (4 to 8 separated by comma). "
            "Return the results as a JSON object in the following format:\n"
            "{\n"
            "  \"researchers\": [\n"
            "    {\n"
            "      \"orcid\": \"<ORCID ID>\",\n"
            "      \"given_names\": \"<Given Names>\",\n"
            "      \"family_names\": \"<Family Names>\",\n"
            "      \"affiliation\": \"<Affiliations separated by comma>\",\n"
            "      \"email\": \"<Email>\",\n"
            "      \"country\": \"<Country>\" (use complete name not abbreviation),\n"
            "      \"main_research_area\": \"<Main Research Area>\",\n"
            "      \"specific_research_area\": \"<Specific Research Area>\"\n"
            "    }\n"
            "  ],\n"
            "  \"total_found\": <number>\n"
            "}\n"
            "Don't include any other text or comments in your response. Just the JSON object."
            "If no researchers are found, return an empty list for 'researchers' and set 'total_found' to 0."
        ),
        mcp_servers=[orcid_server_instance],
        model=LitellmModel(model=model_name, api_key=api_key),
    )


def get_agent_and_servers_v2(llm_config: LLMConfig):
    """Get agents and servers for the given LLM config"""
    try:
        
        # Initialize MCP servers with correct parameter format
        import os
        db_url = os.getenv("MCP_DB_SERVER_URL", "http://localhost:8017/mcp")
        databases_server = MCPServerStreamableHttp(
            name="Researcher Databases Server",
            params={"url": db_url, "timeout": 15},
            cache_tools_list=True,
        )
        
        orcid_url = os.getenv("MCP_ORCID_SERVER_URL", "http://localhost:8001/mcp")
        local_orcid_server = MCPServerStreamableHttp(
            name="ORCID Server",
            params={"url": orcid_url, "timeout": 30},
            cache_tools_list=True,
        )
        
        # Create agents based on model type
        print(f"🔧 Creating agents for model: {llm_config.model_name}")
        if llm_config.model_name.startswith("deepseek/"):
            # DeepSeek-specific configuration
            print("🔧 Using DeepSeek-specific agent configuration")
            model = LitellmModel(model=llm_config.model_name, api_key=llm_config.api_key)
            
            column_mapper_agent = Agent(
                name="column_mapper_agent",
                instructions=(
                    "You are given a list of selected column names and their values.\n"
                    "Map them to target keys for ORCID search:\n"
                    "  - required: first_name, last_name\n"
                    "  - optional: email, affiliation, country\n"
                    "Use robust fuzzy matching: handle variations like first/firstname/given_name/givenNames; "
                    "family/surname/last/lastname; org/organization/university/institution for affiliation; "
                    "country/nation for country. If an optional key has no good match, omit it.\n\n"
                    "Return STRICT JSON with keys:\n"
                    "{\n"
                    "  \"mapping\": {\"first_name\": \"colA\", \"last_name\": \"colB\", ...},\n"
                    "}\n"
                    "- Ensure mapping includes first_name and last_name.\n"
                    "- 'selected_columns' must be the unique set of mapped columns (only those you mapped).\n"
                ),
                model=model
            )
            
            orcid_search_agent = Agent(
                name="orcid_search",
                instructions=(
                    "You are an ORCID search agent. You MUST use the available MCP tools to search for researchers.\n\n"
                    "Available tools:\n"
                    "- search_by_name(first_name, last_name, limit): Search by name only\n"
                    "- search_by_name_and_institution(first_name, last_name, institution, limit): Search by name and institution\n"
                    "- search_by_name_and_email(first_name, last_name, email, limit): Search by name and email\n"
                    "- search_by_name_and_country(first_name, last_name, country, limit): Search by name and country\n"
                    "- search_by_swapped_name(first_name, last_name, limit): Search with swapped names\n\n"
                    "Based on the input variant, call the appropriate tool:\n"
                    "- 'name_only': Use search_by_name\n"
                    "- 'name_affiliation': Use search_by_name_and_institution\n"
                    "- 'name_email': Use search_by_name_and_email\n"
                    "- 'name_country': Use search_by_name_and_country\n"
                    "- 'swapped': Use search_by_swapped_name\n\n"
                    "ALWAYS call the appropriate MCP tool first, then return the results in the expected format."
                ),
                mcp_servers=[local_orcid_server],
                mcp_config={
                    "input": {
                        "type": "object",
                        "properties": {
                            "first_name": {"type": "string"},
                            "last_name": {"type": "string"},
                            "email": {"type": ["string", "null"]},
                            "affiliation": {"type": ["string", "null"]},
                            "country": {"type": ["string", "null"]},
                            "variant": {
                                "type": "string",
                                "enum": [
                                    "name_only",
                                    "name_affiliation",
                                    "name_email",
                                    "name_country",
                                    "swapped"
                                ]
                            }
                        },
                        "required": ["first_name", "last_name", "variant"]
                    },
                    "output": {
                        "type": "object",
                        "properties": {
                            "researchers": {"type": "array", "items": {"type": "object"}},
                            "total_found": {"type": "integer"}
                        },
                        "required": ["researchers", "total_found"]
                    }
                },
                output_type=None,  # Use post-processing for DeepSeek
                model=model
            )
            
            extract_agent = Agent(
                name="extract_agent",
                instructions=(
                    "Extract relevant researcher information from the natural-language description. "
                    "Return JSON with fields: firstname, lastname, email, country, affiliation (all optional except name)."
                ),
                output_type=None,  # Use post-processing for DeepSeek
                model=model
            )
            
            works_extract_agent = Agent(
                name="works_extract_agent",
                instructions=(
                    "You are given a JSON object describing the selected ORCID profile. "
                    "Using the ORCID MCP tools, do the following:\n"
                    "1) Call get_researcher(orcid_id) to retrieve biography and profile-level keywords.\n"
                    "2) Call get_works(orcid_id, limit=30) to get works, then extract titles. "
                    "   Optionally call get_work_detail for a few items if needed to clarify titles.\n"
                    "3) From the works titles, biography and profile-level keywords, generate:\n"
                    "   - main_research_area: 4–8 broader themes **as a single string with items separated by commas**\n"
                    "   - specific_research_area: 4–12 more technical/targeted terms if there are enough to warrant it **as a single string with items separated by commas**\n"
                    "4) Return a JSON object that includes ALL of the original input fields plus the two new fields.\n"
                    "5) Never return lists or arrays for these fields — always a plain string.\n"
                    "If nothing useful is found in works, leave both fields as empty strings."
                ),
                mcp_servers=[local_orcid_server],
                mcp_config={
                    "input": {
                        "type": "object",
                        "properties": {
                            "orcid_id": {"type": "string"},
                            "first_name": {"type": ["string", "null"]},
                            "last_name": {"type": ["string", "null"]},
                            "email": {"type": ["string", "null"]},
                            "country": {"type": ["string", "null"]},
                            "affiliation": {"type": ["string", "null"]}
                        },
                        "required": ["orcid_id"]
                    }
                },
                output_type=None,  # Use post-processing
                model=model,
            )
            
            orcid_result_picker = Agent(
                name="orcid_result_picker",
                instructions=(
                    "You are given: (1) a 'wanted_researcher' object and (2) up to 5 ORCID search result sets. "
                    "Each result set has 'researchers' (array) containing ORCID profiles. "
                    "Choose the best single ORCID profile that matches the wanted researcher.\n\n"
                    "CRITICAL: Return ONLY valid JSON matching the provided schema. "
                    "Do not include any markdown formatting, code blocks, or explanatory text. "
                    "Ensure all JSON arrays and objects are properly formatted without extra quotes, newlines, or commas. "
                    "The output must be parseable by standard JSON parsers.\n\n"
                    "Schema: {\"result\": {...}, \"reasoning\": {\"summary\": \"...\", \"confidence\": 0.0, \"scores\": [...]}}"
                ),
                mcp_servers=[local_orcid_server],
                output_type=None,  # Use post-processing
                model=model
            )
        else:
            # For other models, use the standard agent creation
            print("🔧 Using standard agent creation (includes Gemini fix)")
            column_mapper_agent = make_column_mapper_agent(llm_config.model_name, llm_config.api_key)
            orcid_search_agent = make_orcid_search_agent(llm_config.model_name, llm_config.api_key)
            extract_agent = make_extract_agent(llm_config.model_name, llm_config.api_key)
            works_extract_agent = make_works_extract_agent(llm_config.model_name, llm_config.api_key)
            orcid_result_picker = make_orcid_result_picker(llm_config.model_name, llm_config.api_key)
        
        return column_mapper_agent, orcid_search_agent, extract_agent, works_extract_agent, orcid_result_picker, databases_server, local_orcid_server
        
    except ImportError:
        print("Failed to import from openaiagentssdk.agents_as_tool")
        raise
