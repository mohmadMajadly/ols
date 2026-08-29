// صفحة تسجيل الدخول بالهوية البصرية النهائية — بلا صور وبلا زخرفة، الرقي في دقة
// المسافات والتباعد الطفيف بين أحرف العنوان.

import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import { ApiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Button } from '../ui/Button'
import { PasswordField } from '../ui/PasswordField'
import { TextField } from '../ui/TextField'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)
    try {
      await login(username, password)
      navigate('/', { replace: true })
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.detail)
      } else {
        setError('تعذر الاتصال بالخادم، يرجى المحاولة لاحقاً')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-waraq p-4">
      <div className="w-full max-w-[400px] rounded-card border border-khatt bg-waraq-raised p-8">
        <div className="mb-8 text-center">
          <h1 className="font-display text-3xl tracking-wide text-lazward-700">OLS</h1>
          <p className="mt-1.5 text-sm text-hibr-2">منصة إدارة التسميع</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <TextField
            label="اسم المستخدم"
            id="username"
            name="username"
            type="text"
            autoComplete="username"
            required
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />

          <PasswordField
            label="كلمة المرور"
            id="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />

          {error && (
            <p role="alert" className="rounded-control bg-khata-hifz/10 px-3 py-2 text-sm text-khata-hifz">
              {error}
            </p>
          )}

          <Button type="submit" loading={isSubmitting} className="mt-1 w-full">
            دخول
          </Button>
        </form>
      </div>
    </main>
  )
}
