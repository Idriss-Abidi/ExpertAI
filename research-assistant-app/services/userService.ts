import axiosInstance from "./axiosInstance";

export interface User {
  id: number;
  nom: string;
  prenom: string;
  email: string;
  telephone?: string;
  est_admin: boolean;
  est_actif: boolean;
  date_creation: string;
}

export interface UserCreate {
  nom: string;
  prenom: string;
  email: string;
  mot_de_passe: string;
  telephone?: string;
  est_admin?: boolean;
  est_actif?: boolean;
}

export interface LoginRequest {
  email: string;
  mot_de_passe: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface PasswordChangeRequest {
  old_password: string;
  new_password: string;
}

export interface UserProfileUpdate {
  nom: string;
  prenom: string;
  email: string;
  telephone?: string;
}

// Authentication methods
export const login = async (credentials: LoginRequest): Promise<TokenResponse> => {
  const res = await axiosInstance.post<TokenResponse>("/auth/login", credentials);
  return res.data;
};

export const register = async (user: UserCreate): Promise<User> => {
  const res = await axiosInstance.post<User>("/auth/register", user);
  return res.data;
};

export const getCurrentUser = async (): Promise<User> => {
  const res = await axiosInstance.get<User>("/auth/me");
  return res.data;
};

// Password change
export const changePassword = async (passwordData: PasswordChangeRequest): Promise<{ message: string }> => {
  const res = await axiosInstance.post<{ message: string }>("/auth/change-password", passwordData);
  return res.data;
};

// Profile update
export const updateProfile = async (profileData: UserProfileUpdate): Promise<User> => {
  const res = await axiosInstance.patch<User>("/utilisateurs/profile", profileData);
  return res.data;
};

// User management methods
export const getUsers = async (): Promise<User[]> => {
  const res = await axiosInstance.get<User[]>("/utilisateurs");
  return res.data;
};

export const createUser = async (user: UserCreate): Promise<User> => {
  const res = await axiosInstance.post<User>("/utilisateurs", user);
  return res.data;
};

export const getUser = async (id: number): Promise<User> => {
  const res = await axiosInstance.get<User>(`/utilisateurs/${id}`);
  return res.data;
};

// Admin functions
export const toggleUserStatus = async (userId: number, est_actif: boolean): Promise<{ message: string }> => {
  const res = await axiosInstance.patch<{ message: string }>(`/utilisateurs/${userId}/toggle-status`, { est_actif });
  return res.data;
};

export const toggleUserAdmin = async (userId: number, est_admin: boolean): Promise<{ message: string }> => {
  const res = await axiosInstance.patch<{ message: string }>(`/utilisateurs/${userId}/toggle-admin`, { est_admin });
  return res.data;
};

// Auth utilities
export const logout = () => {
  // Clear all user data from localStorage
  localStorage.removeItem("accessToken");
  localStorage.removeItem("user");
  localStorage.removeItem("refreshToken");
  // Clear any other user-related data
  sessionStorage.clear();
  // Redirect to login
  window.location.href = "/login";
};

export const isAuthenticated = (): boolean => {
  return !!localStorage.getItem("accessToken");
};

export const getStoredToken = (): string | null => {
  return localStorage.getItem("accessToken");
};