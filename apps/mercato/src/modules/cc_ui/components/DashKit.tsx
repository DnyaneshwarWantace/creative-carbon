"use client"

import * as React from 'react'
import Link from 'next/link'
import { ArrowRight, type LucideIcon } from 'lucide-react'
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

export function DashCard({ title, icon: Icon, count, tone, action, children }: { title: string; icon: LucideIcon; count?: React.ReactNode; tone?: 'warn' | 'bad' | 'good'; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className={cn('rounded-xl border bg-card shadow-xs', tone === 'bad' ? 'border-status-error-border' : tone === 'warn' ? 'border-status-warning-border' : 'border-border')}>
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <span className={cn('flex h-7 w-7 items-center justify-center rounded-md', tone === 'bad' ? 'bg-status-error-bg text-status-error-icon' : tone === 'warn' ? 'bg-status-warning-bg text-status-warning-icon' : 'bg-muted text-muted-foreground')}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <h2 className="text-sm font-semibold">{title}</h2>
        {count !== undefined ? <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">{count}</span> : null}
        {action ? <span className="ml-auto text-xs">{action}</span> : null}
      </header>
      <div className="p-4">{children}</div>
    </section>
  )
}

export function MeterBar({ value, max, tone }: { value: number; max: number; tone?: 'good' | 'warn' | 'bad' | 'accent' }) {
  const width = max > 0 ? Math.max(2, Math.min(100, Math.round((value / max) * 100))) : 0
  return (
    <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
      <div className={cn('h-full rounded-full', tone === 'good' ? 'bg-status-success-icon' : tone === 'warn' ? 'bg-status-warning-icon' : tone === 'bad' ? 'bg-status-error-icon' : 'cc-bar-accent')} style={{ width: `${width}%` }} />
    </div>
  )
}

export function MoreLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-2 hover:underline">
      {label}
      <ArrowRight className="h-3 w-3" aria-hidden="true" />
    </Link>
  )
}

export function EmptyLine({ text }: { text: string }) {
  return <p className="py-2 text-sm text-muted-foreground">{text}</p>
}
