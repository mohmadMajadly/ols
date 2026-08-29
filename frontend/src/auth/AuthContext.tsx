import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, type ReactNode, useContext } from 'react'

import { apiClient } from '../api/client'

export type UserRole = 'admin' | 'supervisor' | 'teacher' | 'student'

export interface User {
  id: string
  username: string
  full_name: string
  role: UserRole
  is_active: boolean
  created_at: string
}

export const roleLabels: Record<UserRole, string> = {
  admin: 'مدير',
  supervisor: 'مشرف',
  teacher: 'معلم',
  student: 'طالب',
}

interface AuthContextValue {
  user: User | null
  isLoading: boolean
  login: (username: string, password: string) => Promise<User>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

const ME_QUERY_KEY = ['auth', 'me']

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()

  const { data: user, isLoading } = useQuery<User | null>({
    queryKey: ME_QUERY_KEY,
    queryFn: async () => {
      try {
        return await apiClient.get<User>('/auth/me')
      } catch {
        return null
      }
    },
  })

  async function login(username: string, password: string): Promise<User> {
    const loggedInUser = await apiClient.post<User>('/auth/login', { username, password })
    queryClient.setQueryData(ME_QUERY_KEY, loggedInUser)
    return loggedInUser
  }

  async function logout(): Promise<void> {
    await apiClient.post('/auth/logout')
    queryClient.setQueryData(ME_QUERY_KEY, null)
  }

  return (
    <AuthContext.Provider value={{ user: user ?? null, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth يجب أن يُستخدم داخل AuthProvider')
  }
  return context
}
