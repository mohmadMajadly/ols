// صفحة مراجعة المدير: تعرض كل مكون من src/ui بكل حالاته في مكان واحد.
// Route غير محمي، ويُشرط ظهوره بـ import.meta.env.DEV في routes.tsx (لا يظهر في الإنتاج).

import type { ReactNode } from 'react'
import { useState } from 'react'

import { AyahChip } from '../ui/AyahChip'
import { Badge } from '../ui/Badge'
import type { BadgeVariant } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
import { Modal } from '../ui/Modal'
import { PageHeader } from '../ui/PageHeader'
import { PasswordField } from '../ui/PasswordField'
import { Select } from '../ui/Select'
import { Spinner } from '../ui/Spinner'
import { Table, TableBody, TableCell, TableEmptyRow, TableHead, TableHeaderCell, TableRow } from '../ui/Table'
import { TextArea } from '../ui/TextArea'
import { TextField } from '../ui/TextField'
import { useToast } from '../ui/Toast'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-4 border-b border-khatt pb-2 font-display text-xl text-hibr">{title}</h2>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  )
}

const BADGE_VARIANTS: BadgeVariant[] = ['neutral', 'sahih', 'hifz', 'tajwid', 'dabt', 'waqf']

export function UiGalleryPage() {
  const [modalOpen, setModalOpen] = useState(false)
  const [tableHasRows, setTableHasRows] = useState(true)
  const toast = useToast()

  return (
    <div className="mx-auto max-w-5xl p-6">
      <PageHeader
        title="معرض المكونات"
        description="صفحة مراجعة داخلية — لا تظهر في بيئة الإنتاج (/dev/ui، DEV فقط)."
      />

      <Section title="Button">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary">أساسي</Button>
          <Button variant="secondary">ثانوي</Button>
          <Button variant="ghost">شفاف</Button>
          <Button variant="danger">حذف</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm">حجم صغير</Button>
          <Button size="md">حجم متوسط</Button>
          <Button loading>جارٍ الحفظ</Button>
          <Button disabled>معطّل</Button>
        </div>
      </Section>

      <Section title="TextField / PasswordField / TextArea">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="اسم الطالب" placeholder="أدخل الاسم" />
          <TextField label="حقل به مساعدة" help="سيظهر هذا النص أسفل الحقل" />
          <TextField label="حقل به خطأ" error="هذا الحقل مطلوب" defaultValue="قيمة غير صالحة" />
          <TextField label="حقل معطّل" disabled defaultValue="غير قابل للتعديل" />
          <PasswordField label="كلمة المرور" placeholder="••••••••" />
          <Select
            label="الدور"
            placeholder="اختر دوراً"
            options={[
              { value: 'admin', label: 'مدير' },
              { value: 'teacher', label: 'معلم' },
              { value: 'student', label: 'طالب' },
            ]}
          />
        </div>
        <TextArea label="ملاحظات" placeholder="اكتب ملاحظة..." />
      </Section>

      <Section title="Card">
        <Card>
          <p className="text-hibr">هذا محتوى داخل بطاقة: سطح مرتفع، حد رفيع، بلا ظل.</p>
        </Card>
      </Section>

      <Section title="Table">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => setTableHasRows((v) => !v)}>
            {tableHasRows ? 'عرض حالة فارغة' : 'عرض بيانات'}
          </Button>
        </div>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>الاسم</TableHeaderCell>
              <TableHeaderCell>الحلقة</TableHeaderCell>
              <TableHeaderCell>آخر سبق</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {tableHasRows ? (
              <>
                <TableRow>
                  <TableCell>محمد أحمد</TableCell>
                  <TableCell>حلقة الفجر</TableCell>
                  <TableCell>
                    <AyahChip surah="البقرة" ayah={286} />
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>يوسف علي</TableCell>
                  <TableCell>حلقة العصر</TableCell>
                  <TableCell>
                    <AyahChip surah="آل عمران" ayah={92} />
                  </TableCell>
                </TableRow>
              </>
            ) : (
              <TableEmptyRow colSpan={3} message="لا طلاب بعد — أضف أول طالب" />
            )}
          </TableBody>
        </Table>
      </Section>

      <Section title="Modal">
        <div>
          <Button onClick={() => setModalOpen(true)}>فتح نافذة</Button>
        </div>
        <Modal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title="تأكيد الإجراء"
          footer={
            <>
              <Button variant="secondary" onClick={() => setModalOpen(false)}>
                إلغاء
              </Button>
              <Button variant="primary" onClick={() => setModalOpen(false)}>
                تأكيد
              </Button>
            </>
          }
        >
          <p className="text-hibr-2">هذا نص تجريبي داخل نافذة الحوار.</p>
        </Modal>
      </Section>

      <Section title="Toast">
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => toast.show('تم الحفظ بنجاح')}>
            نجاح
          </Button>
          <Button variant="secondary" onClick={() => toast.show('تعذر حفظ التغييرات', 'error')}>
            خطأ
          </Button>
        </div>
      </Section>

      <Section title="Badge">
        <div className="flex flex-wrap gap-2">
          {BADGE_VARIANTS.map((variant) => (
            <Badge key={variant} variant={variant}>
              {variant}
            </Badge>
          ))}
        </div>
      </Section>

      <Section title="AyahChip">
        <div className="flex flex-wrap gap-2">
          <AyahChip surah="الفاتحة" ayah={7} />
          <AyahChip surah="يس" ayah={83} />
        </div>
      </Section>

      <Section title="EmptyState">
        <EmptyState
          message="لا حلقات بعد — أضف أول حلقة"
          action={<Button size="sm">إضافة حلقة</Button>}
        />
      </Section>

      <Section title="PageHeader">
        <Card className="p-0">
          <div className="p-5">
            <PageHeader
              title="عنوان نموذجي"
              description="وصف قصير يوضح محتوى الصفحة"
              actions={<Button size="sm">إجراء</Button>}
            />
          </div>
        </Card>
      </Section>

      <Section title="Spinner">
        <div className="flex items-center gap-6">
          <Spinner size={16} />
          <Spinner size={24} tone="lazward" />
          <span className="rounded-control bg-lazward-700 p-2 text-nur">
            <Spinner size={18} tone="nur" />
          </span>
        </div>
      </Section>
    </div>
  )
}
