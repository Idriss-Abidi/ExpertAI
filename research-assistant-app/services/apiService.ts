import axiosInstance from "./axiosInstance";

export interface Api {
  id: number;
  id_user: number;
  openai_apikey?: string;
  gemini_apikey?: string;
  claude_apikey?: string;
  deepseek_apikey?: string;
  scopus_apikey?: string;
}

export interface ApiCreate {
  id_user: number;
  openai_apikey?: string;
  gemini_apikey?: string;
  claude_apikey?: string;
  deepseek_apikey?: string;
  scopus_apikey?: string;
}

export const getApis = async (): Promise<Api[]> => {
  const res = await axiosInstance.get<Api[]>("/apis");
  return res.data;
};

export const createApi = async (api: ApiCreate): Promise<Api> => {
  const res = await axiosInstance.post<Api>("/apis", api);
  return res.data;
};

export const getApi = async (id: number): Promise<Api> => {
  const res = await axiosInstance.get<Api>(`/apis/${id}`);
  return res.data;
};