// صفحة عنصر نائب لأقسام لم تُبنَ بعد ضمن هذه الحزمة — تُستخدم لكل بنود التنقل الرئيسية.

import { EmptyState } from '../ui/EmptyState'
import { PageHeader } from '../ui/PageHeader'

export function PlaceholderPage({ title }: { title: string }) {
  return (
    <div>
      <PageHeader title={title} />
      <EmptyState message="هذا القسم قيد الإنشاء" />
    </div>
  )
}
