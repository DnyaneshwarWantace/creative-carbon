import * as React from 'react'
import { cn } from '@open-mercato/shared/lib/utils'
import { Button } from '@open-mercato/ui/primitives/button'

type CodeLinkProps = { code: string; onClick: () => void; className?: string }

export function CodeLink({ code, onClick, className }: CodeLinkProps) {
  return (
    <Button type="button" variant="link" className={cn('h-auto p-0 font-mono', className)} onClick={onClick}>
      {code}
    </Button>
  )
}
