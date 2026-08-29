// صفحة الإعدادات (admin/supervisor): تبويبات تصنيفات الملاحظات، الحقول المخصصة، وسلّم
// التقييم (admin فقط — يختفي عن supervisor). محرر ديناميكي كامل لنظام الملاحظات بلا
// حاجة لمبرمج.

import { useState } from 'react'

import { useAuth } from '../../auth/AuthContext'
import { PageHeader } from '../../ui/PageHeader'
import type { TabItem } from '../../ui/Tabs'
import { Tabs } from '../../ui/Tabs'
import { FieldsTab } from './FieldsTab'
import { RubricTab } from './RubricTab'
import { TaxonomyTab } from './TaxonomyTab'

const BASE_TABS: TabItem[] = [
  { id: 'taxonomy', label: 'تصنيفات الملاحظات' },
  { id: 'fields', label: 'الحقول المخصصة' },
]
const RUBRIC_TAB: TabItem = { id: 'rubric', label: 'سلّم التقييم' }

export function SettingsPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const tabs = isAdmin ? [...BASE_TABS, RUBRIC_TAB] : BASE_TABS

  const [requestedTab, setRequestedTab] = useState('taxonomy')
  const activeId = tabs.some((tab) => tab.id === requestedTab) ? requestedTab : 'taxonomy'

  return (
    <div>
      <PageHeader title="الإعدادات" description="تشكيل نظام الملاحظات وسلّم التقييم من هنا، بلا حاجة لمبرمج" />

      <Tabs tabs={tabs} activeId={activeId} onChange={setRequestedTab} />

      {activeId === 'taxonomy' && <TaxonomyTab />}
      {activeId === 'fields' && <FieldsTab />}
      {activeId === 'rubric' && isAdmin && <RubricTab />}
    </div>
  )
}
