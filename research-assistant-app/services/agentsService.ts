import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_DATA_MANAGEMENT_API_URL || 'http://localhost:8080/api';

// Types
export interface LLMConfig {
  model_name: string;
  api_key: string;
  provider: string;
}

export interface DatabaseConnection {
  id: string;
  name: string;
  host: string;
  port: number;
  dbname: string;
  user: string;
  dbtype: string;
  schema?: string;
  status: string;
  created_at: string;
  last_tested?: string;
}

export interface DatabaseConnectionRequest {
  id?: string; // Optional - backend will assign the ID
  name: string;
  host: string;
  port: number;
  dbname: string;
  user: string;
  password: string;
  dbtype: string;
  schema?: string;
}

export interface DatabaseSchema {
  db_id: string;
  db_type: string;
  schema: Record<string, any>;
  tool_used: string;
}

export interface TableSelectionRequest {
  db_id: string;
  table_name: string;
  columns: string[];
  conditions?: Record<string, string>;
  limit?: number;
}

export interface ORCIDSearchRequest {
  db_id: string;
  table_name: string;
  selected_columns: string[];
  limit: number;
  confidence_threshold: number;
  llm_config?: LLMConfig;
}

export interface ORCIDIndividualSearchRequest {
  first_name: string;
  last_name: string;
  email?: string;
  affiliation?: string;
  country?: string;
  llm_config?: LLMConfig;
}

export interface ORCIDProfileRequest {
  orcid_id: string;
  include_works?: boolean;
  works_limit?: number;
  llm_config?: LLMConfig;
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

export interface ChatRequest {
  message: string;
  history: [string, string][];
  llm_config?: LLMConfig;
}

export interface ChatResponse {
  response: string;
  status: string;
}

// Database Management
export const databaseService = {
  // Add new database connection
  async addDatabase(connection: DatabaseConnectionRequest): Promise<DatabaseConnection> {
    const response = await axios.post(`${API_BASE_URL}/databases`, connection);
    return response.data;
  },

  // Get all database connections
  async getDatabases(): Promise<DatabaseConnection[]> {
    const response = await axios.get(`${API_BASE_URL}/databases`);
    return response.data;
  },

  // Delete database connection
  async deleteDatabase(dbId: string): Promise<{ message: string; deleted_database_id: string }> {
    const response = await axios.delete(`${API_BASE_URL}/databases/${dbId}`);
    return response.data;
  },

  // Get database schema
  async getDatabaseSchema(dbId: string): Promise<DatabaseSchema> {
    const response = await axios.get(`${API_BASE_URL}/databases/${dbId}/schema`);
    return response.data;
  },

  // Query database table
  async queryTable(request: TableSelectionRequest): Promise<any> {
    const response = await axios.post(`${API_BASE_URL}/databases/query`, request);
    return response.data;
  }
};

// ORCID Search
export const orcidService = {
  // Search for individual researcher
  async searchIndividual(request: ORCIDIndividualSearchRequest): Promise<any> {
    const response = await axios.post(`${API_BASE_URL}/orcid/search-individual`, request);
    return response.data;
  },

  // Search from database table
  async searchFromTable(request: ORCIDSearchRequest): Promise<{ task_id: string; status: string; message: string }> {
    const response = await axios.post(`${API_BASE_URL}/orcid/table-search`, request);
    return response.data;
  },

  // Get ORCID profile
  async getProfile(orcidId: string, includeWorks: boolean = true, worksLimit: number = 10): Promise<any> {
    const response = await axios.get(`${API_BASE_URL}/orcid/profile/${orcidId}`, {
      params: { include_works: includeWorks, works_limit: worksLimit }
    });
    return response.data;
  }
};

// Task Management
export const taskService = {
  // Get task status
  async getTaskStatus(taskId: string): Promise<TaskStatus> {
    const response = await axios.get(`${API_BASE_URL}/tasks/${taskId}`);
    return response.data;
  },

  // List all tasks
  async listTasks(): Promise<{ tasks: TaskStatus[]; total: number }> {
    const response = await axios.get(`${API_BASE_URL}/tasks`);
    return response.data;
  },

  // Delete task
  async deleteTask(taskId: string): Promise<{ message: string }> {
    const response = await axios.delete(`${API_BASE_URL}/tasks/${taskId}`);
    return response.data;
  },

  // Poll task status with timeout
  async pollTaskStatus(taskId: string, timeout: number = 300000): Promise<TaskStatus> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const status = await this.getTaskStatus(taskId);
      
      if (status.status === 'completed' || status.status === 'failed') {
        return status;
      }
      
      // Wait 2 seconds before next poll
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    throw new Error(`Task polling timeout after ${timeout}ms`);
  }
};

// Chat
export const chatService = {
  // Send chat message
  async sendMessage(request: ChatRequest): Promise<ChatResponse> {
    const response = await axios.post(`${API_BASE_URL}/chat`, request);
    return response.data;
  }
};

// System
export const systemService = {
  // Health check
  async healthCheck(): Promise<any> {
    const response = await axios.get(`${API_BASE_URL}/health`);
    return response.data;
  },

  // System info
  async getSystemInfo(): Promise<any> {
    const response = await axios.get(`${API_BASE_URL}/system/info`);
    return response.data;
  }
};

// Utility functions
export const agentsUtils = {
  // Create default LLM config
  createDefaultLLMConfig(): LLMConfig {
    return {
      model_name: 'o4-mini',
      api_key: process.env.NEXT_PUBLIC_OPENAI_API_KEY || '',
      provider: 'litellm'
    };
  },

  // Validate LLM config
  validateLLMConfig(config: LLMConfig): boolean {
    return !!(config.model_name && config.api_key);
  },

  // Format database connection for display
  formatDatabaseName(connection: DatabaseConnection): string {
    return `${connection.name} (${connection.dbtype}://${connection.host}:${connection.port}/${connection.dbname})`;
  },

  // Extract table names from schema
  extractTableNames(schema: DatabaseSchema): string[] {
    if (!schema.schema || typeof schema.schema !== 'object') {
      return [];
    }
    
    return Object.keys(schema.schema).filter(key => !key.startsWith('_'));
  },

  // Extract column names from table schema
  extractColumnNames(schema: DatabaseSchema, tableName: string): string[] {
    if (!schema.schema || !schema.schema[tableName]) {
      return [];
    }
    
    const tableSchema = schema.schema[tableName];
    if (typeof tableSchema === 'object') {
      return Object.keys(tableSchema).filter(key => !key.startsWith('_'));
    }
    
    return [];
  }
};

export default {
  databaseService,
  orcidService,
  taskService,
  chatService,
  systemService,
  agentsUtils
}; 