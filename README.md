# ExpertAI Research Assistant

A comprehensive research assistant application that combines multiple AI services with a modern web interface to help researchers manage, analyze, and discover academic content.

## 🏗️ Architecture

This project consists of multiple interconnected services:

- **Frontend**: Next.js-based research assistant web application
- **Backend v2**: FastAPI-based API for user management and research operations
- **Data Management API**: Organized data management and agent services
- **MCP Servers**: Multi-database and ORCID integration services
- **PostgreSQL**: Database for storing research data and user information

## 📋 Prerequisites

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

## 🚀 Quick Start

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
```

### 4. Wait for Services to Start

The services will start in the following order with health checks:
1. PostgreSQL Database
2. MCP Servers (Multi-DB and ORCID)
3. Backend APIs
4. Frontend Application

**Note**: Initial startup may take 2-5 minutes as services wait for dependencies to be ready.

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

## 🛠️ Development

### Environment Configuration

The project uses different environment configurations:

- **Docker Environment**: Configured via `docker.env` files in each service
- **Local Development**: Use `.env.example` as a template for local `.env` files

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

### Making Changes

1. **Frontend Development**:
   ```bash
   cd research-assistant-app
   npm install
   npm run dev
   ```

2. **Backend Development**:
   ```bash
   cd backend_v2
   pip install -r requirements.txt
   uvicorn main:app --reload
   ```

## 🔧 Troubleshooting

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

### Useful Commands

```bash
# Restart all services
docker-compose restart

# Rebuild specific service
docker-compose build [service-name]

# Stop all services
docker-compose down

# Stop and remove volumes (reset database)
docker-compose down -v

# View real-time logs
docker-compose logs -f

# Check resource usage
docker stats
```

## 🔒 Security Notes

- Default database credentials are used for development
- Change passwords and secrets for production deployment
- API keys and sensitive configuration should be set via environment variables

## 📚 API Documentation

Once the services are running:

- **Backend v2 API Docs**: http://localhost:8020/docs
- **Data Management API Docs**: http://localhost:8080/docs

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test with `docker-compose build && docker-compose up -d`
5. Submit a pull request

## 📝 License

This project is licensed under the MIT License.

## 🆘 Support

If you encounter issues:

1. Check the troubleshooting section above
2. Review service logs: `docker-compose logs [service-name]`
3. Open an issue on the GitHub repository

---

**Happy Researching! 🔬**
