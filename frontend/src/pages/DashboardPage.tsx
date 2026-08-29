// / — لوحة التحكم العامة: صف فلاتر (فترة/حلقة/معلم/نوع)، بطاقات إحصاء، شبكة رسوم (جلسات
// عبر الفترة، أخطاء حسب التصنيف، توزيع الدرجات، بحاجة لعناية)، وجدول ملخص الحلقات.
// يستبدل الـ placeholder المؤقت السابق. تغيّر أي فلتر يعيد الجلب بشفافية خفيفة على
// المحتوى (لا Spinner صفحة كاملة) عبر react-query + keepPreviousData.

import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import type { DashboardFilters, SessionsOverTimePoint } from '../api/dashboard'
import { fetchDashboardStats } from '../api/dashboard'
import { fetchGroups } from '../api/groups'
import type { SessionType } from '../api/sessions'
import { fetchUsers } from '../api/users'
import { useAuth } from '../auth/AuthContext'
import type { BarChartVDatum } from '../charts'
import { BarChartH, BarChartV } from '../charts'
import { formatAxisDate } from '../charts/chartUtils'
import { formatHoursMinutes } from '../lib/formatDuration'
import { noteChartColorVar } from '../lib/noteColors'
import { sessionTypeLabels } from '../lib/sessionLabels'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
import { PageHeader } from '../ui/PageHeader'
import { Select } from '../ui/Select'
import { Spinner } from '../ui/Spinner'
import {
  Table,
  TableBody,
  TableCell,
  TableEmptyRow,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '../ui/Table'
import { TextField } from '../ui/TextField'
import { cx } from '../ui/utils'

type PeriodPreset = '7' | '30' | '90' | 'custom'

const PERIOD_PRESETS: Array<{ value: PeriodPreset; label: string }> = [
  { value: '7', label: '٧ أيام' },
  { value: '30', label: '٣٠ يوماً' },
  { value: '90', label: '٩٠ يوماً' },
  { value: 'custom', label: 'مخصص' },
]

const DEFAULT_PERIOD_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000
// أكثر من 45 يوماً يومياً يصبح الرسم مزدحماً — تُجمَّع الفترة أسبوعياً عندها (client-side).
const MAX_DAILY_DAYS = 45
// عدد تسميات محور x الأقصى قبل إخفاء بعضها لمنع التداخل — أعمدة كثيرة تعني نصوصاً كثيرة.
const MAX_X_LABELS = 9

function computePeriod(preset: PeriodPreset, customFrom: string, customTo: string): { from: string; to: string } {
  const now = new Date()
  if (preset === 'custom') {
    const to = customTo ? new Date(`${customTo}T23:59:59`) : now
    const from = customFrom ? new Date(`${customFrom}T00:00:00`) : new Date(to.getTime() - DEFAULT_PERIOD_DAYS * DAY_MS)
    return { from: from.toISOString(), to: to.toISOString() }
  }
  const days = Number(preset)
  return { from: new Date(now.getTime() - days * DAY_MS).toISOString(), to: now.toISOString() }
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** يملأ الأيام الناقصة بصفر عبر كامل الفترة (الخادم لا يرسل أيام بلا جلسات) — لا يُسقط أي
 * نقطة واردة من الخادم، فيبقى مجموع القيم مطابقاً لبطاقة «جلسات الفترة» دوماً. */
function fillDailySeries(
  points: SessionsOverTimePoint[],
  fromIso: string,
  toIso: string,
): { date: string; count: number }[] {
  const byDate = new Map(points.map((p) => [p.date, p.count]))
  const start = new Date(fromIso)
  start.setHours(0, 0, 0, 0)
  const end = new Date(toIso)
  end.setHours(0, 0, 0, 0)

  const days: { date: string; count: number }[] = []
  const seen = new Set<string>()
  for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const key = toDateKey(cursor)
    days.push({ date: key, count: byDate.get(key) ?? 0 })
    seen.add(key)
  }
  // دفاعياً: أي تاريخ من الخادم يقع خارج المدى المحسوب هنا (فروق تقريب زمني) يُضاف كما هو
  // كي لا يُفقد من المجموع.
  for (const p of points) {
    if (!seen.has(p.date)) days.push({ date: p.date, count: p.count })
  }
  return days.sort((a, b) => a.date.localeCompare(b.date))
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/** يبني بيانات BarChartV لـ«الجلسات عبر الفترة»: تجميع أسبوعي إن طالت الفترة، وتخفيف
 * تسميات محور x (بترك بعضها فارغاً) كي لا تتداخل عند كثرة الأعمدة. */
function buildSessionsChartData(days: { date: string; count: number }[]): BarChartVDatum[] {
  const source =
    days.length > MAX_DAILY_DAYS
      ? chunk(days, 7).map((week) => ({
          date: week[0].date,
          count: week.reduce((sum, d) => sum + d.count, 0),
        }))
      : days

  const step = Math.max(1, Math.ceil(source.length / MAX_X_LABELS))
  return source.map((d, i) => ({
    id: d.date,
    label: i % step === 0 || i === source.length - 1 ? formatAxisDate(d.date) : '',
    value: d.count,
  }))
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="flex flex-col gap-1">
      <p className="text-sm text-hibr-2">{label}</p>
      <div className="flex items-baseline gap-1.5">
        <span className="font-time text-2xl tabular-nums text-hibr">{value}</span>
        {sub && <span className="text-sm text-hibr-2">{sub}</span>}
      </div>
    </Card>
  )
}

export function DashboardPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const canFilterTeacher = user?.role === 'admin' || user?.role === 'supervisor'

  const [preset, setPreset] = useState<PeriodPreset>('30')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [groupFilter, setGroupFilter] = useState('')
  const [teacherFilter, setTeacherFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')

  const { from, to } = useMemo(() => computePeriod(preset, customFrom, customTo), [preset, customFrom, customTo])

  const groupsQuery = useQuery({ queryKey: ['groups', { include_inactive: false }], queryFn: () => fetchGroups() })
  const teachersQuery = useQuery({
    queryKey: ['users', { role: 'teacher' }],
    queryFn: () => fetchUsers({ role: 'teacher' }),
    enabled: canFilterTeacher,
  })

  const filters: DashboardFilters = {
    group_id: groupFilter || undefined,
    teacher_id: teacherFilter || undefined,
    session_type: (typeFilter || undefined) as SessionType | undefined,
    from,
    to,
  }

  const dashboardQuery = useQuery({
    queryKey: ['dashboard', 'stats', filters],
    queryFn: () => fetchDashboardStats(filters),
    placeholderData: keepPreviousData,
  })

  const stats = dashboardQuery.data
  const isInitialLoading = dashboardQuery.isLoading
  const isRefetching = dashboardQuery.isFetching && !isInitialLoading

  // معلم جديد بلا حلقات على الإطلاق (نطاقه مفروض من الخادم أصلاً) — دعوة للفعل بدل شبكة فارغة.
  const hasNoGroups = user?.role === 'teacher' && groupsQuery.isSuccess && (groupsQuery.data ?? []).length === 0
  const hasNoSessions = stats ? stats.totals.sessions === 0 : false

  const sessionsChartData = useMemo(() => {
    if (!stats) return []
    return buildSessionsChartData(fillDailySeries(stats.sessions_over_time, from, to))
  }, [stats, from, to])

  const errorsByCategoryData = (stats?.errors_by_category ?? []).map((c) => ({
    id: c.category_id,
    label: c.name,
    value: c.count,
    color: noteChartColorVar(c.color),
  }))

  const gradeDistributionData: BarChartVDatum[] = (stats?.grade_distribution ?? []).map((b) => ({
    id: b.bucket,
    label: b.bucket,
    value: b.count,
  }))

  return (
    <div>
      <PageHeader title="لوحة التحكم" description="نظرة عامة على الحلقات والجلسات خلال الفترة المحددة" />

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-hibr">الفترة</span>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="فترة العرض">
            {PERIOD_PRESETS.map((p) => (
              <Button
                key={p.value}
                size="sm"
                variant={preset === p.value ? 'primary' : 'secondary'}
                aria-pressed={preset === p.value}
                onClick={() => setPreset(p.value)}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>

        {preset === 'custom' && (
          <>
            <div className="w-full max-w-[160px]">
              <TextField label="من" type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            </div>
            <div className="w-full max-w-[160px]">
              <TextField label="إلى" type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            </div>
          </>
        )}

        <div className="w-full max-w-[200px]">
          <Select
            label="الحلقة"
            placeholder="كل الحلقات"
            options={(groupsQuery.data ?? []).map((g) => ({ value: g.id, label: g.name }))}
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value)}
          />
        </div>

        {canFilterTeacher && (
          <div className="w-full max-w-[200px]">
            <Select
              label="المعلم"
              placeholder="كل المعلمين"
              options={(teachersQuery.data ?? []).map((t) => ({ value: t.id, label: t.full_name }))}
              value={teacherFilter}
              onChange={(e) => setTeacherFilter(e.target.value)}
            />
          </div>
        )}

        <div className="w-full max-w-[180px]">
          <Select
            label="نوع الجلسة"
            placeholder="كل الأنواع"
            options={Object.entries(sessionTypeLabels).map(([value, label]) => ({ value, label }))}
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          />
        </div>
      </div>

      {isInitialLoading ? (
        <div className="flex justify-center py-16">
          <Spinner size={28} tone="lazward" />
        </div>
      ) : hasNoGroups ? (
        <EmptyState
          message="ابدأ بإنشاء حلقة وإضافة طلابك"
          action={<Button onClick={() => navigate('/groups')}>إنشاء حلقة</Button>}
        />
      ) : (
        <div className={cx('transition-opacity duration-150', isRefetching && 'pointer-events-none opacity-60')}>
          {hasNoSessions ? (
            <EmptyState message="لا جلسات في هذه الفترة" />
          ) : (
            stats && (
              <>
                <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                  <StatCard label="طلاب نشطون" value={String(stats.totals.active_students)} />
                  <StatCard label="جلسات الفترة" value={String(stats.totals.sessions)} />
                  <StatCard
                    label="متوسط الدرجة"
                    value={stats.totals.avg_grade != null ? String(stats.totals.avg_grade) : '—'}
                    sub={stats.totals.avg_grade != null ? 'من 100' : undefined}
                  />
                  <StatCard
                    label="نسبة الحضور"
                    value={stats.totals.attendance_rate != null ? `${stats.totals.attendance_rate}%` : '—'}
                  />
                  <StatCard
                    label="إجمالي التلاوة"
                    value={stats.totals.total_recorded_ms > 0 ? formatHoursMinutes(stats.totals.total_recorded_ms) : '—'}
                  />
                </div>

                <div className="mb-6 grid gap-4 lg:grid-cols-2">
                  <Card>
                    <h2 className="mb-3 font-display text-lg text-hibr">الجلسات عبر الفترة</h2>
                    <BarChartV data={sessionsChartData} />
                  </Card>
                  <Card>
                    <h2 className="mb-3 font-display text-lg text-hibr">الأخطاء حسب التصنيف</h2>
                    <BarChartH data={errorsByCategoryData} />
                  </Card>
                  <Card>
                    <h2 className="mb-3 font-display text-lg text-hibr">توزيع الدرجات</h2>
                    <BarChartV data={gradeDistributionData} />
                  </Card>
                  <Card>
                    <h2 className="mb-1 font-display text-lg text-hibr">بحاجة لعناية</h2>
                    <p className="mb-3 text-sm text-hibr-2">طلاب قد يحتاجون وقتاً إضافياً هذه الفترة</p>
                    {stats.needs_attention.length === 0 ? (
                      <p className="py-6 text-center text-sm text-hibr-2">
                        لا أحد يحتاج عناية خاصة — أداء طيب عموماً
                      </p>
                    ) : (
                      <ul className="flex flex-col divide-y divide-khatt">
                        {stats.needs_attention.map((n) => (
                          <li key={n.student_id} className="flex flex-wrap items-center gap-2.5 py-2 text-sm">
                            <button
                              type="button"
                              onClick={() => navigate(`/students/${n.student_id}`)}
                              className="font-medium text-lazward-700 hover:underline"
                            >
                              {n.full_name}
                            </button>
                            <span className="text-hibr-2">{n.group_name ?? 'بدون حلقة'}</span>
                            <span
                              className={cx('font-time tabular-nums', n.avg_grade < 75 ? 'text-khata-hifz' : 'text-hibr')}
                            >
                              {n.avg_grade}
                            </span>
                            <span className="ms-auto flex items-baseline gap-1">
                              <span className="font-time tabular-nums text-hibr">{n.sessions}</span>
                              <span className="text-hibr-2">جلسات</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>
                </div>

                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell>الحلقة</TableHeaderCell>
                      <TableHeaderCell>الطلاب</TableHeaderCell>
                      <TableHeaderCell>الجلسات</TableHeaderCell>
                      <TableHeaderCell>متوسط الدرجة</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {stats.groups_summary.length === 0 ? (
                      <TableEmptyRow colSpan={4} message="لا حلقات ضمن هذا النطاق" />
                    ) : (
                      stats.groups_summary.map((g) => (
                        <TableRow
                          key={g.group_id}
                          className="cursor-pointer"
                          onClick={() => navigate(`/students?group_id=${g.group_id}`)}
                        >
                          <TableCell className="font-medium">{g.name}</TableCell>
                          <TableCell>{g.students}</TableCell>
                          <TableCell>{g.sessions}</TableCell>
                          <TableCell className="font-time">{g.avg_grade != null ? g.avg_grade : '—'}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </>
            )
          )}
        </div>
      )}
    </div>
  )
}
