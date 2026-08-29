// جسم ملف الطالب — بطاقات إحصائية، مسار الدرجات وتوزيع الأخطاء، أكثر الأخطاء تكراراً،
// مواضع متكررة، وسجل الجلسات. مستخرج من StudentDetailPage كي تُعيد بوابة الطالب
// (StudentPortalPage) استخدامه بلا أزرار تعديل/بدء جلسة عبر readOnly، دون تكرار الكود.
// PageHeader ونافذة تعديل بيانات الطالب يبقيان في الصفحة الأم (StudentDetailPage) حصراً.

import type { StudentStats } from '../api/students'
import type { SessionListItem } from '../api/sessions'
import { BarChartH } from '../charts/BarChartH'
import { LineChart } from '../charts/LineChart'
import { formatDualDate } from '../lib/date'
import { formatHoursMinutes } from '../lib/formatDuration'
import { noteChartColorVar, noteSolidDotClass } from '../lib/noteColors'
import { sessionStatusLabels, sessionTypeLabels } from '../lib/sessionLabels'
import { surahLabel } from '../lib/surahName'
import { AyahChip } from '../ui/AyahChip'
import { Badge } from '../ui/Badge'
import type { BadgeVariant } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
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

const SESSION_STATUS_BADGE: Record<string, BadgeVariant> = { recording: 'lazward', completed: 'sahih', cancelled: 'neutral' }

function StatCard({ label, value, sub, empty }: { label: string; value: string; sub?: string; empty?: boolean }) {
  return (
    <Card className="flex flex-col gap-1">
      <p className="text-sm text-hibr-2">{label}</p>
      <div className="flex items-baseline gap-1.5">
        <span className="font-time text-2xl tabular-nums text-hibr">{value}</span>
        {sub && <span className="text-sm text-hibr-2">{sub}</span>}
      </div>
      {empty && <p className="text-sm text-hibr-3">لا بيانات بعد</p>}
    </Card>
  )
}

export interface StudentProfileTitles {
  gradesTrend?: string
  errorsByCategory?: string
  topMistakes?: string
  repeatedMistakes?: string
  sessionsHeading?: string
}

export interface StudentProfileContentProps {
  stats: StudentStats | undefined
  statsLoading: boolean
  sessions: SessionListItem[] | undefined
  sessionsLoading: boolean
  surahNames: Map<number, string>
  sessionTypeFilter: string
  onSessionTypeFilterChange: (value: string) => void
  onSessionClick: (sessionId: string) => void
  /** true في بوابة الطالب: بلا أي زر بدء جلسة أو نداء فعل لا يملكه الطالب. */
  readOnly?: boolean
  onStartSession?: () => void
  titles?: StudentProfileTitles
}

export function StudentProfileContent({
  stats,
  statsLoading,
  sessions,
  sessionsLoading,
  surahNames,
  sessionTypeFilter,
  onSessionTypeFilterChange,
  onSessionClick,
  readOnly = false,
  onStartSession,
  titles = {},
}: StudentProfileContentProps) {
  const hasCompletedSessions = (stats?.totals.sessions ?? 0) > 0

  const gradesTrendData = (stats?.grades_trend ?? []).map((p) => ({
    x: p.date,
    y: p.grade,
    meta: sessionTypeLabels[p.session_type],
  }))

  const errorsByCategoryData = (stats?.errors_by_category ?? []).map((c) => ({
    id: c.category_id,
    label: c.name,
    value: c.count,
    color: noteChartColorVar(c.color),
  }))

  return (
    <>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="الجلسات" value={String(stats?.totals.sessions ?? 0)} />
        <StatCard
          label="متوسط الدرجة"
          value={stats?.totals.avg_grade != null ? String(stats.totals.avg_grade) : '—'}
          sub={stats?.totals.avg_grade != null ? 'من 100' : undefined}
          empty={stats?.totals.avg_grade == null}
        />
        <StatCard
          label="نسبة الحضور"
          value={stats?.totals.attendance_rate != null ? `${stats.totals.attendance_rate}%` : '—'}
          empty={stats?.totals.attendance_rate == null}
        />
        <StatCard
          label="إجمالي التلاوة المسجلة"
          value={stats ? formatHoursMinutes(stats.totals.total_recorded_ms) : '—'}
          empty={!stats || stats.totals.total_recorded_ms === 0}
        />
      </div>

      {statsLoading ? (
        <div className="flex justify-center py-10">
          <Spinner size={24} tone="lazward" />
        </div>
      ) : !hasCompletedSessions ? (
        <Card className="mb-6">
          <EmptyState
            message={
              readOnly
                ? 'لا جلسات مكتملة بعد — ستظهر هنا بعد أول جلسة تسميع'
                : 'لا جلسات مكتملة بعد لهذا الطالب — ابدأ أول جلسة تسميع لرؤية مسار تقدّمه'
            }
            action={!readOnly && onStartSession ? <Button onClick={onStartSession}>بدء جلسة تسميع</Button> : undefined}
          />
        </Card>
      ) : (
        <>
          <div className="mb-6 grid gap-4 lg:grid-cols-2">
            <Card>
              <h2 className="mb-3 font-display text-lg text-hibr">{titles.gradesTrend ?? 'مسار الدرجات'}</h2>
              <LineChart data={gradesTrendData} yMin={0} yMax={100} height={200} />
            </Card>
            <Card>
              <h2 className="mb-3 font-display text-lg text-hibr">{titles.errorsByCategory ?? 'الأخطاء حسب التصنيف'}</h2>
              <BarChartH data={errorsByCategoryData} />
            </Card>
          </div>

          {stats && stats.top_subtypes.length > 0 && (
            <Card className="mb-6">
              <h2 className="mb-3 font-display text-lg text-hibr">{titles.topMistakes ?? 'أكثر الأخطاء تكراراً'}</h2>
              <ul className="flex flex-col divide-y divide-khatt">
                {stats.top_subtypes.map((s) => (
                  <li key={s.subtype_id} className="flex items-center gap-2.5 py-2 text-sm">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${noteSolidDotClass(s.color)}`} aria-hidden="true" />
                    <span className="font-medium text-hibr">{s.name}</span>
                    <span className="text-hibr-2">{s.category_name}</span>
                    <span className="ms-auto font-time tabular-nums text-hibr">{s.count}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {stats && stats.repeated_mistakes.length > 0 && (
            <Card className="mb-6">
              <h2 className="mb-1 font-display text-lg text-hibr">{titles.repeatedMistakes ?? 'مواضع متكررة'}</h2>
              <p className="mb-3 text-sm text-hibr-2">
                مواضع تكرر فيها الخطأ عبر الجلسات — تستحق وقفة مراجعة.
              </p>
              <ul className="flex flex-col divide-y divide-khatt">
                {stats.repeated_mistakes.map((m) => (
                  <li key={`${m.surah}:${m.ayah}`} className="flex flex-wrap items-center gap-2.5 py-2 text-sm">
                    <AyahChip surah={m.surah_name} ayah={m.ayah} />
                    <span className="flex items-baseline gap-1">
                      <span className="font-time tabular-nums text-hibr">{m.count}</span>
                      <span className="text-hibr-2">مرات</span>
                    </span>
                    <span className="text-hibr-2">{m.categories.join('، ')}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}

      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-display text-xl text-hibr">{titles.sessionsHeading ?? 'سجل الجلسات'}</h2>
        <div className="w-full max-w-[180px]">
          <Select
            label="النوع"
            placeholder="كل الأنواع"
            options={Object.entries(sessionTypeLabels).map(([value, label]) => ({ value, label }))}
            value={sessionTypeFilter}
            onChange={(e) => onSessionTypeFilterChange(e.target.value)}
          />
        </div>
      </div>

      {sessionsLoading ? (
        <div className="flex justify-center py-10">
          <Spinner size={24} tone="lazward" />
        </div>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>التاريخ</TableHeaderCell>
              <TableHeaderCell>النوع</TableHeaderCell>
              <TableHeaderCell>النطاق</TableHeaderCell>
              <TableHeaderCell>الملاحظات</TableHeaderCell>
              <TableHeaderCell>الدرجة</TableHeaderCell>
              <TableHeaderCell>الحالة</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(sessions ?? []).length === 0 ? (
              <TableEmptyRow
                colSpan={6}
                message={readOnly ? 'لا جلسات بعد' : 'لا جلسات بعد — ابدأ أول جلسة تسميع'}
                action={!readOnly && onStartSession ? <Button size="sm" onClick={onStartSession}>بدء جلسة تسميع</Button> : undefined}
              />
            ) : (
              (sessions ?? []).map((session) => {
                const hasRange = session.range_start_surah != null && session.range_end_surah != null
                const grade = session.grade ?? session.suggested_grade
                return (
                  <TableRow key={session.id} className="cursor-pointer" onClick={() => onSessionClick(session.id)}>
                    <TableCell className="whitespace-nowrap text-sm text-hibr-2">{formatDualDate(session.started_at)}</TableCell>
                    <TableCell>
                      <Badge variant="neutral">{sessionTypeLabels[session.session_type]}</Badge>
                    </TableCell>
                    <TableCell>
                      {hasRange ? (
                        <span className="flex items-center gap-1 whitespace-nowrap">
                          <AyahChip surah={surahLabel(surahNames, session.range_start_surah as number)} ayah={session.range_start_ayah as number} />
                          <span className="text-hibr-3">—</span>
                          <AyahChip surah={surahLabel(surahNames, session.range_end_surah as number)} ayah={session.range_end_ayah as number} />
                        </span>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">{session.notes_count}</TableCell>
                    <TableCell className="font-time tabular-nums">
                      {grade != null ? (session.grade != null ? grade : `${grade}~`) : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={SESSION_STATUS_BADGE[session.status]}>{sessionStatusLabels[session.status]}</Badge>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      )}
    </>
  )
}
