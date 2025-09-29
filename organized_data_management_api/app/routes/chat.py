"""
Chat endpoints for AI assistant interaction using OpenAI Agents SDK
"""

import os
import json
import asyncio
import logging
from typing import Optional, Dict, Any
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel

# Disable OpenAI tracing to prevent API key warnings
os.environ["OPENAI_API_TRACING"] = "false"

from agents import Agent, Runner
from agents.extensions.models.litellm_model import LitellmModel
from agents.mcp import MCPServerStreamableHttp

from ..utils.helpers import get_llm_config_from_model_name

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["chat"])

# Global MCP server instance
orcid_server = None

class ChatRequest(BaseModel):
    message: str
    model_name: str
    history: Optional[list] = None
    user_id: Optional[str] = None

class ChatResponse(BaseModel):
    response: str
    model_name: Optional[str] = None
    status: str = "success"

class HealthResponse(BaseModel):
    status: str
    orcid_server_connected: bool
    available_models: list


async def initialize_orcid_server():
    """Initialize the ORCID MCP server"""
    global orcid_server
    
    if orcid_server is not None:
        return orcid_server
    
    try:
        print("🔧 Initializing ORCID MCP server for chat...")
        import os
        orcid_url = os.getenv("MCP_ORCID_SERVER_URL", "http://orcid-mcp:8001/mcp")
        
        orcid_server = MCPServerStreamableHttp(
            name="ORCID Chat Server",
            params={"url": orcid_url, "timeout": 60},  # Increased timeout
            cache_tools_list=True
        )
        
        # Connect the server
        await orcid_server.connect()
        print("✅ ORCID MCP server initialized for chat successfully")
        
        return orcid_server
        
    except Exception as e:
        print(f"❌ Failed to initialize ORCID MCP server for chat: {e}")
        return None

# Removed complex agent creation function - now done directly in endpoint

async def get_api_key_for_model(model_name: str) -> Optional[str]:
    """Get API key for the specified model using the same method as ORCID"""
    try:
        llm_config = await get_llm_config_from_model_name(model_name)
        if llm_config and llm_config.api_key:
            print(f"✅ Retrieved API key for {model_name}: {llm_config.api_key[:15]}...{llm_config.api_key[-10:] if llm_config.api_key else 'None'}")
            return llm_config.api_key
        else:
            print(f"❌ No API key found for model: {model_name}")
            return None
    except Exception as e:
        print(f"💥 Error getting API key for {model_name}: {e}")
        return None


@router.post("/chat", response_model=ChatResponse)
async def chat_endpoint(request: ChatRequest):
    """Simple chat endpoint for AI assistant using ORCID server"""
    try:
        # Initialize ORCID server
        await initialize_orcid_server()
        if orcid_server is None:
            raise HTTPException(status_code=500, detail="ORCID server not available")
        
        # Get API key from backend
        api_key = await get_api_key_for_model(request.model_name)
        if not api_key:
            raise HTTPException(status_code=400, detail=f"No API key found for model: {request.model_name}")
        
        # Map model name for LiteLLM compatibility
        def get_litellm_model_name(model_name: str) -> str:
            """Map frontend model names to LiteLLM compatible names"""
            if model_name == "gemini-2.5-pro":
                return "gemini/gemini-2.5-pro"
            elif model_name == "gemini-2.5-flash":
                return "gemini/gemini-2.5-flash"
            else:
                return model_name  # Keep original for OpenAI, DeepSeek, etc.
        
        litellm_model_name = get_litellm_model_name(request.model_name)
        
        # Create agent with ORCID server
        agent = Agent(
            name="research_assistant",
            instructions="You are a research assistant with access to ORCID database. Help users find researchers, analyze profiles, and provide research guidance.",
            mcp_servers=[orcid_server],
            model=LitellmModel(model=litellm_model_name, api_key=api_key)
        )
        
        # Run agent and return output directly
        runner = Runner()
        result = await runner.run(agent, request.message)
        
        # Extract just the final output from the RunResult
        if hasattr(result, 'final_output') and result.final_output:
            response_text = str(result.final_output)
        elif hasattr(result, 'content'):
            response_text = result.content
        else:
            response_text = str(result)
        
        return ChatResponse(
            response=response_text,
            model_name=request.model_name,
            status="success"
        )
        
    except Exception as e:
        print(f"Chat error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/chat/health", response_model=HealthResponse)
async def health_check():
    """Health check for the chat service"""
    try:
        # Check ORCID server connection
        orcid_connected = orcid_server is not None
        
        if not orcid_connected:
            # Try to initialize
            await initialize_orcid_server()
            orcid_connected = orcid_server is not None
        
        # List of supported models (you can expand this)
        available_models = [
            "gpt-4o",
            "gpt-4o-mini", 
            "gpt-4-turbo",
            "gemini-1.5-pro",
            "gemini-1.5-flash",
            "deepseek/deepseek-chat",
            "deepseek/deepseek-reasoner"
        ]
        
        return HealthResponse(
            status="healthy" if orcid_connected else "degraded",
            orcid_server_connected=orcid_connected,
            available_models=available_models
        )
        
    except Exception as e:
        print(f"Health check error: {e}")
        return HealthResponse(
            status="unhealthy",
            orcid_server_connected=False,
            available_models=[]
        )

@router.post("/models")
async def list_available_models():
    """List available AI models"""
    return {
        "models": [
            {"id": "gpt-4o", "name": "GPT-4o", "provider": "OpenAI"},
            {"id": "gpt-4o-mini", "name": "GPT-4o Mini", "provider": "OpenAI"},
            {"id": "gpt-4-turbo", "name": "GPT-4 Turbo", "provider": "OpenAI"},
            {"id": "gemini-1.5-pro", "name": "Gemini 1.5 Pro", "provider": "Google"},
            {"id": "gemini-1.5-flash", "name": "Gemini 1.5 Flash", "provider": "Google"},
            {"id": "deepseek/deepseek-chat", "name": "DeepSeek Chat", "provider": "DeepSeek"},
            {"id": "deepseek/deepseek-reasoner", "name": "DeepSeek Reasoner", "provider": "DeepSeek"}
        ]
    }

# Add endpoints for the assistant page
@router.get("/researchers")
async def get_researchers_for_assistant():
    """Get researchers for the assistant page"""
    try:
        # Import here to avoid circular imports
        import httpx
        
        # Call the backend API to get researchers
        async with httpx.AsyncClient() as client:
            response = await client.get("http://backend-v2:8020/api/v1/chercheurs/")
            
            if response.status_code == 200:
                researchers = response.json()
                
                # Transform to the format expected by the assistant
                transformed_researchers = []
                for researcher in researchers:
                    transformed_researchers.append({
                        "id": researcher.get("id"),
                        "name": f"{researcher.get('prenom', '')} {researcher.get('nom', '')}".strip(),
                        "affiliation": researcher.get("affiliation", ""),
                        "orcid_id": researcher.get("orcid_id", ""),
                        "research_areas": researcher.get("domaines_recherche", ""),
                        "keywords": researcher.get("mots_cles_specifiques", "")
                    })
                
                return {
                    "researchers": transformed_researchers,
                    "total": len(transformed_researchers)
                }
            else:
                raise HTTPException(
                    status_code=response.status_code,
                    detail="Failed to fetch researchers from backend"
                )
                
    except Exception as e:
        print(f"Error fetching researchers: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch researchers: {str(e)}"
        )

@router.post("/researchers/report")
async def generate_researchers_report():
    """Generate a researchers report"""
    try:
        researchers_response = await get_researchers_for_assistant()
        researchers = researchers_response.get("researchers", [])
        
        report = {
            "metadata": {
                "total_researchers": len(researchers),
                "researchers_with_orcid": len([r for r in researchers if r.get("orcid_id")]),
                "total_works": 0,  # Placeholder
                "generated_at": "2025-09-23"
            },
            "summary": {
                "institutions": list(set(r.get("affiliation", "Unknown") for r in researchers if r.get("affiliation")))[:10]
            },
            "researchers": researchers
        }
        
        return {"success": True, "report": report}
        
    except Exception as e:
        print(f"Error generating report: {e}")
        return {"success": False, "error": str(e)}

@router.post("/chat/clear")
async def clear_chat_history():
    """Clear chat history"""
    return {"message": "Chat history cleared"}