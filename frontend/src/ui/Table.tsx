// جدول حقيقي (صفوف/أعمدة) بروح السجل الورقي المنضبط: فواصل رفيعة لا بطاقات متكررة.
// مكونات مركّبة: Table > TableHead/TableBody > TableRow > TableHeaderCell/TableCell.
// TableEmptyRow يعرض EmptyState داخل صف واحد ممتد على كل الأعمدة عند عدم وجود بيانات.

import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react'

import { EmptyState } from './EmptyState'
import { cx } from './utils'

export function Table({ className, children, ...rest }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto rounded-card border border-khatt bg-waraq-raised">
      <table className={cx('w-full border-collapse text-base', className)} {...rest}>
        {children}
      </table>
    </div>
  )
}

export function TableHead({ className, children, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className={cx('border-b border-khatt', className)} {...rest}>
      {children}
    </thead>
  )
}

export function TableBody({ className, children, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody className={className} {...rest}>
      {children}
    </tbody>
  )
}

export function TableRow({ className, children, ...rest }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={cx('border-b border-khatt last:border-b-0 hover:bg-lazward-100/40', className)} {...rest}>
      {children}
    </tr>
  )
}

export function TableHeaderCell({ className, children, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={cx('px-4 py-2.5 text-start text-sm font-semibold text-hibr-2', className)}
      {...rest}
    >
      {children}
    </th>
  )
}

export function TableCell({ className, children, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cx('px-4 py-3 text-hibr tabular-nums', className)} {...rest}>
      {children}
    </td>
  )
}

export function TableEmptyRow({ colSpan, message, action }: { colSpan: number; message: string; action?: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="p-0">
        <EmptyState message={message} action={action} className="rounded-none border-0" />
      </td>
    </tr>
  )
}
