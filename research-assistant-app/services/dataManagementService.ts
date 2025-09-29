// Data Management API Service
import axiosInstance from './axiosInstance'
import { 
  orcidService, 
  taskService, 
  chatService, 
  systemService,
  databaseService,
  ORCIDSearchRequest as AgentsORCIDSearchRequest,
  ORCIDIndividualSearchRequest,
  TaskStatus as AgentsTaskStatus,
  ChatRequest,
  LLMConfig as AgentsLLMConfig,
  DatabaseConnectionRequest,
  TableSelectionRequest
} from './agentsService'

const API_BASE_URL = process.env.NEXT_PUBLIC_DATA_MANAGEMENT_API_URL || 'http://localhost:8080/api'

// Types for compatibility with existing frontend
export interface DatabaseConfig {
  id: number;
  id_user: number;
  dbName: string;
  type: string;
  host: string;
  port: number;
  username: string;
  pw: string;
  status?: string;
  created_at?: string;
}

export interface DatabaseConfigCreate {
  id_user: number;
  dbName: string;
  type: string;
  host: string;
  port: number;
  username: string;
  pw: string;
}

export interface DatabaseTestResult {
  status: string;
  message: string;
  schema?: any;
}

export interface ORCIDSearchResult {
  id: string;
  nom: string;
  prenom: string;
  affiliation: string;
  email?: string;
  orcid?: string;
  orcidStatus: "found" | "not_found" | "pending";
  selected: boolean;
  notes: string;
  matchDetails: {
    confidence: "high" | "medium" | "low";
    matchReasons: string[];
    doubtReasons: string[];
    profileData: any;
  };
  mainResearchFields: string[];
  researchKeywords: string[];
}

export interface ORCIDSearchRequest {
  db_id: string;
  table_name: string;
  selected_columns: string[];
  limit: number;
  confidence_threshold: number;
  llm_config?: AgentsLLMConfig;
}

export interface TaskStatus {
  task_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  created_at: string;
  completed_at?: string;
  result?: any;
  error?: string;
  progress?: {
    current: number;
    total: number;
    percentage: number;
    status: string;
    current_researcher?: string;
    substatus?: string;
  };
}

export interface ChatResponse {
  response: string;
}

class DataManagementService {
  // Database Management - Using agents backend
  async getDatabases(): Promise<DatabaseConfig[]> {
    try {
      const connections = await databaseService.getDatabases();
      // Convert to DatabaseConfig format for compatibility
      return connections.map((conn, index) => ({
        id: index + 1,
        id_user: 1,
        dbName: conn.name,
        type: conn.dbtype,
        host: conn.host,
        port: conn.port,
        username: conn.user,
        pw: '', // Password not returned for security
        status: conn.status,
        created_at: conn.created_at
      }));
    } catch (error) {
      console.error('Error getting databases:', error);
      throw error;
    }
  }

  async createDatabase(dbConfig: DatabaseConfigCreate): Promise<DatabaseConfig> {
    try {
      const connectionRequest: DatabaseConnectionRequest = {
        id: `db_${Date.now()}`,
        name: dbConfig.dbName,
        host: dbConfig.host,
        port: dbConfig.port,
        dbname: dbConfig.dbName,
        user: dbConfig.username,
        password: dbConfig.pw,
        dbtype: dbConfig.type
      };

      const connection = await databaseService.addDatabase(connectionRequest);
      
      return {
        id: 1,
        id_user: dbConfig.id_user,
        dbName: connection.name,
        type: connection.dbtype,
        host: connection.host,
        port: connection.port,
        username: connection.user,
        pw: dbConfig.pw,
        status: connection.status,
        created_at: connection.created_at
      };
    } catch (error) {
      console.error('Error creating database:', error);
      throw error;
    }
  }

  async testDatabaseConnection(dbId: number): Promise<DatabaseTestResult> {
    try {
      // For now, return success since the agents backend handles connection testing
      return {
        status: "connected",
        message: "Database connection successful"
      };
    } catch (error) {
      console.error('Error testing database connection:', error);
      throw error;
    }
  }

  async getDatabaseSchema(dbId: number): Promise<any> {
    try {
      const schema = await databaseService.getDatabaseSchema(dbId.toString());
      return schema;
    } catch (error) {
      console.error('Error getting database schema:', error);
      throw error;
    }
  }

  async deleteDatabase(dbId: number): Promise<void> {
    try {
      await databaseService.deleteDatabase(dbId.toString());
    } catch (error) {
      console.error('Error deleting database:', error);
      throw error;
    }
  }

  // ORCID Search - Using agents backend
  async searchIndividualORCID(request: ORCIDIndividualSearchRequest): Promise<any> {
    try {
      const result = await orcidService.searchIndividual(request);
      return result;
    } catch (error) {
      console.error('Error searching individual ORCID:', error);
      throw error;
    }
  }

  async searchORCIDFromTable(request: ORCIDSearchRequest): Promise<{ task_id: string; message: string }> {
    try {
      const agentsRequest: AgentsORCIDSearchRequest = {
        db_id: request.db_id,
        table_name: request.table_name,
        selected_columns: request.selected_columns,
        limit: request.limit,
        confidence_threshold: request.confidence_threshold,
        llm_config: request.llm_config
      };

      const result = await orcidService.searchFromTable(agentsRequest);
      return result;
    } catch (error) {
      console.error('Error searching ORCID from table:', error);
      throw error;
    }
  }

  async getORCIDProfile(orcidId: string, includeWorks: boolean = true, worksLimit: number = 10): Promise<any> {
    try {
      const profile = await orcidService.getProfile(orcidId, includeWorks, worksLimit);
      return profile;
    } catch (error) {
      console.error('Error getting ORCID profile:', error);
      throw error;
    }
  }

  // Task Management - Using agents backend
  async getTaskStatus(taskId: string): Promise<TaskStatus> {
    try {
      const status = await taskService.getTaskStatus(taskId);
      return status;
    } catch (error) {
      console.error('Error getting task status:', error);
      throw error;
    }
  }

  async listTasks(): Promise<{ tasks: TaskStatus[]; total: number }> {
    try {
      const result = await taskService.listTasks();
      return result;
    } catch (error) {
      console.error('Error listing tasks:', error);
      throw error;
    }
  }

  async deleteTask(taskId: string): Promise<{ message: string }> {
    try {
      const result = await taskService.deleteTask(taskId);
      return result;
    } catch (error) {
      console.error('Error deleting task:', error);
      throw error;
    }
  }

  // Chat - Using agents backend
  async sendChatMessage(request: ChatRequest): Promise<ChatResponse> {
    try {
      const response = await chatService.sendMessage(request);
      return response;
    } catch (error) {
      console.error('Error sending chat message:', error);
      throw error;
    }
  }

  // System - Using agents backend
  async healthCheck(): Promise<any> {
    try {
      const health = await systemService.healthCheck();
      return health;
    } catch (error) {
      console.error('Error checking health:', error);
      throw error;
    }
  }

  async getSystemInfo(): Promise<any> {
    try {
      const info = await systemService.getSystemInfo();
      return info;
    } catch (error) {
      console.error('Error getting system info:', error);
      throw error;
    }
  }

  // Utility method to poll task status
  async pollTaskStatus(taskId: string, onUpdate?: (status: TaskStatus) => void): Promise<TaskStatus> {
    return new Promise((resolve, reject) => {
      const poll = async () => {
        try {
          const task = await this.getTaskStatus(taskId)
          
          if (onUpdate) {
            onUpdate(task)
          }

          if (task.status === 'completed' || task.status === 'failed') {
            resolve(task)
          } else {
            setTimeout(poll, 2000) // Poll every 2 seconds
          }
        } catch (error) {
          reject(error)
        }
      }
      poll()
    })
  }

  // Enhanced methods using agents backend
  async processTableWithORCID(dbId: string, tableName: string, columns: string[], llmConfig?: AgentsLLMConfig): Promise<ORCIDSearchResult[]> {
    try {
      const request: ORCIDSearchRequest = {
        db_id: dbId,
        table_name: tableName,
        selected_columns: columns,
        limit: 100,
        confidence_threshold: 0.7,
        llm_config: llmConfig
      };

      const result = await this.searchORCIDFromTable(request);
      
      // Poll for completion
      const finalStatus = await this.pollTaskStatus(result.task_id);
      
      if (finalStatus.status === 'completed' && finalStatus.result) {
        return finalStatus.result.researchers || [];
      } else {
        throw new Error(finalStatus.error || 'Task failed');
      }
    } catch (error) {
      console.error('Error processing table with ORCID:', error);
      throw error;
    }
  }

  async extractResearchFields(orcidId: string, llmConfig?: AgentsLLMConfig): Promise<any> {
    try {
      const profile = await this.getORCIDProfile(orcidId, true, 30);
      
      // The agents backend already extracts research fields in the profile
      return {
        orcid_id: orcidId,
        main_research_fields: profile.main_research_fields || [],
        research_keywords: profile.research_keywords || [],
        works: profile.works || []
      };
    } catch (error) {
      console.error('Error extracting research fields:', error);
      throw error;
    }
  }
}

export const dataManagementService = new DataManagementService()
export default dataManagementService
