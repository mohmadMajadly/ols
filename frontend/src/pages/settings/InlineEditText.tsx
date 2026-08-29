// نص قابل للتحرير في المكان — «روح الإكسل»: عرض ثابت، النقر عليه يحوّله حقل نص،
// Enter يحفظ، Esc يلغي، وفقدان التركيز يحفظ أيضاً (بلا حفظ مكرر — settledRef يضمن
// تسوية واحدة لكل جلسة تحرير حتى إن تتابع Enter ثم blur).

import { useEffect, useRef, useState } from 'react'

import { Spinner } from '../../ui/Spinner'
import { cx } from '../../ui/utils'

export interface InlineEditTextProps {
  value: string
  onSave: (next: string) => void
  saving?: boolean
  placeholder?: string
  className?: string
  inputClassName?: string
}

export function InlineEditText({ value, onSave, saving, placeholder, className, inputClassName }: InlineEditTextProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)
  const settledRef = useRef(false)

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  function startEditing() {
    setDraft(value)
    settledRef.current = false
    setEditing(true)
  }

  function save() {
    if (settledRef.current) return
    settledRef.current = true
    setEditing(false)
    const trimmed = draft.trim()
    if (trimmed && trimmed !== value) onSave(trimmed)
  }

  function cancel() {
    if (settledRef.current) return
    settledRef.current = true
    setEditing(false)
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={startEditing}
        className={cx(
          'w-full rounded-control px-1.5 py-1 text-start text-base text-hibr hover:bg-lazward-100/40',
          className,
        )}
      >
        {value || <span className="text-hibr-3">{placeholder}</span>}
      </button>
    )
  }

  return (
    <span className="inline-flex w-full items-center gap-2">
      <input
        ref={inputRef}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            save()
          } else if (event.key === 'Escape') {
            event.preventDefault()
            cancel()
          }
        }}
        className={cx(
          'h-8 w-full min-w-[100px] rounded-control border border-lazward-700 bg-waraq-raised px-2 text-base text-hibr outline-none',
          inputClassName,
        )}
      />
      {saving && <Spinner size={14} tone="lazward" />}
    </span>
  )
}
