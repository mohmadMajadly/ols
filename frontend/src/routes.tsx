import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import { AppShell } from './app/AppShell'
import { useAuth } from './auth/AuthContext'
import LoginPage from './pages/LoginPage'
import { PlaceholderPage } from './pages/PlaceholderPage'
import { UiGalleryPage } from './pages/UiGalleryPage'

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-waraq">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-khatt border-t-lazward-700"
          role="status"
          aria-label="جارٍ التحميل"
        />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {import.meta.env.DEV && <Route path="/dev/ui" element={<UiGalleryPage />} />}

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route index element={<PlaceholderPage title="لوحة التحكم" />} />
        <Route path="students" element={<PlaceholderPage title="الطلاب" />} />
        <Route path="circles" element={<PlaceholderPage title="الحلقات" />} />
        <Route path="sessions" element={<PlaceholderPage title="الجلسات" />} />
        <Route path="settings" element={<PlaceholderPage title="الإعدادات" />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
