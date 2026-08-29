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

export function IconLogout(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M9 6.5V5a1.5 1.5 0 0 1 1.5-1.5h6A1.5 1.5 0 0 1 18 5v14a1.5 1.5 0 0 1-1.5 1.5h-6A1.5 1.5 0 0 1 9 19v-1.5" />
      <path d="M3.5 12h9.25M9.25 8.25 5.5 12l3.75 3.75" />
    </svg>
  )
}
