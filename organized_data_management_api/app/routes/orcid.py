"""
ORCID-related API endpoints
"""

import json
import asyncio
import requests
import traceback
from fastapi import APIRouter, HTTPException, status, BackgroundTasks
from typing import Dict, List, Any, Optional
from contextlib import nullcontext
from agents import Runner

from ..models.orcid import (
    ORCIDTableSearchRequest_v2, OrcidSearchResult, ResearcherInfoTable
)
from ..models.base import LLMConfig
from ..services import agent_service
from ..services.agent_service import (
    initialize_orcid_server, get_agent_and_servers_v2, 
    make_deepseek_orcid_search_agent
)
from ..services.mcp_service import get_connected_databases
from ..utils.helpers import (
    create_task, update_task_status, get_task_status, 
    get_llm_config_from_model_name,
    safe_json_loads, extract_json_from_deepseek_response,
    extract_structured_profile_data, extract_external_links
)
from ..utils.database_utils import select_query_results_v2

router = APIRouter(prefix="/api/orcid", tags=["orcid"])


@router.post("/table-search_v2")
async def search_orcid_from_table(request: ORCIDTableSearchRequest_v2):
    """Search for ORCID profiles from database table data using multi-agent approach"""
    task_id = create_task()
    
    async def table_search_task():
        try:
            update_task_status(task_id, "running")
            
            print(f"Starting ORCID search task {task_id}")

            # Get connected databases
            connected_databases = get_connected_databases()
            getresults = connected_databases.get("result", [])
            getids = [int(db["id"]) for db in getresults if "id" in db]
            
            # Validate database exists - handle both numeric and string IDs
            db_id_to_check = request.db_id
            if isinstance(db_id_to_check, str) and db_id_to_check.startswith("db_"):
                # Extract numeric part from "db_X" format
                try:
                    db_id_to_check = int(db_id_to_check[3:])
                except ValueError:
                    update_task_status(task_id, "failed", error=f"Invalid database ID format: {request.db_id}")
                    raise HTTPException(status_code=400, detail=f"Invalid database ID format: {request.db_id}")
            
            if db_id_to_check not in getids:
                update_task_status(task_id, "failed", error=f"Database with id {request.db_id} not found")
                raise HTTPException(status_code=404, detail=f"Database with id {request.db_id} not found")
            
            # Get LLM config from model name (fetches API key from database)
            llm_config = await get_llm_config_from_model_name(request.model_name)
            
            # Check if we have the required API key
            if not llm_config.api_key:
                update_task_status(task_id, "failed", error=f"API key not found in database for model: {request.model_name}")
                raise HTTPException(status_code=400, detail=f"API key not found in database for model: {request.model_name}")
            
            # Get agents and servers
            try:
                (column_mapper_agent, orcid_search_agent, extract_agent, 
                 works_extract_agent, orcid_result_picker, databases_server, local_orcid_server) = get_agent_and_servers_v2(llm_config)
            except Exception as e:
                update_task_status(task_id, "failed", error=f"Failed to initialize agents: {str(e)}")
                raise HTTPException(status_code=500, detail=f"Failed to initialize agents: {str(e)}")
            
            # Step 1: Query the database table to get researcher data
            async with databases_server or nullcontext(), local_orcid_server or nullcontext():
                # Run blocking function in separate thread
                response = await asyncio.to_thread(select_query_results_v2, db_id_to_check, request.table_name, request.selected_columns)
                print("-----------step1---------------")
                # Extract the actual rows from the response
                if isinstance(response, dict) and "result" in response:
                    rows = response["result"]
                else:
                    rows = response
                    
                print(f"\nFound {len(rows)} rows in the table. Processing...")
                
                all_results = []
                for idx, row in enumerate(rows, 1):
                    # Skip if row is not a dictionary
                    if not isinstance(row, dict):
                        print(f"Row {idx}: Unexpected row format. Skipping.")
                        continue
                        
                    extract_prompt = json.dumps(row)
                    print(f"\nProcessing row {idx}/{len(rows)}: {extract_prompt}")
                    
                    extract_result = (
                        await Runner.run(
                            extract_agent,
                            [{"type": "message", "role": "user", "content": extract_prompt}],
                        )
                    ).final_output
                    
                    # Parse the extract result - it might be a string for non-OpenAI models
                    if isinstance(extract_result, str):
                        try:
                            extract_data = safe_json_loads(extract_result)
                            if isinstance(extract_data, dict):
                                first_name = extract_data.get('firstname')
                                last_name = extract_data.get('lastname')
                                email = extract_data.get('email')
                                affiliation = extract_data.get('affiliation')
                                country = extract_data.get('country')
                            else:
                                print(f"Row {idx}: Failed to parse extract result as JSON. Skipping.")
                                continue
                        except Exception as e:
                            print(f"Row {idx}: Error parsing extract result: {e}. Skipping.")
                            continue
                    else:
                        # For OpenAI models, extract_result should be an object
                        first_name = extract_result.firstname if hasattr(extract_result, 'firstname') else None
                        last_name = extract_result.lastname if hasattr(extract_result, 'lastname') else None
                        email = extract_result.email if hasattr(extract_result, 'email') else None
                        affiliation = extract_result.affiliation if hasattr(extract_result, 'affiliation') else None
                        country = extract_result.country if hasattr(extract_result, 'country') else None
                    
                    if not first_name or not last_name:
                        print(f"Row {idx}: Missing required name information. Skipping.")
                        continue
                    
                    print(f"Row {idx}: Extracted - {first_name} {last_name} ({email}, {affiliation}, {country})")
                    
                    # Step 2: Search ORCID with multiple variants
                    search_variants = [
                        ("name_only", "Searching by name only"),
                        ("name_affiliation", "Searching by name and affiliation") if affiliation else None,
                        ("name_email", "Searching by name and email") if email else None,
                        ("name_country", "Searching by name and country") if country else None,
                        ("swapped", "Searching with swapped names")
                    ]
                    
                    # Filter out None variants
                    search_variants = [v for v in search_variants if v is not None]
                    
                    search_results = []
                    for variant, description in search_variants:
                        print(f"Row {idx}: {description}")
                        
                        try:
                            search_result = await Runner.run(
                                orcid_search_agent,
                                [{
                                    "type": "message",
                                    "role": "user",
                                    "content": json.dumps({
                                        "first_name": first_name,
                                        "last_name": last_name,
                                        "email": email,
                                        "affiliation": affiliation,
                                        "country": country,
                                        "variant": variant
                                    })
                                }]
                            )
                            
                            # Handle different response formats
                            if hasattr(search_result, 'final_output'):
                                final_output = search_result.final_output
                            else:
                                final_output = search_result
                            
                            # Parse the search result
                            if isinstance(final_output, str):
                                try:
                                    parsed_result = safe_json_loads(final_output)
                                    if isinstance(parsed_result, dict):
                                        search_results.append(parsed_result)
                                    else:
                                        print(f"Row {idx}: Invalid search result format for variant {variant}")
                                except Exception as e:
                                    print(f"Row {idx}: Error parsing search result for variant {variant}: {e}")
                            else:
                                # For OpenAI models, final_output should be an object
                                search_results.append(final_output)
                                
                        except Exception as e:
                            print(f"Row {idx}: Error in ORCID search for variant {variant}: {e}")
                            continue
                    
                    if not search_results:
                        print(f"Row {idx}: No search results found. Skipping.")
                        continue
                    
                    # Step 3: Pick the best result
                    print(f"Row {idx}: Picking best result from {len(search_results)} search results")
                    
                    try:
                        picker_result = await Runner.run(
                            orcid_result_picker,
                            [{
                                "type": "message",
                                "role": "user",
                                "content": json.dumps({
                                    "wanted_researcher": {
                                        "first_name": first_name,
                                        "last_name": last_name,
                                        "email": email,
                                        "affiliation": affiliation,
                                        "country": country
                                    },
                                    "results": search_results
                                })
                            }]
                        )
                        
                        # Handle different response formats
                        if hasattr(picker_result, 'final_output'):
                            final_output = picker_result.final_output
                        else:
                            final_output = picker_result
                        
                        # Parse the picker result
                        if isinstance(final_output, str):
                            try:
                                parsed_result = safe_json_loads(final_output)
                                if isinstance(parsed_result, dict) and "result" in parsed_result:
                                    best_result = parsed_result["result"]
                                else:
                                    print(f"Row {idx}: Invalid picker result format")
                                    continue
                            except Exception as e:
                                print(f"Row {idx}: Error parsing picker result: {e}")
                                continue
                        else:
                            # For OpenAI models, final_output should be an object
                            if hasattr(final_output, 'result'):
                                best_result = final_output.result
                            else:
                                print(f"Row {idx}: Invalid picker result object")
                                continue
                        
                        # Step 4: Extract works and research areas
                        if best_result and hasattr(best_result, 'orcid_id') and best_result.orcid_id:
                            print(f"Row {idx}: Extracting works for ORCID ID: {best_result.orcid_id}")
                            
                            try:
                                works_result = await Runner.run(
                                    works_extract_agent,
                                    [{
                                        "type": "message",
                                        "role": "user",
                                        "content": json.dumps({
                                            "orcid_id": best_result.orcid_id,
                                            "first_name": best_result.first_name,
                                            "last_name": best_result.last_name,
                                            "email": best_result.email,
                                            "country": best_result.country,
                                            "affiliation": best_result.affiliation
                                        })
                                    }]
                                )
                                
                                # Handle different response formats
                                if hasattr(works_result, 'final_output'):
                                    works_output = works_result.final_output
                                else:
                                    works_output = works_result
                                
                                # Parse the works result
                                if isinstance(works_output, str):
                                    try:
                                        parsed_works = safe_json_loads(works_output)
                                        if isinstance(parsed_works, dict):
                                            # Update best_result with research areas
                                            if "main_research_area" in parsed_works:
                                                best_result.main_research_area = parsed_works["main_research_area"]
                                            if "specific_research_area" in parsed_works:
                                                best_result.specific_research_area = parsed_works["specific_research_area"]
                                    except Exception as e:
                                        print(f"Row {idx}: Error parsing works result: {e}")
                                else:
                                    # For OpenAI models, works_output should be an object
                                    if hasattr(works_output, 'main_research_area'):
                                        best_result.main_research_area = works_output.main_research_area
                                    if hasattr(works_output, 'specific_research_area'):
                                        best_result.specific_research_area = works_output.specific_research_area
                                        
                            except Exception as e:
                                print(f"Row {idx}: Error extracting works: {e}")
                        
                        # Convert to dict for JSON serialization
                        result_dict = {
                            "orcid_id": best_result.orcid_id if hasattr(best_result, 'orcid_id') else None,
                            "first_name": best_result.first_name if hasattr(best_result, 'first_name') else None,
                            "last_name": best_result.last_name if hasattr(best_result, 'last_name') else None,
                            "email": best_result.email if hasattr(best_result, 'email') else None,
                            "country": best_result.country if hasattr(best_result, 'country') else None,
                            "affiliation": best_result.affiliation if hasattr(best_result, 'affiliation') else None,
                            "main_research_area": best_result.main_research_area if hasattr(best_result, 'main_research_area') else None,
                            "specific_research_area": best_result.specific_research_area if hasattr(best_result, 'specific_research_area') else None,
                            "original_data": row
                        }
                        
                        all_results.append(result_dict)
                        print(f"Row {idx}: Successfully processed - ORCID ID: {result_dict['orcid_id']}")
                        
                    except Exception as e:
                        print(f"Row {idx}: Error in result picking: {e}")
                        continue
                
                update_task_status(task_id, "completed", result={
                    "results": all_results,
                    "total_processed": len(rows),
                    "successful_matches": len(all_results),
                    "model_used": request.model_name
                })
                
                print(f"Task {task_id} completed successfully. Found {len(all_results)} matches from {len(rows)} rows.")
                
        except Exception as e:
            print(f"Task {task_id} failed: {e}")
            update_task_status(task_id, "failed", error=str(e))
            raise
    
    # Start the background task
    BackgroundTasks().add_task(table_search_task)
    
    return {"task_id": task_id, "status": "started"}


@router.post("/table-search-deepseek")
async def search_orcid_from_table_deepseek(request: ORCIDTableSearchRequest_v2):
    """Search for ORCID profiles from database table data using DeepSeek agent directly (matches original data_management_api_fixed.py)"""
    task_id = create_task()
    
    async def table_search_task():
        try:
            update_task_status(task_id, "running")
            
            print(f"Starting DeepSeek ORCID search task {task_id}")

            # Get connected databases
            connected_databases = get_connected_databases()
            getresults = connected_databases.get("result", [])
            getids = [int(db["id"]) for db in getresults if "id" in db]
            
            # Validate database exists - handle both numeric and string IDs
            db_id_to_check = request.db_id
            if isinstance(db_id_to_check, str) and db_id_to_check.startswith("db_"):
                # Extract numeric part from "db_X" format
                try:
                    db_id_to_check = int(db_id_to_check[3:])
                except ValueError:
                    update_task_status(task_id, "failed", error=f"Invalid database ID format: {request.db_id}")
                    raise HTTPException(status_code=400, detail=f"Invalid database ID format: {request.db_id}")
            
            if db_id_to_check not in getids:
                update_task_status(task_id, "failed", error=f"Database with id {request.db_id} not found")
                raise HTTPException(status_code=404, detail=f"Database with id {request.db_id} not found")
            
            # Get LLM config from model name (fetches API key from database)
            llm_config = await get_llm_config_from_model_name(request.model_name)
            
            # Check if we have the required API key
            if not llm_config.api_key:
                update_task_status(task_id, "failed", error=f"API key not found in database for model: {request.model_name}")
                raise HTTPException(status_code=400, detail=f"API key not found in database for model: {request.model_name}")
            
            # Create DeepSeek ORCID search agent
            orcid_search_agent = make_deepseek_orcid_search_agent(llm_config.model_name, llm_config.api_key)
            
            # Step 1: Query the database table to get researcher data
            response = await asyncio.to_thread(select_query_results_v2, db_id_to_check, request.table_name, request.selected_columns)
            print("-----------step1---------------")
            
            # Extract the actual rows from the response
            if isinstance(response, dict) and "result" in response:
                rows = response["result"]
            else:
                rows = response
                
            print(f"\nFound {len(rows)} rows in the table. Processing with DeepSeek agent...")
            
            all_results = []
            for idx, row in enumerate(rows, 1):
                # Skip if row is not a dictionary
                if not isinstance(row, dict):
                    print(f"Row {idx}: Unexpected row format. Skipping.")
                    continue
                
                # Format row data as key-value pairs for the agent
                row_data_str = ", ".join([f"{key}: {value}" for key, value in row.items() if value is not None and str(value).strip()])
                print(f"\nProcessing row {idx}/{len(rows)}: {row_data_str}")
                
                # Create search prompt with structured row data
                search_prompt = f"Search for this researcher: {row_data_str}"
                
                try:
                    # Run the DeepSeek agent with the server
                    async with orcid_search_agent.mcp_servers[0] or nullcontext():
                        result = await Runner.run(
                            orcid_search_agent,
                            [{"type": "message", "role": "user", "content": search_prompt}],
                        )
                        
                        print(f"🔍 Row {idx} Raw Agent Response:")
                        print(result.final_output)
                        
                        # Extract JSON from the response
                        researchers_data = extract_json_from_deepseek_response(result.final_output)
                        
                        if researchers_data and 'researchers' in researchers_data and researchers_data['researchers']:
                            # Get the first researcher result
                            researcher = researchers_data['researchers'][0]
                            
                            # Create result object with found data
                            result_obj = OrcidSearchResult(
                                orcid_id=researcher.get('orcid', ''),
                                first_name=researcher.get('given_names', ''),
                                last_name=researcher.get('family_names', ''),
                                email=researcher.get('email', ''),
                                country=researcher.get('country', ''),
                                affiliation=researcher.get('affiliation', ''),
                                main_research_area=researcher.get('main_research_area', ''),
                                specific_research_area=researcher.get('specific_research_area', ''),
                                reasoning="ORCID found using DeepSeek agent",
                                confidence=0.8,  # Default confidence for DeepSeek results
                                original_data=row
                            )
                            
                            print(f"✅ Row {idx}: Found researcher: {result_obj.orcid_id}")
                        else:
                            # No researchers found, preserve original data
                            result_obj = OrcidSearchResult(
                                orcid_id="",
                                first_name=row.get('first_name', row.get('prenom', '')),
                                last_name=row.get('last_name', row.get('nom', '')),
                                email=row.get('email', ''),
                                country=row.get('country', ''),
                                affiliation=row.get('affiliation', row.get('institution', '')),
                                main_research_area=None,
                                specific_research_area=None,
                                reasoning="No ORCID profile found using DeepSeek agent",
                                confidence=0.0,
                                original_data=row
                            )
                            
                            print(f"❌ Row {idx}: No researchers found")
                        
                        all_results.append(result_obj)
                        
                except Exception as e:
                    print(f"❌ Row {idx}: Error processing with DeepSeek agent: {str(e)}")
                    # Create error result preserving original data
                    result_obj = OrcidSearchResult(
                        orcid_id="",
                        first_name=row.get('first_name', row.get('prenom', '')),
                        last_name=row.get('last_name', row.get('nom', '')),
                        email=row.get('email', ''),
                        country=row.get('country', ''),
                        affiliation=row.get('affiliation', row.get('institution', '')),
                        main_research_area=None,
                        specific_research_area=None,
                        reasoning=f"Error processing: {str(e)}",
                        confidence=0.0,
                        original_data=row
                    )
                    all_results.append(result_obj)
                    
            print("\n========== ALL DEEPSEEK ORCID SEARCH RESULTS ==========")
            # Convert to list of dictionaries for clean JSON response
            clean_results = [result.model_dump() for result in all_results]
            
            # Update task status with final results
            update_task_status(task_id, "completed", result=clean_results)
            return clean_results
            
        except Exception as e:
            print(f"DeepSeek ORCID search task {task_id} failed: {str(e)}")
            traceback.print_exc()
            update_task_status(task_id, "failed", error=str(e))
            raise HTTPException(status_code=500, detail=f"DeepSeek ORCID search failed: {str(e)}")
    
    # Directly await the task and return its result
    return await table_search_task()


@router.post("/table-person_v2")
async def search_orcid_from_table_person(request: Dict) -> ResearcherInfoTable:
    """Search for ORCID profiles from database table data using DeepSeek agent"""
    
    try:
        # Extract researcher information from request
        researcher_info = request.get('researcher', {})
        llm_config_data = request.get('llm_config', {})
        
        print(f"🔍 Received researcher info: {researcher_info}")
        print(f"🔍 Received LLM config: {llm_config_data}")
        
        # Get LLM config from model name (fetches API key from database)
        model_name = request.get('model_name', 'deepseek/deepseek-reasoner')
        llm_config = await get_llm_config_from_model_name(model_name)
        
        if not llm_config.api_key:
            raise HTTPException(status_code=400, detail=f"API key not found in database for model: {model_name}")
        
        # Check if this is a DeepSeek model
        # is_good_model = "deepseek-reasoner" in llm_config.model_name.lower() or "o4-mini" in llm_config.model_name.lower() or "gemini-2.5-flash" in llm_config.model_name.lower() or "gemini-2.5-flash-lite" in llm_config.model_name.lower()
        # print(f"DEBUG: Using DeepSeek model: {is_good_model}")
        
        # Create the appropriate agent with a new server instance for each request
       
        orcid_search_agent = make_deepseek_orcid_search_agent(llm_config.model_name, llm_config.api_key)
        
        # Create structured string with all researcher information
        researcher_info_str = ""
        for key, value in researcher_info.items():
            if value:  # Only include non-empty values
                researcher_info_str += f"{key}: {value}, "
        
        # Remove trailing comma and space
        if researcher_info_str:
            researcher_info_str = researcher_info_str.rstrip(", ")
        
        # Create search prompt with structured information
        search_prompt = f"Search for this researcher: {researcher_info_str}"
        
        print(f"🔍 Researcher info string: {researcher_info_str}")
        print(f"🔍 Searching for: {search_prompt}")
        
        # Run the search with the agent's server (using the pattern from working file)
        async with orcid_search_agent.mcp_servers[0] or nullcontext():
            result = await Runner.run(
                orcid_search_agent,
                [{"type": "message", "role": "user", "content": search_prompt}],
            )
            
            print("🔍 Raw Agent Response:")
            print(result.final_output)
            
            # Extract JSON from the response
            researchers_data = extract_json_from_deepseek_response(result.final_output)
            
            if researchers_data and 'researchers' in researchers_data and researchers_data['researchers']:
                # Get the first researcher result
                researcher = researchers_data['researchers'][0]
                
                # Create ResearcherInfoTable object
                result_obj = ResearcherInfoTable(
                    orcid_id=researcher.get('orcid', ''),
                    first_name=researcher.get('given_names', ''),
                    last_name=researcher.get('family_names', ''),
                    email=researcher.get('email', ''),
                    country=researcher.get('country', ''),
                    affiliation=researcher.get('affiliation', ''),
                    main_research_area=researcher.get('main_research_area', ''),
                    specific_research_area=researcher.get('specific_research_area', '')
                )
                
                print(f"✅ Found researcher: {result_obj.model_dump()}")
                return result_obj
            else:
                # Return result with original values preserved when no researchers found
                # Extract original values from the input request
                original_first_name = researcher_info.get('first_name', researcher_info.get('prenom', ''))
                original_last_name = researcher_info.get('last_name', researcher_info.get('nom', ''))
                original_email = researcher_info.get('email', '')
                original_affiliation = researcher_info.get('affiliation', researcher_info.get('affiliations', ''))
                original_country = researcher_info.get('country', '')
                
                empty_result = ResearcherInfoTable(
                    orcid_id="",
                    first_name=original_first_name,
                    last_name=original_last_name,
                    email=original_email,
                    country=original_country,
                    affiliation=original_affiliation,
                    main_research_area="",
                    specific_research_area=""
                )
                print("❌ No researchers found - preserving original values")
                return empty_result
                
    except Exception as e:
        print(f"❌ ORCID search failed: {str(e)}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"ORCID search failed: {str(e)}")

@router.post("/search-individual")
async def search_orcid_from_table_person_multiagent(request: Dict) -> ResearcherInfoTable:
    """Search for ORCID profiles from database table data using multi-agents approach"""
    try:
        # Extract researcher information from request
        researcher_info = request.get('researcher', {})
        llm_config_data = request.get('llm_config', {})
        
        print(f"🔍 Received researcher info: {researcher_info}")
        print(f"🔍 Received LLM config: {llm_config_data}")
        
        # Get LLM config from model name (fetches API key from database)
        model_name = request.get('model_name', 'openai/o4-mini')
        llm_config = await get_llm_config_from_model_name(model_name)
        
        if not llm_config.api_key:
            raise HTTPException(status_code=400, detail=f"API key not found in database for model: {model_name}")
        
        
       # Get agents and servers
        try:
            (column_mapper_agent, orcid_search_agent, extract_agent, 
            works_extract_agent, orcid_result_picker, databases_server, local_orcid_server) = get_agent_and_servers_v2(llm_config)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to initialize agents: {str(e)}")
            

        # Create structured string with all researcher information
        researcher_info_str = ""
        for key, value in researcher_info.items():
            if value:  # Only include non-empty values
                researcher_info_str += f"{key}: {value}, "
        
        # Remove trailing comma and space
        if researcher_info_str:
            researcher_info_str = researcher_info_str.rstrip(", ")
        
        # Create search prompt with structured information
        search_prompt = f"Search for this researcher: {researcher_info_str}"
        
        print(f"🔍 Researcher info string: {researcher_info_str}")
        print(f"🔍 Searching for: {search_prompt}")
        
        # Run the search with the agent's server (using the pattern from working file)
        async with orcid_search_agent.mcp_servers[0] or nullcontext():
            extract_result = (
                await Runner.run(
                    extract_agent,
                    [{"type": "message", "role": "user", "content": search_prompt}],
                )
            ).final_output
            
            # Parse the extract result - it might be a string for non-OpenAI models
            if isinstance(extract_result, str):
                try:
                    extract_data = safe_json_loads(extract_result)
                    if isinstance(extract_data, dict):
                        first_name = extract_data.get('firstname')
                        last_name = extract_data.get('lastname')
                        email = extract_data.get('email')
                        affiliation = extract_data.get('affiliation')
                        country = extract_data.get('country')
                    else:
                        print("Failed to parse extract result as JSON.")
                        # Return empty result if parsing fails
                        original_first_name = researcher_info.get('first_name', researcher_info.get('prenom', ''))
                        original_last_name = researcher_info.get('last_name', researcher_info.get('nom', ''))
                        original_email = researcher_info.get('email', '')
                        original_affiliation = researcher_info.get('affiliation', researcher_info.get('affiliations', ''))
                        original_country = researcher_info.get('country', '')
                        
                        return ResearcherInfoTable(
                            orcid_id="",
                            first_name=original_first_name,
                            last_name=original_last_name,
                            email=original_email,
                            country=original_country,
                            affiliation=original_affiliation,
                            main_research_area="",
                            specific_research_area=""
                        )
                except Exception as e:
                    print(f"Error parsing extract result: {e}.")
                    # Return empty result if parsing fails
                    original_first_name = researcher_info.get('first_name', researcher_info.get('prenom', ''))
                    original_last_name = researcher_info.get('last_name', researcher_info.get('nom', ''))
                    original_email = researcher_info.get('email', '')
                    original_affiliation = researcher_info.get('affiliation', researcher_info.get('affiliations', ''))
                    original_country = researcher_info.get('country', '')
                    
                    return ResearcherInfoTable(
                        orcid_id="",
                        first_name=original_first_name,
                        last_name=original_last_name,
                        email=original_email,
                        country=original_country,
                        affiliation=original_affiliation,
                        main_research_area="",
                        specific_research_area=""
                    )
            else:
                # For OpenAI models, extract_result should be an object
                first_name = extract_result.firstname if hasattr(extract_result, 'firstname') else None
                last_name = extract_result.lastname if hasattr(extract_result, 'lastname') else None
                email = extract_result.email if hasattr(extract_result, 'email') else None
                affiliation = extract_result.affiliation if hasattr(extract_result, 'affiliation') else None
                country = extract_result.country if hasattr(extract_result, 'country') else None
            
            if not first_name or not last_name:
                print("Missing required name information.")
                # Return empty result if no names
                original_first_name = researcher_info.get('first_name', researcher_info.get('prenom', ''))
                original_last_name = researcher_info.get('last_name', researcher_info.get('nom', ''))
                original_email = researcher_info.get('email', '')
                original_affiliation = researcher_info.get('affiliation', researcher_info.get('affiliations', ''))
                original_country = researcher_info.get('country', '')
                
                return ResearcherInfoTable(
                    orcid_id="",
                    first_name=original_first_name,
                    last_name=original_last_name,
                    email=original_email,
                    country=original_country,
                    affiliation=original_affiliation,
                    main_research_area="",
                    specific_research_area=""
                )
            
            print(f"Extracted - {first_name} {last_name} ({email}, {affiliation}, {country})")
            
            # Step 2: Search ORCID with multiple variants
            search_variants = [
                ("name_only", "Searching by name only"),
                ("name_affiliation", "Searching by name and affiliation") if affiliation else None,
                ("name_email", "Searching by name and email") if email else None,
                ("name_country", "Searching by name and country") if country else None,
                ("swapped", "Searching with swapped names")
            ]
            
            # Filter out None variants
            search_variants = [v for v in search_variants if v is not None]
            
            search_results = []
            for variant, description in search_variants:
                print(f"{description}")
                
                try:
                    search_result = await Runner.run(
                        orcid_search_agent,
                        [{
                            "type": "message",
                            "role": "user",
                            "content": json.dumps({
                                "first_name": first_name,
                                "last_name": last_name,
                                "email": email,
                                "affiliation": affiliation,
                                "country": country,
                                "variant": variant
                            })
                        }]
                    )
                    
                    # Handle different response formats
                    if hasattr(search_result, 'final_output'):
                        final_output = search_result.final_output
                    else:
                        final_output = search_result
                    
                    # Parse the search result
                    if isinstance(final_output, str):
                        print(f"🔍 Raw ORCID search response for {variant}:")
                        print(repr(final_output))
                        try:
                            # First try simple JSON parsing
                            parsed_result = safe_json_loads(final_output)
                            if isinstance(parsed_result, dict):
                                search_results.append(parsed_result)
                                print(f"✅ Successfully parsed result for {variant}")
                            else:
                                # Try extracting JSON from conversational text (like DeepSeek extraction)
                                print(f"🔄 Trying to extract JSON from conversational response...")
                                extracted_result = extract_json_from_deepseek_response(final_output)
                                if extracted_result and isinstance(extracted_result, dict):
                                    search_results.append(extracted_result)
                                    print(f"✅ Successfully extracted JSON for {variant}")
                                else:
                                    print(f"❌ Invalid search result format for variant {variant} - not a dict: {type(parsed_result)}")
                        except Exception as e:
                            print(f"❌ Error parsing search result for variant {variant}: {e}")
                    else:
                        # For OpenAI models, final_output should be an object
                        search_results.append(final_output)
                        
                except Exception as e:
                    print(f"Error in ORCID search for variant {variant}: {e}")
            
            if not search_results:
                print("No search results found.")
                original_first_name = researcher_info.get('first_name', researcher_info.get('prenom', ''))
                original_last_name = researcher_info.get('last_name', researcher_info.get('nom', ''))
                original_email = researcher_info.get('email', '')
                original_affiliation = researcher_info.get('affiliation', researcher_info.get('affiliations', ''))
                original_country = researcher_info.get('country', '')
                
                empty_result = ResearcherInfoTable(
                    orcid_id="",
                    first_name=original_first_name,
                    last_name=original_last_name,
                    email=original_email,
                    country=original_country,
                    affiliation=original_affiliation,
                    main_research_area="",
                    specific_research_area=""
                )
                print("❌ No researchers found - preserving original values")
                return empty_result
                
            
            # Step 3: Pick the best result
            print(f"Picking best result from {len(search_results)} search results")
            
            try:
                picker_result = await Runner.run(
                    orcid_result_picker,
                    [{
                        "type": "message",
                        "role": "user",
                        "content": json.dumps({
                            "wanted_researcher": {
                                "first_name": first_name,
                                "last_name": last_name,
                                "email": email,
                                "affiliation": affiliation,
                                "country": country
                            },
                            "results": search_results
                        })
                    }]
                )
                
                # Handle different response formats
                if hasattr(picker_result, 'final_output'):
                    final_output = picker_result.final_output
                else:
                    final_output = picker_result
                
                # Parse the picker result
                if isinstance(final_output, str):
                    try:
                        parsed_result = safe_json_loads(final_output)
                        if isinstance(parsed_result, dict) and "result" in parsed_result:
                            best_result = parsed_result["result"]
                        else:
                            print("Invalid picker result format")
                            # Return empty result if parsing fails
                            original_first_name = researcher_info.get('first_name', researcher_info.get('prenom', ''))
                            original_last_name = researcher_info.get('last_name', researcher_info.get('nom', ''))
                            original_email = researcher_info.get('email', '')
                            original_affiliation = researcher_info.get('affiliation', researcher_info.get('affiliations', ''))
                            original_country = researcher_info.get('country', '')
                            
                            return ResearcherInfoTable(
                                orcid_id="",
                                first_name=original_first_name,
                                last_name=original_last_name,
                                email=original_email,
                                country=original_country,
                                affiliation=original_affiliation,
                                main_research_area="",
                                specific_research_area=""
                            )
                    except Exception as e:
                        print(f"Error parsing picker result: {e}")
                        # Return empty result if parsing fails
                        original_first_name = researcher_info.get('first_name', researcher_info.get('prenom', ''))
                        original_last_name = researcher_info.get('last_name', researcher_info.get('nom', ''))
                        original_email = researcher_info.get('email', '')
                        original_affiliation = researcher_info.get('affiliation', researcher_info.get('affiliations', ''))
                        original_country = researcher_info.get('country', '')
                        
                        return ResearcherInfoTable(
                            orcid_id="",
                            first_name=original_first_name,
                            last_name=original_last_name,
                            email=original_email,
                            country=original_country,
                            affiliation=original_affiliation,
                            main_research_area="",
                            specific_research_area=""
                        )
                else:
                    # For OpenAI models, final_output should be an object
                    if hasattr(final_output, 'result'):
                        best_result = final_output.result
                    else:
                        print("Invalid picker result object")
                        # Return empty result if invalid
                        original_first_name = researcher_info.get('first_name', researcher_info.get('prenom', ''))
                        original_last_name = researcher_info.get('last_name', researcher_info.get('nom', ''))
                        original_email = researcher_info.get('email', '')
                        original_affiliation = researcher_info.get('affiliation', researcher_info.get('affiliations', ''))
                        original_country = researcher_info.get('country', '')
                        
                        return ResearcherInfoTable(
                            orcid_id="",
                            first_name=original_first_name,
                            last_name=original_last_name,
                            email=original_email,
                            country=original_country,
                            affiliation=original_affiliation,
                            main_research_area="",
                            specific_research_area=""
                        )
                
                # Step 4: Extract works and research areas
                if best_result and hasattr(best_result, 'orcid_id') and best_result.orcid_id:
                    print(f"Extracting works for ORCID ID: {best_result.orcid_id}")
                    
                    try:
                        works_result = await Runner.run(
                            works_extract_agent,
                            [{
                                "type": "message",
                                "role": "user",
                                "content": json.dumps({
                                    "orcid_id": best_result.orcid_id,
                                    "first_name": best_result.first_name,
                                    "last_name": best_result.last_name,
                                    "email": best_result.email,
                                    "country": best_result.country,
                                    "affiliation": best_result.affiliation
                                })
                            }]
                        )
                        
                        # Handle different response formats
                        if hasattr(works_result, 'final_output'):
                            works_output = works_result.final_output
                        else:
                            works_output = works_result
                        
                        # Parse the works result
                        if isinstance(works_output, str):
                            try:
                                parsed_works = safe_json_loads(works_output)
                                if isinstance(parsed_works, dict):
                                    # Update best_result with research areas
                                    if "main_research_area" in parsed_works:
                                        best_result.main_research_area = parsed_works["main_research_area"]
                                    if "specific_research_area" in parsed_works:
                                        best_result.specific_research_area = parsed_works["specific_research_area"]
                            except Exception as e:
                                print(f"Error parsing works result: {e}")
                        else:
                            # For OpenAI models, works_output should be an object
                            if hasattr(works_output, 'main_research_area'):
                                best_result.main_research_area = works_output.main_research_area
                            if hasattr(works_output, 'specific_research_area'):
                                best_result.specific_research_area = works_output.specific_research_area         
                    except Exception as e:
                        print(f"Error extracting works: {e}")

                print(f"Successfully processed - ORCID ID: {best_result.orcid_id if hasattr(best_result, 'orcid_id') else 'None'}")
                result_obj = ResearcherInfoTable(
                    orcid_id=best_result.orcid_id if hasattr(best_result, 'orcid_id') else None,
                    first_name=best_result.first_name if hasattr(best_result, 'first_name') else None,
                    last_name=best_result.last_name if hasattr(best_result, 'last_name') else None,
                    email=best_result.email if hasattr(best_result, 'email') else None,
                    country=best_result.country if hasattr(best_result, 'country') else None,
                    affiliation=best_result.affiliation if hasattr(best_result, 'affiliation') else None,
                    main_research_area=best_result.main_research_area if hasattr(best_result, 'main_research_area') else None,
                    specific_research_area=best_result.specific_research_area if hasattr(best_result, 'specific_research_area') else None
                )
                
                print(f"✅ Found researcher: {result_obj.model_dump()}")
                return result_obj
                
            except Exception as e:
                print(f"Error in result picking: {e}")
                # Return empty result on error
                original_first_name = researcher_info.get('first_name', researcher_info.get('prenom', ''))
                original_last_name = researcher_info.get('last_name', researcher_info.get('nom', ''))
                original_email = researcher_info.get('email', '')
                original_affiliation = researcher_info.get('affiliation', researcher_info.get('affiliations', ''))
                original_country = researcher_info.get('country', '')
                
                return ResearcherInfoTable(
                    orcid_id="",
                    first_name=original_first_name,
                    last_name=original_last_name,
                    email=original_email,
                    country=original_country,
                    affiliation=original_affiliation,
                    main_research_area="",
                    specific_research_area=""
                )                   
                
    except Exception as e:
        print(f"❌ ORCID search failed: {str(e)}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"ORCID search failed: {str(e)}")



# @router.post("/search-individual")
# async def search_individual_orcid(request: dict):
#     """Search for individual researcher ORCID using direct ORCID API"""
#     try:
        
#         researcher = request.get("researcher", {})
#         nom = researcher.get("nom", "").strip()
#         prenom = researcher.get("prenom", "").strip()
#         affiliation = researcher.get("affiliation", "").strip()
#         model_name = request.get("model_name")  # Not used in this endpoint but kept for consistency
        
#         if not nom or not prenom:
#             return {
#                 "orcid_id": None,
#                 "match_details": {
#                     "confidence": "low",
#                     "reasons": [],
#                     "doubts": ["Missing required name information"]
#                 }
#             }
        
#         # Search using ORCID expanded search API
#         search_url = "https://pub.orcid.org/v3.0/expanded-search"
#         query = f"given-names:{prenom}+AND+family-name:{nom}"
        
#         headers = {
#             "Accept": "application/json",
#             "User-Agent": "Research-Database-Manager/1.0"
#         }
        
#         search_response = requests.get(
#             f"{search_url}?q={query}",
#             headers=headers,
#             timeout=10
#         )
        
#         if search_response.status_code != 200:
#             return {
#                 "orcid_id": None,
#                 "match_details": {
#                     "confidence": "low",
#                     "reasons": [],
#                     "doubts": [f"ORCID search failed: {search_response.status_code}"]
#                 }
#             }
        
#         search_data = search_response.json()
#         expanded_results = search_data.get("expanded-result", [])
        
#         if not expanded_results:
#             return {
#                 "orcid_id": None,
#                 "match_details": {
#                     "confidence": "low",
#                     "reasons": [],
#                     "doubts": ["No ORCID profiles found for this name"]
#                 }
#             }
        
#         # Find best match
#         best_match = None
#         best_confidence = 0
#         match_reasons = []
#         doubt_reasons = []
        
#         for result in expanded_results:
#             confidence = 0
#             reasons = []
#             doubts = []
            
#             # Name matching
#             result_given = result.get("given-names", "").lower()
#             result_family = result.get("family-names", "").lower()
            
#             if result_given == prenom.lower() and result_family == nom.lower():
#                 confidence += 40
#                 reasons.append("Exact name match")
#             elif result_given == prenom.lower() or result_family == nom.lower():
#                 confidence += 20
#                 reasons.append("Partial name match")
#             else:
#                 doubts.append("Name mismatch")
            
#             # Institution matching from search results
#             if affiliation:
#                 institution_names = result.get("institution-name", [])
#                 affiliation_lower = affiliation.lower()
                
#                 institution_match = False
#                 for inst_name in institution_names:
#                     if inst_name and affiliation_lower in inst_name.lower():
#                         confidence += 30
#                         reasons.append(f"Institution match: {inst_name}")
#                         institution_match = True
#                         break
                
#                 if not institution_match and institution_names:
#                     # Check for partial matches
#                     for inst_name in institution_names:
#                         if inst_name:
#                             # Check if any word from affiliation is in institution name
#                             affiliation_words = affiliation_lower.split()
#                             inst_words = inst_name.lower().split()
#                             common_words = set(affiliation_words) & set(inst_words)
#                             if common_words and len(common_words) > 0:
#                                 confidence += 15
#                                 reasons.append(f"Partial institution match: {inst_name}")
#                                 break
                
#                 if not institution_match:
#                     doubts.append("No institution match found")
            
#             # Update best match
#             if confidence > best_confidence:
#                 best_confidence = confidence
#                 best_match = result
#                 match_reasons = reasons
#                 doubt_reasons = doubts
        
#         # Determine confidence level
#         if best_confidence >= 70:
#             confidence_level = "high"
#         elif best_confidence >= 40:
#             confidence_level = "medium"
#         else:
#             confidence_level = "low"
        
#         if best_match:
#             orcid_id = best_match.get("orcid-id")
#             return {
#                 "orcid_id": orcid_id,
#                 "match_details": {
#                     "confidence": confidence_level,
#                     "score": best_confidence,
#                     "reasons": match_reasons,
#                     "doubts": doubt_reasons
#                 }
#             }
#         else:
#             return {
#                 "orcid_id": None,
#                 "match_details": {
#                     "confidence": "low",
#                     "reasons": [],
#                     "doubts": ["No suitable match found"]
#                 }
#             }
            
#     except requests.RequestException as e:
#         return {
#             "orcid_id": None,
#             "match_details": {
#                 "confidence": "low",
#                 "reasons": [],
#                 "doubts": [f"API connection error: {str(e)}"]
#             }
#         }
#     except Exception as e:
#         return {
#             "orcid_id": None,
#             "match_details": {
#                 "confidence": "low",
#                 "reasons": [],
#                 "doubts": [f"Search error: {str(e)}"]
#             }
#         }


@router.get("/profile/{orcid_id}")
async def get_orcid_profile(orcid_id: str, include_works: bool = True, works_limit: int = 10):
    """Get detailed ORCID profile using direct ORCID API"""
    try:
        print(f"Starting ORCID profile request for: {orcid_id}")
        
        # Base URLs for ORCID public API
        profile_url = f"https://pub.orcid.org/v3.0/{orcid_id}"
        person_url = f"https://pub.orcid.org/v3.0/{orcid_id}/person"  # New endpoint for personal info
        works_url = f"https://pub.orcid.org/v3.0/{orcid_id}/works"
        
        headers = {
            "Accept": "application/json",
            "User-Agent": "Research-Database-Manager/1.0"
        }
        
        print(f"🌐 Fetching profile from: {profile_url}")
        
        # Get basic profile
        profile_response = requests.get(profile_url, headers=headers, timeout=10)
        if profile_response.status_code != 200:
            print(f"Profile request failed: {profile_response.status_code}")
            raise HTTPException(
                status_code=profile_response.status_code,
                detail=f"Failed to fetch ORCID profile: {profile_response.text}"
            )
        
        profile_data = profile_response.json()
        print(f"Profile data retrieved successfully")
        
        # Get personal information (external IDs, researcher URLs, etc.)
        print(f"🌐 Fetching person data from: {person_url}")
        person_response = requests.get(person_url, headers=headers, timeout=10)
        person_data = person_response.json() if person_response.status_code == 200 else {}
        print(f"Person data retrieved: {len(person_data)} keys")
        
        # Get works if requested
        works_data = None
        if include_works:
            print(f"🌐 Fetching works from: {works_url}")
            works_response = requests.get(works_url, headers=headers, timeout=10)
            if works_response.status_code == 200:
                works_data = works_response.json()
                print(f"Works data retrieved")
            else:
                print(f"Works request failed: {works_response.status_code}")
        
        print("Extracting structured profile data...")
        # Extract structured information including external links
        try:
            structured_data = extract_structured_profile_data(profile_data, works_data, works_limit)
            print(f"Structured data extracted: {list(structured_data.keys())}")
        except Exception as e:
            print(f"Error in extract_structured_profile_data: {e}")
            raise e
        
        print("🔄 Extracting external links...")
        try:
            external_links = extract_external_links(person_data)
            print(f"External links extracted: {list(external_links.keys())}")
            structured_data.update(external_links)
        except Exception as e:
            print(f"Error in extract_external_links: {e}")
            # Don't fail the whole request if external links fail
            print("Continuing without external links")
        
        result = {
            "orcid_id": orcid_id,
            "profile": profile_data,
            "person_details": person_data,
            "works": works_data,
            "structured_data": structured_data
        }
        
        print(f"🎉 ORCID profile request completed successfully")
        return result
        
    except requests.RequestException as e:
        print(f"Request error: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Failed to connect to ORCID API: {str(e)}"
        )
    except Exception as e:
        print(f"Internal error: {e}")
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )
