// اختيار بحثي (combobox خفيف): حقل نص يفتح قائمة نتائج مفلترة أسفله عند الكتابة أو
// التركيز، دون الاعتماد على <select> الأصلي (يحتاج بحثاً حياً بالاسم — مثل اختيار الطالب
// عند بدء جلسة). إغلاق عند النقر خارج الحاوية أو Esc؛ الاختيار بالنقر أو Enter/الأسهم.

import type { KeyboardEvent } from 'react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'

import { fieldBaseClasses, fieldErrorBorderClasses, fieldErrorClasses, fieldHelpClasses, fieldLabelClasses } from './fieldStyles'
import { IconSearch } from './icons'
import { cx } from './utils'

export interface SearchSelectOption {
  value: string
  label: string
  hint?: string
}

export interface SearchSelectProps {
  label: string
  options: SearchSelectOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  emptyMessage?: string
  help?: string
  error?: string
  disabled?: boolean
}

export function SearchSelect({
  label,
  options,
  value,
  onChange,
  placeholder = 'اكتب للبحث...',
  emptyMessage = 'لا نتائج',
  help,
  error,
  disabled,
}: SearchSelectProps) {
  const fieldId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const selected = options.find((o) => o.value === value) ?? null
  const [query, setQuery] = useState(selected?.label ?? '')
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)

  // إبقاء نص الحقل متزامناً مع الاختيار عند تغيّره من خارج المكوّن (مثل إعادة تعيين
  // النموذج) — يُشتق أثناء الرندر بدل useEffect (نفس نمط StudentsPage لإعادة الفلاتر).
  const [syncedValue, setSyncedValue] = useState(value)
  if (value !== syncedValue) {
    setSyncedValue(value)
    setQuery(selected?.label ?? '')
  }

  useEffect(() => {
    if (!open) return
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q || q === selected?.label.toLowerCase()) return options
    return options.filter((o) => o.label.toLowerCase().includes(q))
  }, [options, query, selected?.label])

  function selectOption(option: SearchSelectOption) {
    onChange(option.value)
    setQuery(option.label)
    setOpen(false)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setOpen(false)
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setOpen(true)
      setHighlight((h) => Math.min(h + 1, filtered.length - 1))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const option = filtered[highlight]
      if (option) selectOption(option)
    }
  }

  const describedBy = error ? `${fieldId}-error` : help ? `${fieldId}-help` : undefined

  return (
    <div ref={containerRef} className="relative">
      <label htmlFor={fieldId} className={fieldLabelClasses}>
        {label}
      </label>
      <div className="relative">
        <IconSearch className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-hibr-3" />
        <input
          id={fieldId}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-describedby={describedBy}
          aria-invalid={Boolean(error) || undefined}
          disabled={disabled}
          placeholder={placeholder}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
            setHighlight(0)
            if (value) onChange('')
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          className={cx(fieldBaseClasses, 'h-10 ps-9 pe-3 text-base', error && fieldErrorBorderClasses)}
        />
      </div>

      {open && !disabled && (
        <ul
          role="listbox"
          className="absolute z-40 mt-1 max-h-56 w-full overflow-y-auto rounded-control border border-khatt bg-waraq-raised py-1 shadow-float"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-hibr-3">{emptyMessage}</li>
          ) : (
            filtered.map((option, index) => (
              <li key={option.value} role="option" aria-selected={option.value === value}>
                <button
                  type="button"
                  onClick={() => selectOption(option)}
                  className={cx(
                    'flex w-full items-center justify-between gap-2 px-3 py-2 text-start text-base',
                    index === highlight ? 'bg-lazward-100/60' : 'hover:bg-lazward-100/40',
                    option.value === value && 'font-medium text-lazward-700',
                  )}
                >
                  <span>{option.label}</span>
                  {option.hint && <span className="text-sm text-hibr-3">{option.hint}</span>}
                </button>
              </li>
            ))
          )}
        </ul>
      )}

      {error ? (
        <p id={`${fieldId}-error`} role="alert" className={fieldErrorClasses}>
          {error}
        </p>
      ) : help ? (
        <p id={`${fieldId}-help`} className={fieldHelpClasses}>
          {help}
        </p>
      ) : null}
    </div>
  )
}
