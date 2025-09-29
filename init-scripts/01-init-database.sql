-- Initialize the research database with required tables and data
-- This script runs when the PostgreSQL container starts for the first time

-- Create extensions if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create database if not exists (this is handled by POSTGRES_DB environment variable)
-- The research_db database is automatically created

-- Grant permissions (if needed for specific users)
-- GRANT ALL PRIVILEGES ON DATABASE research_db TO postgres;

-- You can add initial table creation scripts here if needed
-- The actual table creation will be handled by the backend applications

-- Example: Create a simple health check table
CREATE TABLE IF NOT EXISTS health_check (
    id SERIAL PRIMARY KEY,
    service_name VARCHAR(100) NOT NULL,
    last_check TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'healthy'
);

-- Insert initial health check record
INSERT INTO health_check (service_name, status) 
VALUES ('database', 'initialized') 
ON CONFLICT DO NOTHING;
