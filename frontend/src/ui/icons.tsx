// أيقونات SVG مرسومة يدوياً بأسلوب stroke موحّد (1.5px، حواف مستديرة) — لا مكتبة أيقونات خارجية.
// كل أيقونة تقبل className لتحديد الحجم واللون عبر currentColor.

import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export function IconDashboard(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </svg>
  )
}

export function IconStudents(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 20c0-3.038 2.462-5.5 5.5-5.5s5.5 2.462 5.5 5.5" />
      <circle cx="17" cy="7.5" r="2.25" />
      <path d="M15.5 14.75c2.6.28 4.5 2.35 4.5 5.25" />
    </svg>
  )
}

export function IconCircles(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="8.25" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconSessions(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 12h3l1.6-4.8L11 17l2-9.5 1.6 4.8H21" />
    </svg>
  )
}

export function IconSettings(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="2.75" />
      <path d="M12 3.75v2.1M12 18.15v2.1M20.25 12h-2.1M5.85 12h-2.1M17.66 6.34l-1.48 1.48M7.82 16.18l-1.48 1.48M17.66 17.66l-1.48-1.48M7.82 7.82L6.34 6.34" />
    </svg>
  )
}

export function IconMenu(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 6.5h16M4 12h16M4 17.5h16" />
    </svg>
  )
}

export function IconClose(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

export function IconChevronDown(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6 9.5l6 6 6-6" />
    </svg>
  )
}

export function IconEye(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  )
}

export function IconEyeOff(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3.5 3.5l17 17" />
      <path d="M10.6 5.72A9.8 9.8 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a15.7 15.7 0 0 1-3.44 4.24M6.6 6.98C4.16 8.53 2.5 12 2.5 12s3.5 6.5 9.5 6.5c1.1 0 2.11-.2 3.03-.55" />
      <path d="M9.9 10.1a2.5 2.5 0 0 0 3.53 3.53" />
    </svg>
  )
}

export function IconCheckCircle(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="8.25" />
      <path d="M8.25 12.25l2.5 2.5 5-5.5" />
    </svg>
  )
}

export function IconAlertCircle(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="8.25" />
      <path d="M12 8v4.5" />
      <circle cx="12" cy="15.75" r="0.1" fill="currentColor" stroke="currentColor" strokeWidth={2} />
    </svg>
  )
}

export function IconInbox(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3.5 12.5h4.6l1.3 2.2h5.2l1.3-2.2h4.6" />
      <path d="M5.3 6.5h13.4a1.6 1.6 0 0 1 1.58 1.36l1.12 7.14a1.6 1.6 0 0 1-1.58 1.85H5.08a1.6 1.6 0 0 1-1.58-1.85l1.12-7.14A1.6 1.6 0 0 1 5.3 6.5Z" />
    </svg>
  )
}

export function IconUser(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M4.5 20c0-3.87 3.13-7 7.5-7s7.5 3.13 7.5 7" />
    </svg>
  )
}

export function IconPlus(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 5.5v13M5.5 12h13" />
    </svg>
  )
}

export function IconSearch(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M19.5 19.5l-4.2-4.2" />
    </svg>
  )
}

export function IconMic(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />
      <path d="M12 18v3M9 21h6" />
    </svg>
  )
}

export function IconTrash(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4.5 7h15M9.5 7V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v2M7 7l.7 12.1a1.8 1.8 0 0 0 1.8 1.65h5a1.8 1.8 0 0 0 1.8-1.65L17 7" />
      <path d="M10.2 11v6M13.8 11v6" />
    </svg>
  )
}

export function IconArrowUp(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 19V5M6 10.5 12 5l6 5.5" />
    </svg>
  )
}

export function IconArrowDown(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 5v14M18 13.5 12 19l-6-5.5" />
    </svg>
  )
}

export function IconPlay(props: IconProps) {
  return (
    <svg {...base} fill="currentColor" stroke="none" {...props}>
      <path d="M7.5 4.8c0-.98 1.06-1.6 1.92-1.11l10.2 5.83a1.27 1.27 0 0 1 0 2.2L9.42 17.55c-.86.49-1.92-.13-1.92-1.11V4.8Z" />
    </svg>
  )
}

export function IconPause(props: IconProps) {
  return (
    <svg {...base} fill="currentColor" stroke="none" {...props}>
      <rect x="6.5" y="4.5" width="4" height="15" rx="1.3" />
      <rect x="13.5" y="4.5" width="4" height="15" rx="1.3" />
    </svg>
  )
}

export function IconSkipBack(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M17.5 6 10 12l7.5 6V6Z" fill="currentColor" stroke="none" />
      <path d="M6.5 6v12" />
    </svg>
  )
}

export function IconSkipForward(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6.5 6 14 12l-7.5 6V6Z" fill="currentColor" stroke="none" />
      <path d="M17.5 6v12" />
    </svg>
  )
}

export function IconCopy(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="8.5" y="8.5" width="11.5" height="11.5" rx="1.5" />
      <path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H5.5A1.5 1.5 0 0 0 4 6v8.5a1.5 1.5 0 0 0 1.5 1.5H8" />
    </svg>
  )
}

export function IconRefresh(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4.5 12a7.5 7.5 0 0 1 12.68-5.42M19.5 12a7.5 7.5 0 0 1-12.68 5.42" />
      <path d="M17.2 4.9v3.8h-3.8M6.8 19.1v-3.8h3.8" />
    </svg>
  )
}

export function IconLogout(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M9 6.5V5a1.5 1.5 0 0 1 1.5-1.5h6A1.5 1.5 0 0 1 18 5v14a1.5 1.5 0 0 1-1.5 1.5h-6A1.5 1.5 0 0 1 9 19v-1.5" />
      <path d="M3.5 12h9.25M9.25 8.25 5.5 12l3.75 3.75" />
    </svg>
  )
}
