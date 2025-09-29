# ExpertAI Research Assistant

A comprehensive research assistant application that combines multiple AI services with a modern web interface to help researchers manage, analyze, and discover academic content.

## Architecture

This project consists of multiple interconnected services:

- **Frontend**: Next.js-based research assistant web application
- **Backend v2**: FastAPI-based API for user management and research operations
- **Data Management API**: Organized data management and agent services
- **MCP Servers**: Multi-database and ORCID integration services
- **PostgreSQL**: Database for storing research data and user information

## Prerequisites

Before running the project, make sure you have the following installed:

### Required Software

1. **Docker & Docker Compose**
   - [Download Docker Desktop](https://www.docker.com/products/docker-desktop/)
   - Ensure Docker Compose is included (comes with Docker Desktop)

2. **Ollama** (for RAG embeddings)
   - [Download Ollama](https://ollama.com/)
   - Install the embedding model:
   ```bash
   ollama pull nomic-embed-text
   ```

### System Requirements

- **RAM**: Minimum 8GB (16GB recommended for optimal performance)
- **Storage**: At least 5GB free space for Docker containers and models
- **OS**: Windows 10/11, macOS, or Linux

## Quick Start

### 1. Clone the Repository

### 2. Install Ollama and Required Models

```bash
# Install Ollama (if not already installed)
# Visit: https://ollama.com/

# Pull the required embedding model
ollama pull nomic-embed-text
```

### 3. Build and Run with Docker Compose

```bash
# Build all services (this may take several minutes on first run)
docker-compose build

# Start all services in detached mode
docker-compose up -d

# or directly
docker-compose up --build -d
```

### 4. Wait for Services to Start

The services will start in the following order with health checks:
1. PostgreSQL Database
2. MCP Servers (Multi-DB and ORCID)
3. Backend APIs
4. Frontend Application

### 5. Access the Application

Once all services are running, you can access:

- **Frontend Application**: http://localhost:3000
- **Backend v2 API**: http://localhost:8020
- **Data Management API**: http://localhost:8080
- **Multi-DB MCP Server**: http://localhost:8017
- **ORCID MCP Server**: http://localhost:8001
- **PostgreSQL Database**: localhost:5433

## 📊 Service Status

Check if all services are running properly:

```bash
# View all running containers
docker-compose ps

# Check service logs
docker-compose logs [service-name]

# Examples:
docker-compose logs frontend
docker-compose logs backend-v2
docker-compose logs postgres
```


### Service Structure

```
ExpertAI/
├── frontend/                    # Next.js research assistant app
├── backend_v2/                  # FastAPI backend service
├── organized_data_management_api/ # Data management service
├── mcp_demo/                    # MCP server implementations
├── init-scripts/                # Database initialization
└── docker-compose.yml           # Service orchestration
```

## Troubleshooting

### Common Issues

1. **Port Conflicts**
   - Check if ports 3000, 8020, 8080, 8017, 8001, or 5433 are in use
   - Stop conflicting services or modify port mappings in `docker-compose.yml`

2. **Ollama Not Found**
   - Ensure Ollama is installed and running
   - Verify the `nomic-embed-text` model is pulled: `ollama list`

3. **Database Connection Issues**
   - Wait for PostgreSQL health check to pass
   - Check logs: `docker-compose logs postgres`

4. **Service Startup Timeout**
   - Some services may take longer on slower systems
   - Check individual service logs for specific errors
