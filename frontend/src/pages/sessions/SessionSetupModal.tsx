// نافذة إعداد جلسة تسميع جديدة: اختيار الطالب (بحث)، نوع الجلسة (ثلاث بطاقات)، نطاق
// اختياري (سورة+آية إلى سورة+آية). عند النجاح: POST /api/sessions ثم انتقال فوري إلى
// شاشة الجلسة الحية.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { ApiError } from '../../api/client'
import { fetchSurahs } from '../../api/quran'
import type { SessionType } from '../../api/sessions'
import { createSession } from '../../api/sessions'
import { fetchStudents } from '../../api/students'
import { SESSION_TYPE_CARDS } from '../../lib/sessionLabels'
import { Button } from '../../ui/Button'
import { Modal } from '../../ui/Modal'
import { SearchSelect } from '../../ui/SearchSelect'
import { Select } from '../../ui/Select'
import { Switch } from '../../ui/Switch'
import { TextField } from '../../ui/TextField'
import { useToast } from '../../ui/Toast'
import { cx } from '../../ui/utils'

interface RangeState {
  surah: string
  ayah: string
}

const EMPTY_RANGE: RangeState = { surah: '', ayah: '' }

export function SessionSetupModal({
  open,
  onClose,
  initialStudentId,
}: {
  open: boolean
  onClose: () => void
  /** طالب مُحدَّد مسبقاً (قادم من ?student_id= في /sessions — انظر ملف الطالب) */
  initialStudentId?: string
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()

  const studentsQuery = useQuery({
    queryKey: ['students', { include_inactive: false }],
    queryFn: () => fetchStudents(),
    enabled: open,
  })
  const surahsQuery = useQuery({ queryKey: ['quran', 'surahs'], queryFn: fetchSurahs, staleTime: Infinity })

  const [studentId, setStudentId] = useState('')
  const [sessionType, setSessionType] = useState<SessionType>('sabq')
  const [rangeEnabled, setRangeEnabled] = useState(false)
  const [start, setStart] = useState<RangeState>(EMPTY_RANGE)
  const [end, setEnd] = useState<RangeState>(EMPTY_RANGE)
  const [studentError, setStudentError] = useState<string | undefined>()
  const [rangeError, setRangeError] = useState<string | undefined>()

  // الطالب المُحدَّد مسبقاً يُضبط بعد وصول قائمة الطلاب كي يلتقط SearchSelect تسميته
  // فوراً (لا فائدة من ضبط القيمة قبل توفر الخيارات المطابقة لها).
  useEffect(() => {
    if (open && initialStudentId && studentsQuery.data) {
      setStudentId(initialStudentId)
    }
  }, [open, initialStudentId, studentsQuery.data])

  const surahs = surahsQuery.data ?? []
  const surahOptions = surahs.map((s) => ({ value: String(s.number), label: `${s.number}. ${s.name}` }))
  const startSurahInfo = surahs.find((s) => String(s.number) === start.surah)
  const endSurahInfo = surahs.find((s) => String(s.number) === end.surah)

  function resetForm() {
    setStudentId('')
    setSessionType('sabq')
    setRangeEnabled(false)
    setStart(EMPTY_RANGE)
    setEnd(EMPTY_RANGE)
    setStudentError(undefined)
    setRangeError(undefined)
  }

  function handleClose() {
    resetForm()
    onClose()
  }

  const createMutation = useMutation({
    mutationFn: () =>
      createSession({
        student_id: studentId,
        session_type: sessionType,
        ...(rangeEnabled
          ? {
              range_start_surah: Number(start.surah),
              range_start_ayah: Number(start.ayah),
              range_end_surah: Number(end.surah),
              range_end_ayah: Number(end.ayah),
            }
          : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
      resetForm()
      onClose()
      navigate('/sessions/live')
    },
    onError: (error: unknown) => {
      const detail = error instanceof ApiError ? error.detail : 'تعذّر بدء الجلسة، حاول مرة أخرى'
      toast.show(detail, 'error')
    },
  })

  function handleSubmit() {
    setStudentError(undefined)
    setRangeError(undefined)
    if (!studentId) {
      setStudentError('اختيار الطالب مطلوب')
      return
    }
    if (rangeEnabled) {
      if (!start.surah || !start.ayah || !end.surah || !end.ayah) {
        setRangeError('يجب تحديد بداية النطاق ونهايته معاً (سورة وآية)')
        return
      }
      const startAfterEnd =
        Number(start.surah) > Number(end.surah) ||
        (Number(start.surah) === Number(end.surah) && Number(start.ayah) > Number(end.ayah))
      if (startAfterEnd) {
        setRangeError('نطاق البداية يجب أن يسبق نطاق النهاية أو يساويه')
        return
      }
    }
    createMutation.mutate()
  }

  const studentOptions = (studentsQuery.data ?? []).map((s) => ({ value: s.id, label: s.full_name }))

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="بدء جلسة تسميع"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>
            إلغاء
          </Button>
          <Button onClick={handleSubmit} loading={createMutation.isPending}>
            ابدأ التسميع
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <SearchSelect
          label="الطالب"
          placeholder="ابحث باسم الطالب..."
          options={studentOptions}
          value={studentId}
          onChange={(next) => {
            setStudentId(next)
            setStudentError(undefined)
          }}
          error={studentError}
        />

        <div>
          <p className="mb-1.5 text-sm font-medium text-hibr">نوع الجلسة</p>
          <div className="grid grid-cols-3 gap-2">
            {SESSION_TYPE_CARDS.map((card) => {
              const active = sessionType === card.value
              return (
                <button
                  key={card.value}
                  type="button"
                  onClick={() => setSessionType(card.value)}
                  className={cx(
                    'flex flex-col items-center gap-0.5 rounded-control border px-2 py-3 text-center transition-colors duration-150',
                    active ? 'border-lazward-700 bg-lazward-100' : 'border-khatt hover:bg-lazward-100/40',
                  )}
                >
                  <span className={cx('text-sm font-semibold', active ? 'text-lazward-700' : 'text-hibr')}>
                    {card.title}
                  </span>
                  {card.subtitle && <span className="text-xs text-hibr-2">{card.subtitle}</span>}
                </button>
              )
            })}
          </div>
        </div>

        <Switch checked={rangeEnabled} onChange={setRangeEnabled} label="تحديد نطاق الجلسة (اختياري)" />

        {rangeEnabled && (
          <div className="grid grid-cols-2 gap-3 rounded-control border border-khatt bg-waraq px-3 py-3">
            <p className="col-span-2 text-sm font-medium text-hibr-2">من</p>
            <Select
              label="السورة"
              placeholder="اختر السورة"
              options={surahOptions}
              value={start.surah}
              onChange={(event) => setStart({ surah: event.target.value, ayah: '' })}
            />
            <TextField
              label="الآية"
              type="number"
              min={1}
              max={startSurahInfo?.ayah_count}
              disabled={!start.surah}
              value={start.ayah}
              onChange={(event) => setStart((s) => ({ ...s, ayah: event.target.value }))}
            />
            <p className="col-span-2 mt-1 text-sm font-medium text-hibr-2">إلى</p>
            <Select
              label="السورة"
              placeholder="اختر السورة"
              options={surahOptions}
              value={end.surah}
              onChange={(event) => setEnd({ surah: event.target.value, ayah: '' })}
            />
            <TextField
              label="الآية"
              type="number"
              min={1}
              max={endSurahInfo?.ayah_count}
              disabled={!end.surah}
              value={end.ayah}
              onChange={(event) => setEnd((s) => ({ ...s, ayah: event.target.value }))}
            />
            {rangeError && (
              <p role="alert" className="col-span-2 text-sm text-khata-hifz">
                {rangeError}
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
