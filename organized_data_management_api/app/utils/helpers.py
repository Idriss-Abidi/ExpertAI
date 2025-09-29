"""
Helper utility functions
"""

import json
import uuid
import asyncio
import re
import os
import asyncpg
import requests
from typing import Dict, List, Optional, Any
from datetime import datetime
from ..models.base import LLMConfig, TaskStatus
from ..services.mcp_service import get_connected_databases
from ..utils.database_utils import select_query_results_v2


# Global task storage
task_results: Dict[str, TaskStatus] = {}


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


def create_task(task_id: str = None) -> str:
    """Create a new task and return its ID"""
    if task_id is None:
        task_id = str(uuid.uuid4())
    
    task_results[task_id] = TaskStatus(
        task_id=task_id,
        status="pending",
        created_at=datetime.now()
    )
    
    return task_id


def update_task_status(task_id: str, status: str, result: Any = None, error: str = None, progress: Dict[str, Any] = None):
    """Update task status"""
    if task_id in task_results:
        task_results[task_id].status = status
        if result is not None:
            task_results[task_id].result = result
        if error is not None:
            task_results[task_id].error = error
        if progress is not None:
            task_results[task_id].progress_details = progress
        if status in ["completed", "failed"]:
            task_results[task_id].completed_at = datetime.now()


def get_task_status(task_id: str) -> Optional[TaskStatus]:
    """Get task status by ID"""
    return task_results.get(task_id)


def list_tasks() -> List[TaskStatus]:
    """List all tasks"""
    return list(task_results.values())


def delete_task(task_id: str) -> bool:
    """Delete a task"""
    if task_id in task_results:
        del task_results[task_id]
        return True
    return False


async def get_api_keys_from_db() -> dict:
    """Get API keys from the database directly (same logic as backend_v2 but without auth)"""
    try:
        
        # Get database URL from environment or use default (Docker-aware)
        database_url = os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@postgres:5432/research_db")
        
        print(f"🔑 Attempting to connect to database: {database_url.replace('postgres:', 'postgres:***@')}")
        
        # Handle both postgresql:// and postgresql+asyncpg:// formats
        if "postgresql://" in database_url:
            # Convert postgresql:// to postgresql+asyncpg:// for asyncpg
            if not "postgresql+asyncpg://" in database_url:
                database_url = database_url.replace("postgresql://", "postgresql+asyncpg://")
        
        # Extract connection details from URL
        if "postgresql+asyncpg://" in database_url:
            # Parse the URL to get connection details
            url_parts = database_url.replace("postgresql+asyncpg://", "").split("@")
            if len(url_parts) == 2:
                user_pass = url_parts[0].split(":")
                host_port_db = url_parts[1].split("/")
                if len(user_pass) == 2 and len(host_port_db) == 2:
                    user = user_pass[0]
                    password = user_pass[1]
                    host_port = host_port_db[0].split(":")
                    host = host_port[0]
                    port = int(host_port[1]) if len(host_port) > 1 else 5432
                    database = host_port_db[1]
                    
                    # Connect to database directly
                    conn = await asyncpg.connect(
                        host=host,
                        port=port,
                        user=user,
                        password=password,
                        database=database
                    )
                    
                    # Query the cles_api table
                    row = await conn.fetchrow("SELECT cle_openai, cle_gemini, cle_deepseek FROM cles_api LIMIT 1")
                    await conn.close()
                    
                    if row:
                        return {
                            "cle_openai": row['cle_openai'],
                            "cle_gemini": row['cle_gemini'],
                            "cle_deepseek": row['cle_deepseek']
                        }
                    else:
                        print("🔑 No API keys found in database")
                        return {}
                else:
                    print("🔑 Invalid database URL format")
                    return {}
            else:
                print("🔑 Invalid database URL format")
                return {}
        else:
            print("🔑 Database URL must use postgresql+asyncpg:// format")
            return {}
            
    except Exception as e:
        print(f"🔑 Error getting API keys from database: {e}")
        print(f"🔑 Database API keys: False, False, False")
        return {}




def create_llm_config_from_model(model_name: str, api_keys: dict) -> LLMConfig:
    """Create LLMConfig from model name and API keys from database"""
    # Determine provider and API key based on model name
    if model_name.startswith("o4-") or model_name.startswith("gpt-"):
        provider = "openai"
        api_key = api_keys.get("cle_openai", "")
    elif model_name.startswith("gemini") or "gemini" in model_name:
        provider = "gemini"
        api_key = api_keys.get("cle_gemini", "")
    elif model_name.startswith("deepseek/"):
        provider = "deepseek"
        api_key = api_keys.get("cle_deepseek", "")
    else:
        # Default to OpenAI
        provider = "openai"
        api_key = api_keys.get("cle_openai", "")
    
    return LLMConfig(
        model_name=model_name,
        api_key=api_key,
        provider=provider
    )

async def get_llm_config_from_model_name(model_name: str) -> LLMConfig:
    """Get LLM config by fetching API key from database based on model name (like original)"""
    print(f"🔑 Getting LLM config for model: {model_name}")
    
    # Try to get API keys from database directly (like original)
    api_keys = await get_api_keys_from_db()
    print(f"🔑 Database API keys: {bool(api_keys.get('cle_openai'))}, {bool(api_keys.get('cle_gemini'))}, {bool(api_keys.get('cle_deepseek'))}")
    
    if api_keys:
        # Use the API keys from database
        llm_config = create_llm_config_from_model(model_name, api_keys)
        print(f"🔑 Using API key from database: {llm_config.api_key[:10] if llm_config.api_key else 'None'}...")
        return llm_config
    else:
        # Fallback to environment variables
        print(f"🔑 Database failed, using environment variables as fallback")
        if model_name.startswith("o4-") or model_name.startswith("gpt-"):
            api_key = os.getenv("OPENAI_API_KEY", "")
            provider = "openai"
        elif model_name.startswith("gemini") or "gemini" in model_name:
            api_key = os.getenv("GEMINI_API_KEY", "")
            provider = "gemini"
        elif model_name.startswith("deepseek") or "deepseek" in model_name:
            api_key = os.getenv("DEEPSEEK_API_KEY", "")
            provider = "deepseek"
        else:
            api_key = os.getenv("OPENAI_API_KEY", "")
            provider = "openai"
        
        print(f"🔑 Using environment API key: {api_key[:10] if api_key else 'None'}...")
        if not api_key:
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail=f"API key not found in database for model: {model_name}")
        return LLMConfig(
            model_name=model_name,
            api_key=api_key,
            provider=provider
        )


def extract_json_from_deepseek_response(response_text: str) -> Optional[Dict]:
    """Extract JSON from DeepSeek's verbose response (matches original data_management_api_fixed.py)"""
    
    if not response_text:
        return None
        
    # Try to find JSON in the response
    json_pattern = r'```json\s*(\{.*?\})\s*```'
    match = re.search(json_pattern, response_text, re.DOTALL)
    
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            pass
    
    # If no code block, try to find JSON directly
    try:
        # Look for JSON object in the text
        start = response_text.find('{')
        end = response_text.rfind('}') + 1
        if start != -1 and end != 0:
            json_str = response_text[start:end]
            return json.loads(json_str)
    except json.JSONDecodeError:
        pass
    
    return None


def parse_mcp_response_local(raw):
    """Parse MCP response locally"""
    try:
        if isinstance(raw, dict):
            return raw
        elif isinstance(raw, str):
            try:
                return json.loads(raw)
            except json.JSONDecodeError:
                return raw
        return raw
    except Exception as e:
        print(f"Error parsing MCP response: {e}")
        return raw


def call_mcp(tool_name, arguments, mcp_url=None):
    if mcp_url is None:
        import os
        mcp_url = os.getenv("MCP_DB_SERVER_URL", "http://localhost:8017/mcp")
    """Send a JSON-RPC request to the MCP server."""
    
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {
            "name": tool_name,
            "arguments": arguments
        }
    }
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream"
    }
    try:
        response = requests.post(mcp_url, json=payload, headers=headers, timeout=30)
        response.encoding = 'utf-8'  # Ensure correct decoding of Unicode characters
        response.raise_for_status()
        return response.text  # Return raw text, not parsed JSON
    except requests.RequestException as e:
        print(f"[ERROR] MCP request failed: {e}")
        return None


def get_connected_databases():
    """Get list of connected databases"""
    from ..services.mcp_service import get_connected_databases as _get_connected_databases
    return _get_connected_databases()




def normalize_orcid_response(response_text: str, response_type: str = "search", llm_config: Optional[LLMConfig] = None) -> Dict[str, Any]:
    """Normalize ORCID response to standard format"""
    try:
        # Try to parse as JSON first
        if isinstance(response_text, str):
            try:
                parsed = json.loads(response_text)
                if isinstance(parsed, dict):
                    return parsed
            except json.JSONDecodeError:
                pass
        
        # If not JSON, create a fallback response
        return create_fallback_response(response_text, response_type)
        
    except Exception as e:
        print(f"Error normalizing ORCID response: {e}")
        return create_fallback_response(response_text, response_type)


def create_fallback_response(response_text: str, response_type: str) -> Dict[str, Any]:
    """Create a fallback response when parsing fails"""
    if response_type == "search":
        return {
            "researchers": [],
            "total_found": 0,
            "error": "Failed to parse search results",
            "raw_response": response_text[:500]  # Truncate for safety
        }
    elif response_type == "profile":
        return {
            "orcid_id": None,
            "first_name": None,
            "last_name": None,
            "email": None,
            "country": None,
            "affiliation": None,
            "main_research_area": None,
            "specific_research_area": None,
            "error": "Failed to parse profile data",
            "raw_response": response_text[:500]
        }
    else:
        return {
            "error": "Failed to parse response",
            "raw_response": response_text[:500]
        }


def list_mcp_tools():
    """List available MCP tools"""
    try:
        
        import os
        url = os.getenv("MCP_DB_SERVER_URL", "http://localhost:8017/mcp")
        payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/list",
            "params": {}
        }
        
        response = requests.post(url, json=payload, timeout=10)
        if response.status_code == 200:
            result = response.json()
            if "result" in result and "tools" in result["result"]:
                return result["result"]["tools"]
            else:
                return []
        else:
            return []
    except Exception as e:
        return []


async def get_schema_fallback(db_id: str, db_type: str) -> dict:
    """Fallback method to get schema by trying to query system tables"""
    try:
        print(f"Trying fallback schema method for database {db_id}")
        
        from ..services.mcp_service import call_mcp_select_data
        
        # Try to get schema using system queries
        if db_type == "postgres":
            # Try to get table list using a simple query
            try:
                # Use select_data to query information_schema.tables
                result = await call_mcp_select_data(
                    db_id=db_id,
                    table="information_schema.tables",
                    columns=["table_name", "table_schema"],
                    conditions={"table_schema": "public"}
                )
                
                if result["success"] and result["data"]:
                    tables = {}
                    for row in result["data"]:
                        table_name = row.get("table_name", "")
                        if table_name:
                            # Try to get columns for this table
                            try:
                                col_result = await call_mcp_select_data(
                                    db_id=db_id,
                                    table=f"information_schema.columns",
                                    columns=["column_name", "data_type"],
                                    conditions={"table_name": table_name, "table_schema": "public"}
                                )
                                
                                if col_result["success"] and col_result["data"]:
                                    columns = {}
                                    for col_row in col_result["data"]:
                                        col_name = col_row.get("column_name", "")
                                        col_type = col_row.get("data_type", "")
                                        if col_name:
                                            columns[col_name] = col_type
                                    tables[table_name] = columns
                            except Exception as col_error:
                                print(f"Error getting columns for table {table_name}: {col_error}")
                                tables[table_name] = {"error": "Could not retrieve columns"}
                    
                    if tables:
                        return {"success": True, "data": tables, "tool_used": "fallback_select_data"}
                
            except Exception as e:
                print(f"Fallback schema method failed: {e}")
                
        elif db_type == "mysql":
            # Try to get table list using MySQL-specific query
            try:
                # Get the database name from our local mapping
                from ..services.mcp_service import simple_databases
                db_name = "stage2a"  # Default fallback for MySQL
                if int(db_id) in simple_databases:
                    db_name = simple_databases[int(db_id)].dbName
                
                # Use select_data to query information_schema.tables for MySQL
                result = await call_mcp_select_data(
                    db_id=db_id,
                    table="information_schema.tables",
                    columns=["table_name", "table_schema"],
                    conditions={"table_schema": db_name}  # MySQL uses database name as schema
                )
                
                if result["success"] and result["data"]:
                    tables = {}
                    for row in result["data"]:
                        table_name = row.get("table_name", "")
                        if table_name:
                            # Try to get columns for this table
                            try:
                                if db_type == "postgres":
                                    schema_name = "public"
                                else:  # MySQL
                                    schema_name = db_name
                                
                                col_result = await call_mcp_select_data(
                                    db_id=db_id,
                                    table=f"information_schema.columns",
                                    columns=["column_name", "data_type"],
                                    conditions={"table_name": table_name, "table_schema": schema_name}
                                )
                                
                                if col_result["success"] and col_result["data"]:
                                    columns = {}
                                    for col_row in col_result["data"]:
                                        col_name = col_row.get("column_name", "")
                                        col_type = col_row.get("data_type", "")
                                        if col_name:
                                            columns[col_name] = col_type
                                    tables[table_name] = columns
                            except Exception as col_error:
                                print(f"Error getting columns for table {table_name}: {col_error}")
                                tables[table_name] = {"error": "Could not retrieve columns"}
                    
                    if tables:
                        return {"success": True, "data": tables, "tool_used": "fallback_select_data"}
                
            except Exception as e:
                print(f"MySQL fallback schema method failed: {e}")
        
        return {"success": False, "error": "Fallback schema method failed"}
        
    except Exception as e:
        return {"success": False, "error": f"Fallback schema error: {str(e)}"}


def extract_structured_profile_data(profile_data, works_data=None, works_limit=10):
    """Extract structured information from ORCID profile and works data"""
    
    # Extract affiliations from profile
    affiliations = []
    
    # From employments
    if "activities-summary" in profile_data and "employments" in profile_data["activities-summary"]:
        for group in profile_data["activities-summary"]["employments"].get("affiliation-group", []):
            for summary_item in group.get("summaries", []):
                employment = summary_item.get("employment-summary", {})
                org_name = employment.get("organization", {}).get("name", "")
                dept_name = employment.get("department-name", "")
                
                if org_name:
                    affiliation_text = org_name
                    if dept_name:
                        affiliation_text += f" - {dept_name}"
                    affiliations.append(affiliation_text)
    
    # From educations
    if "activities-summary" in profile_data and "educations" in profile_data["activities-summary"]:
        for group in profile_data["activities-summary"]["educations"].get("affiliation-group", []):
            for summary_item in group.get("summaries", []):
                education = summary_item.get("education-summary", {})
                org_name = education.get("organization", {}).get("name", "")
                dept_name = education.get("department-name", "")
                
                if org_name:
                    affiliation_text = org_name
                    if dept_name:
                        affiliation_text += f" - {dept_name}"
                    affiliations.append(affiliation_text)
    
    # From invited positions
    if "activities-summary" in profile_data and "invited-positions" in profile_data["activities-summary"]:
        for group in profile_data["activities-summary"]["invited-positions"].get("affiliation-group", []):
            for summary_item in group.get("summaries", []):
                position = summary_item.get("invited-position-summary", {})
                org_name = position.get("organization", {}).get("name", "")
                dept_name = position.get("department-name", "")
                
                if org_name:
                    affiliation_text = org_name
                    if dept_name:
                        affiliation_text += f" - {dept_name}"
                    affiliations.append(affiliation_text)
    
    # Remove duplicates while preserving order
    affiliations = list(dict.fromkeys(affiliations))
    
    # Extract keywords from profile
    profile_keywords = []
    if "person" in profile_data and "keywords" in profile_data["person"]:
        for keyword_item in profile_data["person"]["keywords"].get("keyword", []):
            content = keyword_item.get("content", "")
            if content:
                profile_keywords.append(content)
    
    # Extract research fields and keywords from works
    research_fields = []
    research_keywords = []
    work_titles = []
    
    if works_data and "group" in works_data:
        for group in works_data["group"][:works_limit]:
            for work_summary_item in group.get("work-summary", []):
                title_info = work_summary_item.get("title", {})
                title = title_info.get("title", {}).get("value", "") if title_info else ""
                
                if title:
                    work_titles.append(title)
                    
                    # Extract keywords from title
                    title_lower = title.lower()
                    
                    # Technical terms that indicate research areas
                    tech_terms = [
                        "machine learning", "deep learning", "artificial intelligence", "neural network",
                        "computer vision", "natural language processing", "data mining", "big data",
                        "blockchain", "cybersecurity", "cloud computing", "iot", "internet of things",
                        "microservices", "nosql", "database", "systematic review", "modeling",
                        "optimization", "algorithm", "simulation", "analysis", "detection",
                        "classification", "prediction", "framework", "architecture", "system",
                        "network", "software", "application", "platform", "infodemic", "epidemic",
                        "participatory", "stakeholder", "3d", "pose estimation", "human pose"
                    ]
                    
                    for term in tech_terms:
                        if term in title_lower and term not in research_keywords:
                            research_keywords.append(term)
    
    # Generate research fields from keywords and titles
    if research_keywords or work_titles:
        # Group keywords into broader research fields
        field_mapping = {
            "Artificial Intelligence & Machine Learning": [
                "machine learning", "deep learning", "artificial intelligence", "neural network",
                "computer vision", "natural language processing", "pose estimation"
            ],
            "Data Science & Analytics": [
                "data mining", "big data", "systematic review", "analysis", "detection",
                "classification", "prediction", "modeling"
            ],
            "Software Engineering & Systems": [
                "microservices", "software", "application", "platform", "architecture",
                "system", "framework", "participatory", "stakeholder"
            ],
            "Database & Information Systems": [
                "nosql", "database", "information systems", "cloud computing"
            ],
            "Computer Networks & Security": [
                "network", "cybersecurity", "blockchain", "iot", "internet of things"
            ],
            "Health Informatics & Public Health": [
                "infodemic", "epidemic", "health", "public health"
            ]
        }
        
        for field, keywords in field_mapping.items():
            if any(keyword in research_keywords for keyword in keywords):
                research_fields.append(field)
    
    # Combine profile keywords with research keywords
    all_keywords = list(dict.fromkeys(profile_keywords + research_keywords))
    
    return {
        "affiliations": affiliations if affiliations else ["No affiliations found in profile"],
        "research_fields": research_fields if research_fields else ["Research fields not specified in profile"],
        "keywords": all_keywords[:15] if all_keywords else ["No specific keywords identified"],
        "work_titles": work_titles[:5],  # First 5 work titles
        "total_works": len(works_data.get("group", [])) if works_data else 0
    }


def extract_external_links(person_data):
    """Extract external identifiers and researcher URLs from ORCID person data"""
    external_links = {
        "external_identifiers": [],
        "researcher_urls": [],
        "scopus_id": None,
        "scopus_url": None,
        "linkedin_url": None,
        "personal_website": None,
        "google_scholar": None,
        "researchgate": None,
        "researcherid": None,
        "researcherid_url": None,
        "web_of_science": None,
        "publons_url": None,
        "academic_websites": [],
        "emails": []
    }
    
    if not person_data:
        return external_links
    
    # Extract external identifiers (Scopus, ResearcherID, Web of Science, etc.)
    if "external-identifiers" in person_data and "external-identifier" in person_data["external-identifiers"]:
        for ext_id in person_data["external-identifiers"]["external-identifier"]:
            id_type = ext_id.get("external-id-type", "")
            id_value = ext_id.get("external-id-value", "")
            id_url = ext_id.get("external-id-url", {}).get("value", "") if ext_id.get("external-id-url") else ""
            source_name = ext_id.get("source", {}).get("source-name", {}).get("value", "") if ext_id.get("source") else ""
            
            if id_type and id_value:
                identifier_info = {
                    "type": id_type,
                    "value": id_value,
                    "url": id_url,
                    "source": source_name
                }
                external_links["external_identifiers"].append(identifier_info)
                
                # Set specific platform fields based on type
                id_type_lower = id_type.lower()
                if "scopus" in id_type_lower:
                    external_links["scopus_id"] = id_value
                    if id_url:
                        external_links["scopus_url"] = id_url
                    else:
                        # Generate Scopus URL if not provided
                        external_links["scopus_url"] = f"https://www.scopus.com/authid/detail.uri?authorId={id_value}"
                elif "researcherid" in id_type_lower or "researcher id" in id_type_lower:
                    external_links["researcherid"] = id_value
                    if id_url:
                        external_links["researcherid_url"] = id_url
                    else:
                        # Generate ResearcherID URL if not provided
                        external_links["researcherid_url"] = f"https://www.webofscience.com/wos/author/record/{id_value}"
                elif "web of science" in id_type_lower or "wos" in id_type_lower:
                    external_links["web_of_science"] = id_value
                elif "publons" in id_type_lower:
                    external_links["publons_url"] = id_url if id_url else f"https://publons.com/researcher/{id_value}/"
    
    # Extract researcher URLs (LinkedIn, Google Scholar, personal websites, etc.)
    if "researcher-urls" in person_data and "researcher-url" in person_data["researcher-urls"]:
        for url_item in person_data["researcher-urls"]["researcher-url"]:
            url_name = url_item.get("url-name", "")
            url_value = url_item.get("url", {}).get("value", "") if url_item.get("url") else ""
            
            if url_value:
                url_info = {
                    "name": url_name,
                    "url": url_value
                }
                external_links["researcher_urls"].append(url_info)
                
                # Categorize URLs by platform
                url_lower = url_value.lower()
                name_lower = url_name.lower() if url_name else ""
                
                if "linkedin" in url_lower or "linkedin" in name_lower:
                    external_links["linkedin_url"] = url_value
                elif "scholar.google" in url_lower or "google scholar" in name_lower:
                    external_links["google_scholar"] = url_value
                elif "researchgate" in url_lower or "research gate" in name_lower:
                    external_links["researchgate"] = url_value
                elif "publons" in url_lower or "publons" in name_lower:
                    external_links["publons_url"] = url_value
                elif any(academic_domain in url_lower for academic_domain in [
                    "university", "univ", "edu", "ac.", "ensias", "um5", "research", "lab", "institute"
                ]):
                    # Academic/institutional websites
                    external_links["academic_websites"].append(url_info)
                    # Set as personal website if it's the first academic one and no personal website is set
                    if not external_links["personal_website"]:
                        external_links["personal_website"] = url_value
                elif not any(platform in url_lower for platform in [
                    "orcid", "publons", "web-of-science", "scopus", "researcherid"
                ]):
                    # Other personal/professional websites
                    if not external_links["personal_website"]:
                        external_links["personal_website"] = url_value
    
    # Extract email addresses
    if "emails" in person_data and "email" in person_data["emails"]:
        for email_entry in person_data["emails"]["email"]:
            email_value = email_entry.get("email", "")
            is_verified = email_entry.get("verified", False)
            is_primary = email_entry.get("primary", False)
            
            if email_value:
                external_links["emails"].append({
                    "email": email_value,
                    "verified": is_verified,
                    "primary": is_primary
                })
    
    return external_links
