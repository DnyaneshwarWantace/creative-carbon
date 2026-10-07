import * as React from 'react'
import { cn } from '@open-mercato/shared/lib/utils'
import { Label } from '@open-mercato/ui/primitives/label'

type FieldProps = { id: string; label: string; hint?: string; className?: string; children: React.ReactNode }

export function Field({ id, label, hint, className, children }: FieldProps) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}
