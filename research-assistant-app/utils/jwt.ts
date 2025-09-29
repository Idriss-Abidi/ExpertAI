// JWT utility functions for token decoding and user information extraction

export interface JWTPayload {
  sub: string; // email
  user_id: number;
  is_admin: boolean;
  is_active: boolean;
  exp: number;
  iat: number;
}

export function decodeJWT(token: string): JWTPayload | null {
  try {
    // JWT tokens are base64url encoded and have 3 parts separated by dots
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }
    
    // Decode the payload (second part)
    const payload = parts[1];
    const decodedPayload = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decodedPayload);
  } catch (error) {
    console.error('Failed to decode JWT token:', error);
    return null;
  }
}

export function isTokenExpired(token: string): boolean {
  const payload = decodeJWT(token);
  if (!payload) {
    return true;
  }
  
  const currentTime = Math.floor(Date.now() / 1000);
  return payload.exp < currentTime;
}

export function getUserFromToken(token: string): { id: number; email: string; isAdmin: boolean; isActive: boolean } | null {
  const payload = decodeJWT(token);
  if (!payload) {
    return null;
  }
  
  return {
    id: payload.user_id,
    email: payload.sub,
    isAdmin: payload.is_admin,
    isActive: payload.is_active
  };
}
