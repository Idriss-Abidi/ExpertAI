/**
 * Assistant service for handling chat and assistant-related API calls
 */

export interface Message {
  id: string;
  content: string;
  sender: "user" | "assistant";
  timestamp: Date;
}

export interface ChatRequest {
  message: string;
  model_name: string;
  history?: [string, string][];
}

export interface ChatResponse {
  response: string;
  model_name?: string;
  status: string;
  new_researchers_count?: number;
}

export interface AssistantResearcher {
  id: number;
  nom: string;
  prenom: string;
  full_name: string;
  affiliation: string;
  country?: string;
  orcid_id?: string;
  has_orcid: boolean;
  works_count: number;
  main_research_areas?: string[];
  more_specific_keywords?: string[];
  bio?: string;
  confidence_score?: string;
  search_timestamp?: string;
}

export interface ResearcherReport {
  success: boolean;
  report?: {
    metadata: {
      total_researchers: number;
      researchers_with_orcid: number;
      total_works: number;
    };
    summary: {
      institutions: string[];
    };
  };
  error?: string;
}

// Use data management API on port 8080
const DATA_MANAGEMENT_BASE_URL = process.env.NEXT_PUBLIC_DATA_MANAGEMENT_API_URL || "http://localhost:8080/api/v1";

/**
 * Send a chat message to the AI assistant
 */
export const sendChatMessage = async (request: ChatRequest): Promise<ChatResponse> => {
  const res = await fetch(`${DATA_MANAGEMENT_BASE_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`HTTP ${res.status}: ${errorText}`);
  }
  
  return res.json();
};

/**
 * Fetch researchers discovered by the assistant
 */
export const fetchAssistantResearchers = async (): Promise<{ researchers: AssistantResearcher[] }> => {
  const res = await fetch(`${DATA_MANAGEMENT_BASE_URL}/researchers`);
  
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`HTTP ${res.status}: ${errorText}`);
  }
  
  const data = await res.json();
  return { researchers: data.researchers || [] };
};

/**
 * Generate a comprehensive researchers report
 */
export const generateResearchersReport = async (options?: {
  report_type?: string;
  include_works?: boolean;
  include_affiliations?: boolean;
}): Promise<ResearcherReport> => {
  const defaultOptions = {
    report_type: "detailed",
    include_works: true,
    include_affiliations: true,
    ...options,
  };
  
  const res = await fetch(`${DATA_MANAGEMENT_BASE_URL}/researchers/report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(defaultOptions),
  });
  
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`HTTP ${res.status}: ${errorText}`);
  }
  
  return res.json();
};

/**
 * Clear chat history on the server
 */
export const clearChatHistory = async (): Promise<void> => {
  const res = await fetch(`${DATA_MANAGEMENT_BASE_URL}/chat/clear`, {
    method: "POST",
  });
  
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`HTTP ${res.status}: ${errorText}`);
  }
};

/**
 * Download a file from blob data
 */
export const downloadFileFromBlob = (data: any, filename: string, mimeType: string = "application/json"): void => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/**
 * Generate and download researchers report
 */
export const downloadResearchersReport = async (): Promise<{ success: boolean; message: Message | null }> => {
  try {
    const reportData = await generateResearchersReport();
    
    if (reportData.success && reportData.report) {
      // Generate filename with current date
      const filename = `researchers_report_${new Date().toISOString().split('T')[0]}.json`;
      
      // Download the file
      downloadFileFromBlob(reportData.report, filename);
      
      // Create message for chat
      const reportMessage: Message = {
        id: Date.now().toString(),
        content: `📊 **Researcher Report Generated**\n\n**Summary:**\n- Total researchers: ${reportData.report.metadata.total_researchers}\n- With ORCID profiles: ${reportData.report.metadata.researchers_with_orcid}\n- Total publications: ${reportData.report.metadata.total_works}\n- Institutions: ${reportData.report.summary.institutions.join(", ")}\n\nReport downloaded as JSON file.`,
        sender: "assistant",
        timestamp: new Date(),
      };
      
      return { success: true, message: reportMessage };
    } else {
      return { success: false, message: null };
    }
  } catch (error) {
    console.error("Failed to generate report:", error);
    return { success: false, message: null };
  }
};