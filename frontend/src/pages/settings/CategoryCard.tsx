// بطاقة فئة ملاحظات واحدة: رأس (نقطة اللون + الاسم + شارات + مفتاح تفعيل + أسهم ترتيب
// + حذف للفئات غير النظامية)، وتحته الأنواع الفرعية كصفوف قابلة للتحرير في المكان
// («روح الإكسل»: صف الإضافة يبقى مفتوحاً بعد كل حفظ لإدخال متتالٍ سريع).

import { useRef, useState } from 'react'

import type { NoteCategory, NoteSubtype } from '../../api/taxonomy'
import { noteSolidDotClass } from '../../lib/noteColors'
import { Badge } from '../../ui/Badge'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { Spinner } from '../../ui/Spinner'
import { Switch } from '../../ui/Switch'
import { cx } from '../../ui/utils'
import { IconArrowDown, IconArrowUp, IconPlus, IconTrash } from '../../ui/icons'
import { InlineEditText } from './InlineEditText'

export function CategoryCard({
  category,
  canMoveUp,
  canMoveDown,
  busy,
  onMoveUp,
  onMoveDown,
  onToggleActive,
  onDelete,
  onRenameSubtype,
  pendingSubtypeId,
  onAddSubtype,
  addingSubtype,
}: {
  category: NoteCategory
  canMoveUp: boolean
  canMoveDown: boolean
  busy: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  onToggleActive: (next: boolean) => void
  onDelete: () => void
  onRenameSubtype: (subtype: NoteSubtype, name: string) => void
  pendingSubtypeId: string | null
  onAddSubtype: (name: string) => void
  addingSubtype: boolean
}) {
  const [addOpen, setAddOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function openAddRow() {
    setAddOpen(true)
    window.setTimeout(() => inputRef.current?.focus(), 0)
  }

  function submit() {
    const trimmed = draft.trim()
    if (!trimmed) return
    onAddSubtype(trimmed)
    // نُفرغ الحقل ونُبقي التركيز عليه فوراً للإدخال التالي — «صف الإدخال يبقى مفتوحاً»
    // من المواصفة (روح الإكسل: إضافة متتالية بلا انتظار استجابة الخادم).
    setDraft('')
    window.setTimeout(() => inputRef.current?.focus(), 0)
  }

  const subtypesSorted = [...category.subtypes].sort((a, b) => a.sort_order - b.sort_order)

  return (
    <Card className={cx('p-0', !category.is_active && 'opacity-60')}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-khatt px-5 py-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={cx('h-3 w-3 shrink-0 rounded-full', noteSolidDotClass(category.color))} aria-hidden="true" />
          <span className="truncate text-base font-semibold text-hibr">{category.name}</span>
          {category.is_system && <Badge variant="lazward">نظامية</Badge>}
          <span className="whitespace-nowrap text-sm text-hibr-2">
            {subtypesSorted.length.toLocaleString('ar')} {subtypesSorted.length === 1 ? 'نوع' : 'أنواع'}
          </span>
          {busy && <Spinner size={14} tone="lazward" />}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              disabled={!canMoveUp || busy}
              onClick={onMoveUp}
              aria-label="نقل الفئة لأعلى"
              className="rounded-control p-1.5 text-hibr-3 hover:bg-lazward-100/40 hover:text-hibr disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <IconArrowUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={!canMoveDown || busy}
              onClick={onMoveDown}
              aria-label="نقل الفئة لأسفل"
              className="rounded-control p-1.5 text-hibr-3 hover:bg-lazward-100/40 hover:text-hibr disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <IconArrowDown className="h-4 w-4" />
            </button>
          </div>
          <Switch checked={category.is_active} onChange={onToggleActive} disabled={busy} label="مفعّلة" />
          {!category.is_system && (
            <Button variant="danger" size="sm" onClick={onDelete} disabled={busy}>
              <IconTrash className="h-4 w-4" />
              حذف
            </Button>
          )}
        </div>
      </div>

      <div className="px-2 py-2">
        {subtypesSorted.map((subtype) => (
          <div
            key={subtype.id}
            className="flex items-center gap-2 rounded-control px-3 py-1.5 hover:bg-lazward-100/20"
          >
            <InlineEditText
              value={subtype.name}
              saving={pendingSubtypeId === subtype.id}
              onSave={(next) => onRenameSubtype(subtype, next)}
              className="flex-1"
            />
          </div>
        ))}

        {subtypesSorted.length === 0 && !addOpen && (
          <p className="px-3 py-2 text-sm text-hibr-3">لا أنواع فرعية بعد</p>
        )}

        {addOpen ? (
          <div className="flex items-center gap-2 px-3 py-1.5">
            <input
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  submit()
                } else if (event.key === 'Escape') {
                  event.preventDefault()
                  setAddOpen(false)
                  setDraft('')
                }
              }}
              placeholder="اسم النوع الفرعي..."
              className="h-8 w-full min-w-[120px] flex-1 rounded-control border border-lazward-700 bg-waraq-raised px-2 text-base text-hibr placeholder:text-hibr-3 outline-none"
            />
            {addingSubtype && <Spinner size={14} tone="lazward" />}
            <button
              type="button"
              onClick={() => {
                setAddOpen(false)
                setDraft('')
              }}
              className="text-sm text-hibr-3 hover:text-hibr-2"
            >
              إغلاق
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={openAddRow}
            className="mt-1 flex w-full items-center gap-1.5 rounded-control px-3 py-1.5 text-sm font-medium text-lazward-700 hover:bg-lazward-100/40"
          >
            <IconPlus className="h-3.5 w-3.5" />
            أضف نوعاً فرعياً
          </button>
        )}
      </div>
    </Card>
  )
}

