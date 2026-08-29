import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import { AppShell } from './app/AppShell'
import type { UserRole } from './auth/AuthContext'
import { useAuth } from './auth/AuthContext'
import { DashboardPage } from './pages/DashboardPage'
import { GroupsPage } from './pages/GroupsPage'
import { LiveSessionPage } from './pages/live/LiveSessionPage'
import LoginPage from './pages/LoginPage'
import { SettingsPage } from './pages/settings/SettingsPage'
import { SessionDetailPage } from './pages/sessions/SessionDetailPage'
import { SessionsPage } from './pages/sessions/SessionsPage'
import { StudentDetailPage } from './pages/StudentDetailPage'
import { StudentPortalPage } from './pages/StudentPortalPage'
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

/** حارس صلاحية على مستوى المسار — يعيد التوجيه لمن ليس دوره ضمن roles. الطالب يُعاد
 * توجيهه دوماً إلى بوابته /me (لا إلى "/" الإدارية التي لا يرى فيها شيئاً أصلاً). */
function RoleGuard({ roles, children }: { roles: UserRole[]; children: ReactNode }) {
  const { user } = useAuth()
  if (!user) {
    return <Navigate to="/" replace />
  }
  if (!roles.includes(user.role)) {
    return <Navigate to={user.role === 'student' ? '/me' : '/'} replace />
  }
  return <>{children}</>
}

const STAFF_ROLES: UserRole[] = ['admin', 'supervisor', 'teacher']

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {import.meta.env.DEV && <Route path="/dev/ui" element={<UiGalleryPage />} />}

      {/* شاشة الجلسة الحية: ملء الشاشة بلا AppShell — خارج عالم الورق عمداً. للطاقم فقط. */}
      <Route
        path="/sessions/live"
        element={
          <ProtectedRoute>
            <RoleGuard roles={STAFF_ROLES}>
              <LiveSessionPage />
            </RoleGuard>
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
        {/* المسارات الإدارية: للطاقم فقط — أي طالب يُعاد توجيهه إلى بوابته /me (RoleGuard). */}
        <Route
          index
          element={
            <RoleGuard roles={STAFF_ROLES}>
              <DashboardPage />
            </RoleGuard>
          }
        />
        <Route
          path="students"
          element={
            <RoleGuard roles={STAFF_ROLES}>
              <StudentsPage />
            </RoleGuard>
          }
        />
        <Route
          path="students/:id"
          element={
            <RoleGuard roles={STAFF_ROLES}>
              <StudentDetailPage />
            </RoleGuard>
          }
        />
        <Route
          path="groups"
          element={
            <RoleGuard roles={STAFF_ROLES}>
              <GroupsPage />
            </RoleGuard>
          }
        />
        <Route
          path="sessions"
          element={
            <RoleGuard roles={STAFF_ROLES}>
              <SessionsPage />
            </RoleGuard>
          }
        />
        <Route
          path="sessions/:id"
          element={
            <RoleGuard roles={STAFF_ROLES}>
              <SessionDetailPage />
            </RoleGuard>
          }
        />
        <Route
          path="users"
          element={
            <RoleGuard roles={['admin']}>
              <UsersPage />
            </RoleGuard>
          }
        />
        <Route
          path="settings"
          element={
            <RoleGuard roles={['admin', 'supervisor']}>
              <SettingsPage />
            </RoleGuard>
          }
        />

        {/* بوابة الطالب (WP8): للطالب فقط — أي دور آخر يُعاد توجيهه إلى "/". */}
        <Route
          path="me"
          element={
            <RoleGuard roles={['student']}>
              <StudentPortalPage />
            </RoleGuard>
          }
        />
        <Route
          path="me/sessions/:id"
          element={
            <RoleGuard roles={['student']}>
              <SessionDetailPage readOnly />
            </RoleGuard>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
