"use client"

import * as React from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Spinner } from '@open-mercato/ui/primitives/spinner'

export type PhoneCard = {
  key: string
  href: string
  overline?: React.ReactNode
  title: React.ReactNode
  badge?: React.ReactNode
  lines?: Array<React.ReactNode | null | undefined | false>
  footer?: Array<React.ReactNode | null | undefined | false>
}

type Props = {
  title: string
  actions?: React.ReactNode
  searchValue: string
  onSearchChange: (value: string) => void
  searchPlaceholder: string
  cards: PhoneCard[]
  loading?: boolean
  empty: React.ReactNode
  page: number
  totalPages: number
  total?: number
  onPageChange: (page: number) => void
  filters?: React.ReactNode
}

export function PhoneList({ title, actions, searchValue, onSearchChange, searchPlaceholder, cards, loading, empty, page, totalPages, total, onPageChange, filters }: Props) {
  const t = useT()
  return (
    <div className="space-y-3 md:hidden">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">
          {title}
          {typeof total === 'number' ? <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">{total}</span> : null}
        </h1>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input type="search" className="pl-9" value={searchValue} onChange={(event) => onSearchChange(event.target.value)} placeholder={searchPlaceholder} aria-label={searchPlaceholder} />
      </div>
      {filters}
      {loading && !cards.length ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : !cards.length ? (
        empty
      ) : (
        <ul className={cn('space-y-2', loading && 'opacity-60')}>
          {cards.map((card) => {
            const lines = (card.lines ?? []).filter(Boolean)
            const footer = (card.footer ?? []).filter(Boolean)
            return (
              <li key={card.key}>
                <Link href={card.href} className="block rounded-xl border bg-card p-3.5 shadow-xs active:bg-muted/60">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      {card.overline ? <p className="truncate font-mono text-xs text-muted-foreground">{card.overline}</p> : null}
                      <p className="text-sm font-semibold leading-snug">{card.title}</p>
                    </div>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {card.badge}
                      <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    </span>
                  </div>
                  {lines.length ? (
                    <div className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                      {lines.map((line, index) => (
                        <p key={index} className="truncate">
                          {line}
                        </p>
                      ))}
                    </div>
                  ) : null}
                  {footer.length ? (
                    <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-2 text-xs text-muted-foreground">
                      {footer.map((item, index) => (
                        <span key={index} className="tabular-nums">
                          {item}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
      {totalPages > 1 ? (
        <div className="flex items-center justify-between pt-1">
          <Button type="button" variant="outline" size="sm" className="h-9" disabled={page <= 1 || loading} onClick={() => onPageChange(page - 1)}>
            <ChevronLeft className="mr-1 h-4 w-4" aria-hidden="true" />
            {t('cc_ui.phoneList.prev', 'Previous')}
          </Button>
          <span className="text-xs tabular-nums text-muted-foreground">{t('cc_ui.phoneList.page', 'Page {page} of {pages}', { page, pages: totalPages })}</span>
          <Button type="button" variant="outline" size="sm" className="h-9" disabled={page >= totalPages || loading} onClick={() => onPageChange(page + 1)}>
            {t('cc_ui.phoneList.next', 'Next')}
            <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      ) : null}
    </div>
  )
}

export default PhoneList
