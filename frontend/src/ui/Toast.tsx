// نظام تنبيهات عابرة (Toast): مزوّد سياق + خطاف useToast لعرضها من أي مكان في التطبيق.
// تظهر أعلى يسار الشاشة (نهاية اتجاه RTL) وتختفي تلقائياً بعد 4 ثوانٍ. التلاشي معطّل
// تلقائياً عند تفعيل تقليل الحركة عبر قاعدة CSS عامة في نقطة الدخول.

import type { ReactNode } from 'react'
import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

import { IconAlertCircle, IconCheckCircle, IconClose } from './icons'
import { cx } from './utils'

export type ToastVariant = 'success' | 'error'

interface ToastItem {
  id: number
  message: string
  variant: ToastVariant
}

interface ToastContextValue {
  show: (message: string, variant?: ToastVariant) => void
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined)

const DISMISS_AFTER_MS = 4000

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const show = useCallback(
    (message: string, variant: ToastVariant = 'success') => {
      const id = Date.now() + Math.random()
      setToasts((current) => [...current, { id, message, variant }])
      window.setTimeout(() => dismiss(id), DISMISS_AFTER_MS)
    },
    [dismiss],
  )

  const value = useMemo(() => ({ show }), [show])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div className="fixed top-4 end-4 z-[60] flex w-full max-w-sm flex-col gap-2">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              role={toast.variant === 'error' ? 'alert' : 'status'}
              className={cx(
                'flex items-start gap-2.5 rounded-card border bg-waraq-raised p-3.5 text-sm shadow-float transition-opacity duration-200',
                toast.variant === 'error' ? 'border-khata-hifz/30' : 'border-sahih/30',
              )}
            >
              {toast.variant === 'error' ? (
                <IconAlertCircle className="mt-0.5 h-[18px] w-[18px] shrink-0 text-khata-hifz" />
              ) : (
                <IconCheckCircle className="mt-0.5 h-[18px] w-[18px] shrink-0 text-sahih" />
              )}
              <p className="flex-1 text-hibr">{toast.message}</p>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label="إغلاق التنبيه"
                className="text-hibr-3 hover:text-hibr-2"
              >
                <IconClose className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast يجب أن يُستخدم داخل ToastProvider')
  }
  return context
}
