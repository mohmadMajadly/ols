// تبويب «تصنيفات الملاحظات»: بطاقات الفئات مرتبة بـ sort_order، وداخل كل بطاقة الأنواع
// الفرعية قابلة للتحرير في المكان. GET /api/taxonomy يُرجع الفئات/الأنواع الفرعية النشطة
// فقط (سلوك مقصود لشاشة الجلسة الحية) — لذا نحتفظ محلياً بآخر نسخة معروفة من كل فئة
// (بما فيها المعطّلة حديثاً) عبر دمج استجابات النداءات مباشرة، كي لا تختفي فئة نظامية
// عطّلها المستخدم للتو من قائمة الإعدادات نفسها بلا سبيل لإعادة تفعيلها.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import type { NoteCategory, NoteColorKey, NoteSubtype } from '../../api/taxonomy'
import {
  createCategory,
  createSubtype,
  deleteCategory,
  fetchTaxonomyWithInactive,
  updateCategory,
  updateSubtype,
} from '../../api/taxonomy'
import { ApiError } from '../../api/client'
import { Button } from '../../ui/Button'
import { Spinner } from '../../ui/Spinner'
import { useToast } from '../../ui/Toast'
import { IconPlus } from '../../ui/icons'
import { AddCategoryModal } from './AddCategoryModal'
import { CategoryCard } from './CategoryCard'
import { DeleteCategoryModal } from './DeleteCategoryModal'

export function TaxonomyTab() {
  const queryClient = useQueryClient()
  const toast = useToast()

  // مفتاح فرعي مستقل: صفحة الإعدادات ترى المعطَّل، وشاشة الجلسة تبقى على النشط.
  // invalidateQueries({queryKey: ['taxonomy']}) يشمل الاثنين لأنه بادئة.
  const taxonomyQuery = useQuery({
    queryKey: ['taxonomy', 'all'],
    queryFn: fetchTaxonomyWithInactive,
  })

  const [categoriesMap, setCategoriesMap] = useState<Record<string, NoteCategory>>({})

  useEffect(() => {
    if (!taxonomyQuery.data) return
    setCategoriesMap((prev) => {
      const next = { ...prev }
      for (const category of taxonomyQuery.data.categories) next[category.id] = category
      return next
    })
  }, [taxonomyQuery.data])

  function mergeCategory(category: NoteCategory) {
    setCategoriesMap((prev) => ({ ...prev, [category.id]: category }))
  }

  function mergeSubtype(categoryId: string, subtype: NoteSubtype) {
    setCategoriesMap((prev) => {
      const category = prev[categoryId]
      if (!category) return prev
      const exists = category.subtypes.some((s) => s.id === subtype.id)
      const subtypes = exists
        ? category.subtypes.map((s) => (s.id === subtype.id ? subtype : s))
        : [...category.subtypes, subtype]
      return { ...prev, [categoryId]: { ...category, subtypes } }
    })
  }

  const categories = Object.values(categoriesMap).sort((a, b) => a.sort_order - b.sort_order)

  function reportError(error: unknown) {
    const detail = error instanceof ApiError ? error.detail : 'تعذر الاتصال بالخادم، يرجى المحاولة لاحقاً'
    toast.show(detail, 'error')
  }

  // ---- إضافة فئة ----
  const [addModalOpen, setAddModalOpen] = useState(false)
  const createCategoryMutation = useMutation({
    mutationFn: (payload: { name: string; color: NoteColorKey }) =>
      createCategory({ ...payload, sort_order: categories.length }),
    onSuccess: (category) => {
      mergeCategory(category)
      queryClient.invalidateQueries({ queryKey: ['taxonomy'] })
      setAddModalOpen(false)
      toast.show('تمت إضافة الفئة')
    },
    onError: reportError,
  })

  // ---- تعطيل/تفعيل فئة ----
  const [busyCategoryId, setBusyCategoryId] = useState<string | null>(null)
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      setBusyCategoryId(id)
      return updateCategory(id, { is_active })
    },
    onSuccess: (category) => {
      mergeCategory(category)
      queryClient.invalidateQueries({ queryKey: ['taxonomy'] })
    },
    onError: reportError,
    onSettled: () => setBusyCategoryId(null),
  })

  // ---- إعادة الترتيب: مبادلة sort_order مع الجار ----
  const reorderMutation = useMutation({
    mutationFn: async ({ a, b }: { a: NoteCategory; b: NoteCategory }) => {
      setBusyCategoryId(a.id)
      const [updatedA, updatedB] = await Promise.all([
        updateCategory(a.id, { sort_order: b.sort_order }),
        updateCategory(b.id, { sort_order: a.sort_order }),
      ])
      return [updatedA, updatedB]
    },
    onSuccess: ([updatedA, updatedB]) => {
      mergeCategory(updatedA)
      mergeCategory(updatedB)
      queryClient.invalidateQueries({ queryKey: ['taxonomy'] })
    },
    onError: reportError,
    onSettled: () => setBusyCategoryId(null),
  })

  // ---- حذف فئة غير نظامية ----
  const [deleteTarget, setDeleteTarget] = useState<NoteCategory | null>(null)
  const deleteCategoryMutation = useMutation({
    mutationFn: (id: string) => deleteCategory(id),
    onSuccess: (_void, id) => {
      setCategoriesMap((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      queryClient.invalidateQueries({ queryKey: ['taxonomy'] })
      setDeleteTarget(null)
      toast.show('تم حذف الفئة')
    },
    onError: reportError,
  })

  // ---- أنواع فرعية ----
  const [pendingSubtypeId, setPendingSubtypeId] = useState<string | null>(null)
  const [addingSubtypeCategoryId, setAddingSubtypeCategoryId] = useState<string | null>(null)

  const createSubtypeMutation = useMutation({
    mutationFn: async ({ categoryId, name }: { categoryId: string; name: string }) => {
      setAddingSubtypeCategoryId(categoryId)
      const category = categoriesMap[categoryId]
      const nextOrder = category ? category.subtypes.length : 0
      const subtype = await createSubtype({ category_id: categoryId, name, sort_order: nextOrder })
      return { categoryId, subtype }
    },
    onSuccess: ({ categoryId, subtype }) => {
      mergeSubtype(categoryId, subtype)
      queryClient.invalidateQueries({ queryKey: ['taxonomy'] })
    },
    onError: reportError,
    onSettled: () => setAddingSubtypeCategoryId(null),
  })

  const renameSubtypeMutation = useMutation({
    mutationFn: async ({ categoryId, subtypeId, name }: { categoryId: string; subtypeId: string; name: string }) => {
      setPendingSubtypeId(subtypeId)
      const subtype = await updateSubtype(subtypeId, { name })
      return { categoryId, subtype }
    },
    onSuccess: ({ categoryId, subtype }) => {
      mergeSubtype(categoryId, subtype)
      queryClient.invalidateQueries({ queryKey: ['taxonomy'] })
    },
    onError: reportError,
    onSettled: () => setPendingSubtypeId(null),
  })

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-hibr-2">فئات الملاحظة وأنواعها الفرعية كما تظهر في نموذج الملاحظة أثناء الجلسة.</p>
        <Button onClick={() => setAddModalOpen(true)}>
          <IconPlus className="h-4 w-4" />
          أضف فئة
        </Button>
      </div>

      {taxonomyQuery.isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner size={28} tone="lazward" />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {categories.map((category, index) => (
            <CategoryCard
              key={category.id}
              category={category}
              canMoveUp={index > 0}
              canMoveDown={index < categories.length - 1}
              busy={busyCategoryId === category.id}
              onMoveUp={() => {
                const prev = categories[index - 1]
                if (prev) reorderMutation.mutate({ a: category, b: prev })
              }}
              onMoveDown={() => {
                const next = categories[index + 1]
                if (next) reorderMutation.mutate({ a: category, b: next })
              }}
              onToggleActive={(is_active) => toggleActiveMutation.mutate({ id: category.id, is_active })}
              onDelete={() => setDeleteTarget(category)}
              onRenameSubtype={(subtype, name) =>
                renameSubtypeMutation.mutate({ categoryId: category.id, subtypeId: subtype.id, name })
              }
              pendingSubtypeId={pendingSubtypeId}
              onAddSubtype={(name) => createSubtypeMutation.mutate({ categoryId: category.id, name })}
              addingSubtype={addingSubtypeCategoryId === category.id}
            />
          ))}
        </div>
      )}

      <AddCategoryModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        submitting={createCategoryMutation.isPending}
        onSubmit={(name, color) => createCategoryMutation.mutate({ name, color })}
      />

      <DeleteCategoryModal
        open={Boolean(deleteTarget)}
        categoryName={deleteTarget?.name ?? ''}
        onClose={() => setDeleteTarget(null)}
        submitting={deleteCategoryMutation.isPending}
        onConfirm={() => deleteTarget && deleteCategoryMutation.mutate(deleteTarget.id)}
      />
    </div>
  )
}
