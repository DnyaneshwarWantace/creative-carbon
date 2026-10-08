"use client"

import * as React from 'react'
import Link from 'next/link'
import { ShieldAlert } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Button } from '@open-mercato/ui/primitives/button'

export function WorkspaceDenied({ home }: { home: string | null }) {
  const t = useT()
  return (
    <div className="flex min-h-96 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-status-warning-bg text-status-warning-text">
        <ShieldAlert className="h-6 w-6" aria-hidden="true" />
      </span>
      <div className="max-w-md space-y-1">
        <h1 className="text-lg font-semibold">{t('cc_departments.workspace.deniedTitle', 'You do not have access to this part')}</h1>
        <p className="text-sm text-muted-foreground">{t('cc_departments.workspace.deniedBody', 'Ask your administrator to give you access if you need it.')}</p>
      </div>
      <div className="flex gap-2">
        {home ? (
          <Button asChild>
            <Link href={home}>{t('cc_departments.workspace.goHome', 'Go to my start page')}</Link>
          </Button>
        ) : null}
        <Button asChild variant="outline">
          <a href="/api/auth/logout">{t('cc_departments.workspace.signOut', 'Sign out')}</a>
        </Button>
      </div>
    </div>
  )
}

export default WorkspaceDenied
