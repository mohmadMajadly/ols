import { useNavigate } from 'react-router-dom'

import { roleLabels, useAuth } from '../auth/AuthContext'

export default function ShellPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  if (!user) return null

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
        <span className="text-lg font-semibold text-gray-800">OLS</span>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-700">
            {user.full_name} <span className="text-gray-400">({roleLabels[user.role]})</span>
          </span>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
          >
            تسجيل الخروج
          </button>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center">
        <p className="text-gray-500">قيد الإنشاء</p>
      </main>
    </div>
  )
}
