"use client"

import * as React from 'react'
import { cn } from '@open-mercato/shared/lib/utils'
import { Spinner } from '@open-mercato/ui/primitives/spinner'

export function PageLoading({ label, className, inline = false }: { label?: string; className?: string; inline?: boolean }) {
  return (
    <div role="status" aria-live="polite" className={cn('flex w-full flex-col items-center justify-center gap-3 text-muted-foreground', inline ? 'py-10' : 'min-h-96 py-16', className)}>
      <Spinner className="h-6 w-6 text-primary" />
      {label ? <span className="text-sm">{label}</span> : null}
    </div>
  )
}

export default PageLoading
