// Service for the RAG-based researcher similarity API
export interface SimilarityQuery {
  title: string;
  description: string;
  top_k?: number;
  similarity_threshold?: number;
}

export interface ResearcherMatch {
  id: number;
  nom: string;
  prenom: string;
  affiliation?: string;
  orcid_id?: string;
  domaines_recherche?: string;
  mots_cles_specifiques?: string;
  similarity_score: number;
  matched_content: string;
}

export interface DetailedResearcherMatch extends ResearcherMatch {
  domain_similarity: number;
  keywords_similarity: number;
  best_match_type: 'domains' | 'keywords';
}

export interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  database: string;
  ollama: string;
  vector_store: string;
  documents_count: number;
  error?: string;
}

export interface SystemStats {
  total_researchers: number;
  embedding_model: string;
  vector_store_type: string;
  retriever_type: string;
}

class SimilarityService {
  private baseUrl: string;
  
  constructor() {
    // Get the API URL from environment or use default
    const apiUrl = 'http://localhost:8020/api/v1'; // Direct URL for now
    this.baseUrl = `${apiUrl}/similarity`;
    console.log('🔧 SimilarityService initialized with baseUrl:', this.baseUrl);
  }

  async searchResearchers(query: SimilarityQuery): Promise<ResearcherMatch[]> {
    const response = await fetch(`${this.baseUrl}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(query)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    return response.json();
  }

  async detailedSearch(query: SimilarityQuery): Promise<DetailedResearcherMatch[]> {
    console.log('🔍 DetailedSearch called with query:', query);
    console.log('🌐 Making request to:', `${this.baseUrl}/search/detailed`);
    
    const response = await fetch(`${this.baseUrl}/search/detailed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(query)
    });
    
    console.log('📡 DetailedSearch response status:', response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ DetailedSearch failed:', errorText);
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    console.log('✅ DetailedSearch successful, found researchers:', result?.length || 0);
    return result;
  }

  async checkHealth(): Promise<HealthStatus> {
    console.log('🏥 Checking health at URL:', `${this.baseUrl}/health`);
    const response = await fetch(`${this.baseUrl}/health`);
    console.log('🏥 Health check response status:', response.status, response.statusText);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Health check failed:', errorText);
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    console.log('✅ Health check successful:', result);
    return result;
  }

  async getStats(): Promise<SystemStats> {
    const response = await fetch(`${this.baseUrl}/stats`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    return response.json();
  }

  async refreshData(): Promise<{ message: string }> {
    const response = await fetch(`${this.baseUrl}/refresh`, {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    return response.json();
  }

  // Helper method to check if the service is available
  async isAvailable(): Promise<boolean> {
    try {
      await this.checkHealth();
      return true;
    } catch (error) {
      console.warn('Similarity service not available:', error);
      return false;
    }
  }
}

export const similarityService = new SimilarityService();
