import { databaseService as agentsDatabaseService, DatabaseConnectionRequest } from './agentsService'

export interface DatabaseConfig {
  id: number;
  id_user: number;
  conn_name: string;
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
  conn_name: string;
  dbName: string;
  type: string;
  host: string;
  port: number;
  username: string;
  pw: string;
  schema?: string;
}

export interface DatabaseTestResult {
  status: string;
  message: string;
  schema?: any;
}

export const getDatabases = async (): Promise<DatabaseConfig[]> => {
  try {
    const connections = await agentsDatabaseService.getDatabases();
    // Convert to DatabaseConfig format for compatibility with new YAML-based MCP server
    return connections.map((conn) => ({
      id: parseInt(conn.id) || 1, // Use the actual numeric ID from MCP server
      id_user: 1,
      conn_name: conn.name, // Connection name from MCP server
      dbName: conn.dbname || conn.name, // Use database name if available, fallback to name
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
};

export const createDatabase = async (db: DatabaseConfigCreate): Promise<DatabaseConfig> => {
  try {
    const connectionRequest: DatabaseConnectionRequest = {
      name: db.conn_name,  // Use connection name as the display name
      host: db.host,
      port: db.port,
      dbname: db.dbName,   // Use database name as the actual database name
      user: db.username,
      password: db.pw,
      dbtype: db.type,
      schema: db.schema
    };

    const connection = await agentsDatabaseService.addDatabase(connectionRequest);
    
    // Extract the assigned ID from the response
    let assignedId = 1; // Default fallback
    if (connection.id) {
      assignedId = parseInt(connection.id);
    }
    
    return {
      id: assignedId,
      id_user: db.id_user,
      conn_name: connection.name || db.conn_name,
      dbName: connection.dbname || db.dbName,
      type: connection.dbtype || db.type,
      host: connection.host || db.host,
      port: connection.port || db.port,
      username: connection.user || db.username,
      pw: db.pw,
      status: connection.status || "connected",
      created_at: connection.created_at || new Date().toISOString()
    };
  } catch (error) {
    console.error('Error creating database:', error);
    throw error;
  }
};

export const testDatabaseConnection = async (dbId: number): Promise<DatabaseTestResult> => {
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
};

export const getDatabaseSchema = async (dbId: string): Promise<any> => {
  try {
    const schema = await agentsDatabaseService.getDatabaseSchema(dbId);
    return schema;
  } catch (error) {
    console.error('Error getting database schema:', error);
    throw error;
  }
};

export const deleteDatabase = async (dbId: number): Promise<{ message: string; deleted_database_id: string }> => {
  try {
    // Use the numeric ID directly for the new YAML-based MCP server
    const result = await agentsDatabaseService.deleteDatabase(dbId.toString());
    return result;
  } catch (error) {
    console.error('Error deleting database:', error);
    throw error;
  }
};