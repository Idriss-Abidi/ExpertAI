# from mcp.server.fastmcp import FastMCP
# import requests
from fastmcp import FastMCP
import requests

mcp = FastMCP("ORCID MCP Server", stateless_http=True, host="127.0.0.1", port=8001, json_response=False)

ORCID_BASE = "https://pub.orcid.org/v3.0"
HEADERS = {"Accept": "application/json"}

@mcp.tool()
def connect_to_server(server_script_path: str) -> str:
    """
    Connect helper placeholder for LLM clients.

    Args:
        server_script_path: Path to the server script (.py or .js)

    Returns:
        Confirmation string with server identity and tools.
    """
    tools = [fn for fn in mcp._tools]  # introspection
    return f"✅ Connected to ORCID MCP Server via {server_script_path}. Tools available: {', '.join(tools)}"

@mcp.tool()
def search_orcid_researchers(keywords: str, limit: int = None, institution: str = None) -> dict:
    """
    Search ORCID API for researchers using expanded search with name-based queries.
    Supports both keyword search and name-based search.

    Args:
        keywords: comma-separated search terms (can include first_name, last_name, institution)
        limit: max number of results to return
        institution: (optional) affiliation filter

    Returns:
        {
          "researchers": [{"orcid": "...", "name": "...", "affiliation": "..."}, ...],
          "total_found": int
        }
    """
    try:
        kws = [kw.strip() for kw in keywords.split(",")]
        
        # Try to identify if this is a name-based search
        if len(kws) >= 2:
            # Assume first keyword is first name, second is last name
            first_name = kws[0]
            last_name = kws[1]
            
            # Build simple name-based query (no institution filtering)
            q = f"given-names:{first_name}+AND+family-name:{last_name}"
        else:
            # Fallback to general keyword search
            q = "+AND+".join([f"text:{kw}" for kw in kws])
        
        # Use expanded search endpoint
        url = f"{ORCID_BASE}/expanded-search/?q={q}"
        resp = requests.get(url, headers=HEADERS)
        
        if resp.status_code != 200:
            return {"researchers": [], "total_found": 0, "error": f"HTTP {resp.status_code}: {resp.text}"}
        
        data = resp.json()
        results = data.get("expanded-result", [])
        total = data.get("num-found", 0)
        
        # If no results, return empty
        if not results:
            return {"researchers": [], "total_found": total}
        
        researchers = []
        for item in results:
            orcid_id = item.get("orcid-id")
            
            # Extract name information
            given_names = item.get("given-names", "")
            family_names = item.get("family-names", "")
            name = f"{given_names} {family_names}".strip()
            
            # Extract institution information
            institution_names = item.get("institution-name", [])
            affiliation = ", ".join(institution_names) if institution_names else ""
            
            researchers.append({
                "orcid": orcid_id,
                "name": name,
                "affiliation": affiliation,
                "given_names": given_names,
                "family_names": family_names,
                "institution_names": institution_names
            })
        
        # Apply limit if specified
        if limit is not None:
            researchers = researchers[:limit]
        
        return {"researchers": researchers, "total_found": total}
        
    except Exception as e:
        return {"researchers": [], "total_found": 0, "error": f"Search error: {str(e)}"}

@mcp.tool()
def get_researcher(orcid_id: str) -> dict:
    """
    Retrieve public profile for a researcher via ORCID ID.

    Args:
        orcid_id: e.g., "0000-0001-2345-6789"
    """
    url = f"{ORCID_BASE}/{orcid_id}"
    resp = requests.get(url, headers=HEADERS)
    return resp.json() if resp.status_code == 200 else {"error": resp.text}

@mcp.tool()
def get_person_details(orcid_id: str) -> dict:
    """
    Retrieve personal information section for a researcher including external identifiers,
    researcher URLs, and other personal details.

    Args:
        orcid_id: e.g., "0000-0001-2345-6789"
        
    Returns:
        Personal information including external identifiers (Scopus ID, etc.),
        researcher URLs (LinkedIn, etc.), email, biography, keywords, and addresses
    """
    try:
        url = f"{ORCID_BASE}/{orcid_id}/person"
        resp = requests.get(url, headers=HEADERS)
        
        if resp.status_code != 200:
            return {"error": f"HTTP {resp.status_code}: {resp.text}"}
        
        data = resp.json()
        
        # Extract external identifiers (Scopus, SciProfiles, etc.)
        external_ids = []
        if "external-identifiers" in data and "external-identifier" in data["external-identifiers"]:
            for ext_id in data["external-identifiers"]["external-identifier"]:
                external_ids.append({
                    "type": ext_id.get("external-id-type"),
                    "value": ext_id.get("external-id-value"),
                    "url": ext_id.get("external-id-url", {}).get("value") if ext_id.get("external-id-url") else None
                })
        
        # Extract researcher URLs (LinkedIn, personal websites, etc.)
        researcher_urls = []
        if "researcher-urls" in data and "researcher-url" in data["researcher-urls"]:
            for url_item in data["researcher-urls"]["researcher-url"]:
                researcher_urls.append({
                    "name": url_item.get("url-name", {}).get("value") if url_item.get("url-name") else None,
                    "url": url_item.get("url", {}).get("value") if url_item.get("url") else None
                })
        
        # Extract basic personal info
        name_info = data.get("name", {})
        given_names = name_info.get("given-names", {}).get("value") if name_info.get("given-names") else ""
        family_name = name_info.get("family-name", {}).get("value") if name_info.get("family-name") else ""
        
        # Extract keywords
        keywords = []
        if "keywords" in data and "keyword" in data["keywords"]:
            for keyword in data["keywords"]["keyword"]:
                if keyword.get("content"):
                    keywords.append(keyword["content"])
        
        # Extract biography
        biography = None
        if "biography" in data and data["biography"] and "content" in data["biography"]:
            biography = data["biography"]["content"]
        
        # Extract emails (usually empty due to privacy)
        emails = []
        if "emails" in data and "email" in data["emails"]:
            for email in data["emails"]["email"]:
                if email.get("email"):
                    emails.append(email["email"])
        
        return {
            "orcid_id": orcid_id,
            "given_names": given_names,
            "family_name": family_name,
            "full_name": f"{given_names} {family_name}".strip(),
            "biography": biography,
            "keywords": keywords,
            "emails": emails,
            "external_identifiers": external_ids,
            "researcher_urls": researcher_urls,
            "raw_data": data
        }
        
    except Exception as e:
        return {"error": f"Failed to fetch person details: {str(e)}"}
        
    return resp.json() if resp.status_code == 200 else {"error": resp.text}

@mcp.tool()
def get_works(orcid_id: str, limit: int = 10) -> dict:
    """
    Fetch public works summaries for a researcher.

    Args:
        orcid_id: ORCID ID
        limit: number of works to return
    """
    url = f"{ORCID_BASE}/{orcid_id}/works"
    resp = requests.get(url, headers=HEADERS)
    if resp.status_code != 200:
        return {"works": [], "error": resp.text}
    groups = resp.json().get("group", [])
    works = []
    for g in groups[:limit]:
        w = g["work-summary"][0]
        works.append({
            "put_code": w["put-code"],
            "title": w.get("title", {}).get("title", {}).get("value"),
            "year": w.get("publication-date", {}).get("year", {}).get("value"),
        })
    return {"works": works}

@mcp.tool()
def get_work_detail(orcid_id: str, put_code: int) -> dict:
    """
    Get full metadata for a particular work.

    Args:
        orcid_id: ORCID ID
        put_code: work identifier code
    """
    url = f"{ORCID_BASE}/{orcid_id}/work/{put_code}"
    resp = requests.get(url, headers=HEADERS)
    return resp.json() if resp.status_code == 200 else {"error": resp.text}

if __name__ == "__main__":
    mcp.streamable_http_app()
    mcp.run(
        transport="streamable-http",
        host="0.0.0.0",
        port=8001,
        path="/mcp"
        # log_level="debug"
    )
