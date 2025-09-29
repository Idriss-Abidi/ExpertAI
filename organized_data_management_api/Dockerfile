FROM python:3.11-slim

WORKDIR /app

# Install system dependencies including build tools for C++ compilation
RUN apt-get update && apt-get install -y \
    curl \
    build-essential \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY app/ ./app/
COPY main.py .

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Set environment variables
ENV PYTHONPATH=/app

# Run the organized data management API
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
