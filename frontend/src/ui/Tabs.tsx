// شريط تبويبات أفقي: حد سفلي رفيع يمتد على كل الشريط، والتبويب النشط يعلوه خط سفلي
// lazward-700 بعرض التبويب. لا يُصدَّر من ui/index.ts عمداً (استورد بمسار الملف مباشرة).

import { cx } from './utils'

export interface TabItem {
  id: string
  label: string
}

export interface TabsProps {
  tabs: TabItem[]
  activeId: string
  onChange: (id: string) => void
  className?: string
}

export function Tabs({ tabs, activeId, onChange, className }: TabsProps) {
  return (
    <div role="tablist" className={cx('mb-6 flex gap-1 overflow-x-auto border-b border-khatt', className)}>
      {tabs.map((tab) => {
        const active = tab.id === activeId
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={cx(
              'relative -mb-px shrink-0 px-4 py-2.5 text-base font-medium transition-colors duration-150',
              active ? 'text-lazward-700' : 'text-hibr-2 hover:text-hibr',
            )}
          >
            {tab.label}
            {active && <span aria-hidden="true" className="absolute inset-x-0 -bottom-px h-[2px] bg-lazward-700" />}
          </button>
        )
      })}
    </div>
  )
}
