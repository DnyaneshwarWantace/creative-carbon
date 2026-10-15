"use client"

import * as React from 'react'
import Link from 'next/link'
import { cn } from '@open-mercato/shared/lib/utils'

export function DashHeader({ overline, title, lede, actions }: { overline: React.ReactNode; title: React.ReactNode; lede?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="cc-band flex flex-wrap items-end justify-between gap-4 px-5 py-4">
      <div className="min-w-0">
        <p className="cc-overline">{overline}</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">{title}</h1>
        {lede ? <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{lede}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}

export type KpiItem = { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: 'good' | 'warn' | 'bad'; href?: string }

const EDGE: Record<NonNullable<KpiItem['tone']>, string> = {
  good: 'border-l-status-success-icon',
  warn: 'border-l-status-warning-icon',
  bad: 'border-l-status-error-icon',
}

export function KpiStrip({ items, className }: { items: KpiItem[]; className?: string }) {
  return (
    <dl className={cn('grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5', className)}>
      {items.map((item) => {
        const body = (
          <div className={cn('cc-tile h-full border-l-4', item.tone ? EDGE[item.tone] : 'border-l-border', item.href && 'transition-colors hover:border-foreground/40')}>
            <dt className="truncate text-xs text-muted-foreground">{item.label}</dt>
            <dd className="cc-figure mt-0.5 text-3xl">{item.value}</dd>
            {item.hint ? <dd className="truncate text-xs text-muted-foreground">{item.hint}</dd> : null}
          </div>
        )
        return item.href ? (
          <Link key={item.label} href={item.href} className="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {body}
          </Link>
        ) : (
          <div key={item.label}>{body}</div>
        )
      })}
    </dl>
  )
}
