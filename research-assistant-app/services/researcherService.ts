import axiosInstance from "./axiosInstance";

export interface Researcher {
  id: number;
  nom: string;
  prenom: string;
  affiliation?: string;
  orcid_id?: string;
  domaines_recherche?: string;
  mots_cles_specifiques?: string;
}

export interface ResearcherCreate {
  nom: string;
  prenom: string;
  affiliation?: string;
  orcid_id?: string;
  domaines_recherche?: string;
  mots_cles_specifiques?: string;
}

export interface ResearcherUpdate extends ResearcherCreate {
  id: number;
}

// Use backend_v2 on port 8020
const BACKEND_V2_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8020/api/v1";

export const getResearchers = async (): Promise<Researcher[]> => {
  const res = await fetch(`${BACKEND_V2_BASE_URL}/chercheurs`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
};

export const createResearcher = async (researcher: ResearcherCreate): Promise<Researcher> => {
  const res = await fetch(`${BACKEND_V2_BASE_URL}/chercheurs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(researcher),
  });
  if (!res.ok) {
    const errorText = await res.text();
    if (res.status === 409) {
      // Handle duplicate ORCID case
      throw new Error(`Researcher with ORCID ID ${researcher.orcid_id} already exists. ${errorText}`);
    }
    throw new Error(`HTTP ${res.status}: ${errorText}`);
  }
  return res.json();
};

export const updateResearcher = async (researcher: ResearcherUpdate): Promise<Researcher> => {
  const res = await fetch(`${BACKEND_V2_BASE_URL}/chercheurs/${researcher.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(researcher),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
};

export const deleteResearcher = async (id: number): Promise<void> => {
  const res = await fetch(`${BACKEND_V2_BASE_URL}/chercheurs/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
};

export const getResearcher = async (id: number): Promise<Researcher> => {
  const res = await fetch(`${BACKEND_V2_BASE_URL}/chercheurs/${id}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
};

// Additional endpoints from backend
export const saveResearchersBulk = async (researchers: any[]): Promise<any> => {
  const res = await fetch(`${BACKEND_V2_BASE_URL}/chercheurs/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chercheurs: researchers }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
};

export const checkResearcherByOrcid = async (orcidId: string): Promise<any> => {
  const res = await fetch(`${BACKEND_V2_BASE_URL}/chercheurs/check-orcid`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orcid_id: orcidId }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
};

export const overwriteResearchers = async (researchers: any[]): Promise<any> => {
  const res = await fetch(`${BACKEND_V2_BASE_URL}/chercheurs/overwrite`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chercheurs: researchers }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
};