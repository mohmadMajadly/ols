// خيارات حقل «قائمة اختيار» كـ chips قابلة للإضافة/الإزالة — Enter أو فاصلة يضيف خياراً،
// زر الإغلاق الصغير على كل chip يزيله. يستدعي onChange بالقائمة الكاملة الجديدة.

import { useState } from 'react'

import { Spinner } from '../../ui/Spinner'
import { IconClose } from '../../ui/icons'

export function OptionChips({
  options,
  onChange,
  saving,
}: {
  options: string[]
  onChange: (next: string[]) => void
  saving?: boolean
}) {
  const [draft, setDraft] = useState('')

  function addChip() {
    const trimmed = draft.trim()
    if (!trimmed || options.includes(trimmed)) {
      setDraft('')
      return
    }
    onChange([...options, trimmed])
    setDraft('')
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {options.map((option) => (
        <span
          key={option}
          className="inline-flex items-center gap-1 rounded-full border border-khatt bg-waraq px-2 py-0.5 text-sm text-hibr"
        >
          {option}
          <button
            type="button"
            onClick={() => onChange(options.filter((o) => o !== option))}
            aria-label={`إزالة ${option}`}
            className="text-hibr-3 hover:text-khata-hifz"
          >
            <IconClose className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ',') {
            event.preventDefault()
            addChip()
          }
        }}
        onBlur={() => draft.trim() && addChip()}
        placeholder="إضافة خيار..."
        className="h-7 w-28 rounded-control border border-khatt bg-waraq-raised px-2 text-sm text-hibr placeholder:text-hibr-3 outline-none focus:border-lazward-700"
      />
      {saving && <Spinner size={13} tone="lazward" />}
    </div>
  )
}
