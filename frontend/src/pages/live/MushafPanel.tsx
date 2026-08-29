// Ù„ÙˆØ­Ø© Ø§Ù„Ù…ØµØ­Ù Ø¯Ø§Ø®Ù„ Ø´Ø§Ø´Ø© Ø§Ù„Ø¬Ù„Ø³Ø© Ø§Ù„Ø­ÙŠØ© (WP9b Â§3). ÙŠØ³ØªØ¶ÙŠÙÙ‡Ø§ LiveSessionPage Ø¥Ù…Ø§ ÙƒØ¹Ù…ÙˆØ¯ Ø¬Ø§Ù†Ø¨ÙŠ
// (Ø´Ø§Ø´Ø§Øª ÙˆØ§Ø³Ø¹Ø©) Ø£Ùˆ ØªÙ…Ø¯Ù‘Ø¯Ø§Ù‹ ÙÙˆÙ‚ Ù…Ù†Ø·Ù‚Ø© Ø£Ø²Ø±Ø§Ø± Ø§Ù„Ù…Ù„Ø§Ø­Ø¸Ø§Øª (Ù…ÙˆØ¨Ø§ÙŠÙ„) â€” Ø§Ù„Ù…ÙˆØ¶Ø¹ Ø§Ù„ÙØ¹Ù„ÙŠ Ù…Ù† Ù…Ø³Ø¤ÙˆÙ„ÙŠØ©
// Ø§Ù„Ù…Ø³ØªØ¶ÙŠÙØ› Ù‡Ø°Ø§ Ø§Ù„Ù…ÙƒÙˆÙ‘Ù† Ù†ÙØ³Ù‡ Ù„Ø§ ÙŠÙØªØ±Ø¶ Ø´ÙŠØ¦Ø§Ù‹ Ø¹Ù† Ø­Ø§ÙˆÙŠØªÙ‡. ØªÙÙ‡ÙŠÙŽÙ‘Ø£ Ù…Ù† ØµÙØ­Ø© Ø¨Ø¯Ø§ÙŠØ© Ù†Ø·Ø§Ù‚ Ø§Ù„Ø¬Ù„Ø³Ø©
// (page-for) Ø¥Ù† ÙˆÙØ¬Ø¯ Ù†Ø·Ø§Ù‚ØŒ ÙˆØ¥Ù„Ø§ Ø¢Ø®Ø± ØµÙØ­Ø© ØªØµÙÙ‘Ø­Ù‡Ø§ Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù… Ø¹Ù„Ù‰ Ù‡Ø°Ø§ Ø§Ù„Ø¬Ù‡Ø§Ø² â€” ØªÙØ´Ø§Ø±Ùƒ Ù†ÙØ³ Ù…ÙØªØ§Ø­
// localStorage Ù…Ø¹ ØµÙØ­Ø© /mushaf Ø§Ù„Ù…Ø³ØªÙ‚Ù„Ø©.

import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

import { fetchMushafPageFor } from '../../api/mushaf'
import { getLastMushafPage, setLastMushafPage } from '../../mushaf/lastPage'
import type { MushafControlHandle } from '../../mushaf/MushafPage'
import { MushafPage } from '../../mushaf/MushafPage'
import { IconChevronLeft, IconChevronRight, IconClose } from '../../ui/icons'
import { Spinner } from '../../ui/Spinner'

export interface MushafPanelProps {
  rangeStartSurah: number | null
  rangeStartAyah: number | null
  onClose: () => void
  /** ÙŠÙØ¨Ù„ÙŽÙ‘Øº Ø¨Ù…Ù‚Ø¨Ø¶ Ø§Ù„ØªØ­ÙƒÙ… Ø¨Ø¹Ø¯ Ø¬Ø§Ù‡Ø²ÙŠØªÙ‡ â€” Ù†Ù‚Ø·Ø© Ø§Ù„Ø±Ø¨Ø· Ø§Ù„Ø¬Ø§Ù‡Ø²Ø© Ù„Ø®Ø¯Ù…Ø© Ø§Ù„ØªØªØ¨Ø¹ Ø§Ù„ØµÙˆØªÙŠ (WP9c). */
  onControlReady?: (handle: MushafControlHandle) => void
  className?: string
}

export function MushafPanel({ rangeStartSurah, rangeStartAyah, onClose, onControlReady, className }: MushafPanelProps) {
  const [startPage, setStartPage] = useState<number | null>(null)
  const controlRef = useRef<MushafControlHandle>(null)
  const resolvedRef = useRef(false)

  const hasRange = rangeStartSurah != null && rangeStartAyah != null
  const pageForQuery = useQuery({
    queryKey: ['mushaf', 'page-for', rangeStartSurah, rangeStartAyah],
    queryFn: () => fetchMushafPageFor(rangeStartSurah as number, rangeStartAyah as number),
    enabled: hasRange,
    staleTime: Infinity,
  })

  useEffect(() => {
    if (resolvedRef.current) return
    if (hasRange) {
      if (pageForQuery.data) {
        resolvedRef.current = true
        setStartPage(pageForQuery.data.page)
      } else if (pageForQuery.isError) {
        // ØªØ¹Ø°Ù‘Ø± ØªØ­Ø¯ÙŠØ¯ ØµÙØ­Ø© Ø§Ù„Ù†Ø·Ø§Ù‚ (Ù†Ø§Ø¯Ø±) â€” Ù†ØªØ±Ø§Ø¬Ø¹ Ù„Ø¢Ø®Ø± ØµÙØ­Ø© Ù…ØªØµÙÙŽÙ‘Ø­Ø© Ø¨Ø¯Ù„ ØªØ¹Ø·ÙŠÙ„ Ø§Ù„Ù„ÙˆØ­Ø© ÙƒÙ„ÙŠØ§Ù‹.
        resolvedRef.current = true
        setStartPage(getLastMushafPage())
      }
    } else {
      resolvedRef.current = true
      setStartPage(getLastMushafPage())
    }
  }, [hasRange, pageForQuery.data, pageForQuery.isError])

  function handleControlAttach(handle: MushafControlHandle | null) {
    controlRef.current = handle
    if (handle) onControlReady?.(handle)
  }

  if (startPage == null) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner tone="lazward" />
      </div>
    )
  }

  return (
    <div className={className}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => controlRef.current?.goToPage(controlRef.current.getPage() - 1)}
            aria-label="Ø§Ù„ØµÙØ­Ø© Ø§Ù„Ø³Ø§Ø¨Ù‚Ø©"
            className="flex h-8 w-8 items-center justify-center rounded-control text-hibr-2 hover:bg-lazward-100/40 hover:text-hibr"
          >
            <IconChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => controlRef.current?.goToPage(controlRef.current.getPage() + 1)}
            aria-label="Ø§Ù„ØµÙØ­Ø© Ø§Ù„ØªØ§Ù„ÙŠØ©"
            className="flex h-8 w-8 items-center justify-center rounded-control text-hibr-2 hover:bg-lazward-100/40 hover:text-hibr"
          >
            <IconChevronLeft className="h-4 w-4" />
          </button>
        </div>
        <span className="text-sm font-medium text-hibr">Ø§Ù„Ù…ØµØ­Ù</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Ø¥ØºÙ„Ø§Ù‚ Ø§Ù„Ù…ØµØ­Ù"
          className="flex h-8 w-8 items-center justify-center rounded-control text-hibr-3 hover:bg-lazward-100/40 hover:text-hibr"
        >
          <IconClose className="h-4 w-4" />
        </button>
      </div>

      <MushafPage
        ref={(handle) => handleControlAttach(handle)}
        initialPage={startPage}
        onPageChange={setLastMushafPage}
      />
    </div>
  )
}

