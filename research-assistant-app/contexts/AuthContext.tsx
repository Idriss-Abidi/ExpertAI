"use client"

import React, { createContext, useContext, useEffect, useState } from 'react'
import { User, getCurrentUser, isAuthenticated, getStoredToken, logout } from '@/services/userService'
import { decodeJWT, isTokenExpired, getUserFromToken } from '@/utils/jwt'

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (token: string) => void
  logout: () => void
  isAuthenticated: boolean
  refreshUser: () => Promise<void>
  isLoading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshUser = async () => {
    try {
      const token = getStoredToken()
      if (token && !isTokenExpired(token)) {
        const tokenUser = getUserFromToken(token)
        if (tokenUser) {
          // Create a minimal user object from token data
          const userFromToken: User = {
            id: tokenUser.id,
            email: tokenUser.email,
            nom: '', // Will be fetched if needed
            prenom: '', // Will be fetched if needed
            est_admin: tokenUser.isAdmin,
            est_actif: tokenUser.isActive,
            date_creation: new Date().toISOString(),
            telephone: ''
          }
          setUser(userFromToken)
        }
      } else {
        // Token is expired or invalid, clear it
        localStorage.removeItem("accessToken")
        setUser(null)
      }
    } catch (error) {
      console.error("Failed to decode user data from token:", error)
      // Clear invalid auth data
      localStorage.removeItem("accessToken")
      setUser(null)
    }
  }

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        if (isAuthenticated()) {
          await refreshUser()
        }
      } catch (error) {
        console.error("Auth initialization error:", error)
        // Clear invalid auth data
        localStorage.removeItem("accessToken")
      } finally {
        setLoading(false)
      }
    }

    initializeAuth()
  }, [])

  const login = (token: string) => {
    // Clear any existing user data first
    localStorage.removeItem("user")
    localStorage.removeItem("refreshToken")
    sessionStorage.clear()
    
    // Store only the JWT token
    localStorage.setItem("accessToken", token)
    refreshUser() // Decode user data from token
  }

  const handleLogout = () => {
    logout()
    setUser(null)
  }

  const value = {
    user,
    loading,
    login,
    logout: handleLogout,
    isAuthenticated: !!user,
    refreshUser,
    isLoading: loading
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
