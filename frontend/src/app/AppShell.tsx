// هيكل التطبيق العام: شريط جانبي ثابت على اليمين (بداية القراءة) لعرض ≥900px، ويتحول
// إلى قائمة قابلة للطي بترويسة علوية وزر همبرغر تحت ذلك. يحوي منطقة المحتوى (Outlet).

import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'

import type { UserRole } from '../auth/AuthContext'
import { roleLabels, useAuth } from '../auth/AuthContext'
import { Button } from '../ui/Button'
import {
  IconCircles,
  IconDashboard,
  IconLogout,
  IconMenu,
  IconSessions,
  IconSettings,
  IconStudents,
  IconUser,
} from '../ui/icons'
import { cx } from '../ui/utils'

const NAV_ITEMS: Array<{ to: string; label: string; icon: typeof IconDashboard; end: boolean; roles?: UserRole[] }> = [
  { to: '/', label: 'لوحة التحكم', icon: IconDashboard, end: true },
  { to: '/students', label: 'الطلاب', icon: IconStudents, end: false },
  { to: '/groups', label: 'الحلقات', icon: IconCircles, end: false },
  { to: '/sessions', label: 'الجلسات', icon: IconSessions, end: false },
  { to: '/users', label: 'المستخدمون', icon: IconUser, end: false, roles: ['admin'] },
  { to: '/settings', label: 'الإعدادات', icon: IconSettings, end: false, roles: ['admin', 'supervisor', 'student'] },
]

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const visibleItems = NAV_ITEMS.filter((item) => !item.roles || (user && item.roles.includes(user.role)))

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-khatt px-5 py-5">
        <p className="font-display text-xl text-lazward-700">OLS</p>
        <p className="mt-0.5 text-sm text-hibr-2">منصة التسميع</p>
      </div>

      <nav className="flex-1 overflow-y-auto p-3">
        <ul className="flex flex-col gap-1">
          {visibleItems.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cx(
                    'flex h-11 items-center gap-3 rounded-control border-s-[3px] px-3 text-base transition-colors duration-150',
                    isActive
                      ? 'border-lazward-700 bg-lazward-100 font-medium text-hibr'
                      : 'border-transparent text-hibr-2 hover:bg-lazward-100/40 hover:text-hibr',
                  )
                }
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span>{label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="border-t border-khatt p-4">
        <p className="truncate text-sm font-medium text-hibr">{user?.full_name}</p>
        <p className="text-sm text-hibr-2">{user ? roleLabels[user.role] : ''}</p>
        <Button variant="ghost" size="sm" onClick={handleLogout} className="mt-3 w-full justify-start">
          <IconLogout className="h-4 w-4" />
          تسجيل الخروج
        </Button>
      </div>
    </div>
  )
}

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="flex min-h-screen bg-waraq">
      {/* الشريط الجانبي الثابت — لعرض ≥900px */}
      <aside className="hidden w-[232px] shrink-0 border-e border-khatt bg-waraq-raised min-[900px]:block">
        <SidebarContent />
      </aside>

      {/* القائمة المنسدلة للجوال — عند عرض <900px */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 min-[900px]:hidden">
          <div
            className="absolute inset-0 bg-lazward-900/45"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute inset-y-0 start-0 w-[232px] max-w-[85vw] border-e border-khatt bg-waraq-raised shadow-float">
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-khatt bg-waraq-raised px-4 py-3 min-[900px]:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="فتح القائمة"
            className="rounded-control p-1.5 text-hibr hover:bg-lazward-100/40"
          >
            <IconMenu className="h-[22px] w-[22px]" />
          </button>
          <span className="font-display text-lg text-lazward-700">OLS</span>
        </header>

        <main className="min-w-0 flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
