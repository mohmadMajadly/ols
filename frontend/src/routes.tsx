import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import { AppShell } from './app/AppShell'
import type { UserRole } from './auth/AuthContext'
import { useAuth } from './auth/AuthContext'
import { GroupsPage } from './pages/GroupsPage'
import { LiveSessionPage } from './pages/live/LiveSessionPage'
import LoginPage from './pages/LoginPage'
import { PlaceholderPage } from './pages/PlaceholderPage'
import { SessionDetailPage } from './pages/sessions/SessionDetailPage'
import { SessionsPage } from './pages/sessions/SessionsPage'
import { StudentDetailPage } from './pages/StudentDetailPage'
import { StudentsPage } from './pages/StudentsPage'
import { UiGalleryPage } from './pages/UiGalleryPage'
import { UsersPage } from './pages/UsersPage'

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

/** حارس صلاحية على مستوى المسار — يعيد التوجيه لمن ليس دوره ضمن roles. */
function RoleGuard({ roles, children }: { roles: UserRole[]; children: ReactNode }) {
  const { user } = useAuth()
  if (!user || !roles.includes(user.role)) {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {import.meta.env.DEV && <Route path="/dev/ui" element={<UiGalleryPage />} />}

      {/* شاشة الجلسة الحية: ملء الشاشة بلا AppShell — خارج عالم الورق عمداً */}
      <Route
        path="/sessions/live"
        element={
          <ProtectedRoute>
            <LiveSessionPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route index element={<PlaceholderPage title="لوحة التحكم" />} />
        <Route path="students" element={<StudentsPage />} />
        <Route path="students/:id" element={<StudentDetailPage />} />
        <Route path="groups" element={<GroupsPage />} />
        <Route path="sessions" element={<SessionsPage />} />
        <Route path="sessions/:id" element={<SessionDetailPage />} />
        <Route
          path="users"
          element={
            <RoleGuard roles={['admin']}>
              <UsersPage />
            </RoleGuard>
          }
        />
        <Route path="settings" element={<PlaceholderPage title="الإعدادات" />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
