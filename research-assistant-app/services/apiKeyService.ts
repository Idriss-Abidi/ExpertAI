import axiosInstance from './axiosInstance'

export interface ApiKeys {
  id?: number
  utilisateur_id: number
  cle_openai?: string
  cle_gemini?: string
  cle_claude?: string
  cle_deepseek?: string
  cle_scopus?: string
}

export interface ApiKeyUpdate {
  cle_openai?: string
  cle_gemini?: string
  cle_claude?: string
  cle_deepseek?: string
  cle_scopus?: string
}

class ApiKeyService {
  private baseURL = '/cles-api'

  async getApiKeys(utilisateurId: number = 1): Promise<ApiKeys> {
    try {
      const response = await axiosInstance.get(`${this.baseURL}/${utilisateurId}`)
      return response.data
    } catch (error) {
      console.error('Failed to get API keys:', error)
      throw error
    }
  }

  async createApiKeys(apiKeys: ApiKeys): Promise<ApiKeys> {
    try {
      const response = await axiosInstance.post(this.baseURL, apiKeys)
      return response.data
    } catch (error) {
      console.error('Failed to create API keys:', error)
      throw error
    }
  }

  async updateApiKeys(utilisateurId: number, apiKeyUpdate: ApiKeyUpdate): Promise<ApiKeys> {
    try {
      const response = await axiosInstance.put(`${this.baseURL}/${utilisateurId}`, apiKeyUpdate)
      return response.data
    } catch (error) {
      console.error('Failed to update API keys:', error)
      throw error
    }
  }

  async updateSingleApiKey(utilisateurId: number, keyType: keyof ApiKeyUpdate, value: string): Promise<ApiKeys> {
    try {
      const updateData: ApiKeyUpdate = {}
      updateData[keyType] = value
      
      const response = await axiosInstance.put(`${this.baseURL}/${utilisateurId}`, updateData)
      return response.data
    } catch (error) {
      console.error(`Failed to update ${keyType} API key:`, error)
      throw error
    }
  }

  async deleteApiKeys(utilisateurId: number): Promise<{ message: string }> {
    try {
      const response = await axiosInstance.delete(`${this.baseURL}/${utilisateurId}`)
      return response.data
    } catch (error) {
      console.error('Failed to delete API keys:', error)
      throw error
    }
  }

  async getApiKeyForModel(modelName: string): Promise<{ api_key: string }> {
    try {
      const response = await axiosInstance.get(`${this.baseURL}/model/${modelName}`)
      return response.data
    } catch (error) {
      console.error(`Failed to get API key for model ${modelName}:`, error)
      throw error
    }
  }

  // Helper method to check if API keys exist
  async hasApiKeys(utilisateurId: number = 1): Promise<boolean> {
    try {
      const apiKeys = await this.getApiKeys(utilisateurId)
      return !!(apiKeys.cle_openai || apiKeys.cle_gemini || apiKeys.cle_claude || apiKeys.cle_deepseek || apiKeys.cle_scopus)
    } catch (error) {
      console.error('Failed to check API keys existence:', error)
      return false
    }
  }
}

const apiKeyService = new ApiKeyService()
export default apiKeyService
