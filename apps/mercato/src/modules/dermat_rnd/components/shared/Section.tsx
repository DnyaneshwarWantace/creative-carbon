import * as React from 'react'
import { cn } from '@open-mercato/shared/lib/utils'

type SectionProps = {
  title: string
  hint?: string
  actions?: React.ReactNode
  className?: string
  bodyClassName?: string
  children: React.ReactNode
}

export function Section({ title, hint, actions, className, bodyClassName, children }: SectionProps) {
  return (
    <section className={cn('overflow-hidden rounded-lg border bg-card', className)}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-4 py-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
      <div className={cn('p-4', bodyClassName)}>{children}</div>
    </section>
  )
}
