// تنبيه الجلسة الجارية أعلى سجل الجلسات: يحل محل زر «بدء جلسة تسميع» ما دامت للمعلم
// جلسة قيد التسجيل. الإلغاء من هنا يمرّ عبر RecorderEngine (مثيل مؤقت بلا تسجيل فعلي)
// احتراماً لقاعدة «chunks/finalize/cancel عبر المحرك حصراً» رغم عدم وجود تسجيل جارٍ
// في هذه الصفحة (عالم الورق، لا مايكروفون هنا).

import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import type { SessionDetail } from '../../api/sessions'
import { RecorderEngine } from '../../session/recorderEngine'
import { Button } from '../../ui/Button'
import { Modal } from '../../ui/Modal'
import { useToast } from '../../ui/Toast'

export function ActiveSessionBanner({ session }: { session: SessionDetail }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  async function handleCancel() {
    setCancelling(true)
    try {
      const engine = new RecorderEngine(session.id, {}, { onSnapshot: () => undefined, onLevel: () => undefined })
      await engine.cancel()
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
      toast.show('تم إلغاء الجلسة')
    } catch {
      toast.show('تعذّر إلغاء الجلسة، حاول مرة أخرى', 'error')
    } finally {
      setCancelling(false)
      setCancelOpen(false)
    }
  }

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-card border border-lazward-700/25 bg-lazward-100/50 px-4 py-3.5">
      <p className="text-hibr">
        لديك جلسة جارية مع <span className="font-semibold">{session.student_name}</span>
      </p>
      <div className="flex shrink-0 gap-2">
        <Button size="sm" variant="secondary" onClick={() => setCancelOpen(true)}>
          إلغاء الجلسة
        </Button>
        <Button size="sm" onClick={() => navigate('/sessions/live')}>
          استئناف
        </Button>
      </div>

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="إلغاء الجلسة"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelOpen(false)}>
              تراجع
            </Button>
            <Button variant="secondary" loading={cancelling} onClick={handleCancel}>
              إلغاء الجلسة نهائياً
            </Button>
          </>
        }
      >
        <p className="text-hibr">سيُحذف تسجيل هذه الجلسة نهائياً ولا يمكن التراجع عن ذلك — هل أنت متأكد؟</p>
      </Modal>
    </div>
  )
}
