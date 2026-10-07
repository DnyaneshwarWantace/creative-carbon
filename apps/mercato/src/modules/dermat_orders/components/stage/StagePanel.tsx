import * as React from 'react'
import { cn } from '@open-mercato/shared/lib/utils'

type StagePanelProps = { title: string; icon?: React.ReactNode; className?: string; bodyClassName?: string; children: React.ReactNode }

export function StagePanel({ title, icon, className, bodyClassName, children }: StagePanelProps) {
  return (
    <section className={cn('overflow-hidden rounded-lg border bg-card', className)}>
      <h2 className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2 text-sm font-semibold">
        {icon}
        {title}
      </h2>
      <div className={bodyClassName}>{children}</div>
    </section>
  )
}
