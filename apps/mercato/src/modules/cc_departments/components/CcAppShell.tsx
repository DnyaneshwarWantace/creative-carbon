"use client"

import * as React from 'react'
import { usePathname } from 'next/navigation'
import { ExternalLink } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { AppShell } from '@open-mercato/ui/backend/AppShell'
import { CRM_HOME, ERP_HOME, workspaceOf } from '../lib/workspace'
import { useGranted } from './useGranted'

type AppShellProps = React.ComponentProps<typeof AppShell>

function WorkspaceLink({ workspace }: { workspace: 'erp' | 'crm' }) {
  const t = useT()
  const granted = useGranted()
  if (workspace === 'erp' && !granted.has('cc_crm.view')) return null
  const target = workspace === 'crm' ? ERP_HOME : CRM_HOME
  const label = workspace === 'crm' ? t('cc_departments.workspace.openErp', 'ERP') : t('cc_departments.workspace.openCrm', 'CRM')
  return (
    <a
      href={target}
      target="_blank"
      rel="noopener"
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
      title={workspace === 'crm' ? t('cc_departments.workspace.erpHint', 'Open the ERP in a new tab') : t('cc_departments.workspace.crmHint', 'Open the CRM in a new tab')}
    >
      {label}
      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
    </a>
  )
}

export function CcAppShell({ adminNavApi, rightHeaderSlot, productName, ...props }: AppShellProps) {
  const pathname = usePathname()
  const workspace = workspaceOf(pathname)
  const navApi = adminNavApi ? `/api/cc_departments/nav?workspace=${workspace}` : undefined
  return (
    <AppShell
      {...props}
      productName={workspace === 'crm' ? `${productName ?? ''} · CRM` : productName}
      adminNavApi={navApi}
      rightHeaderSlot={
        <div className="flex items-center gap-2">
          <WorkspaceLink workspace={workspace} />
          {rightHeaderSlot}
        </div>
      }
    />
  )
}

export default CcAppShell
