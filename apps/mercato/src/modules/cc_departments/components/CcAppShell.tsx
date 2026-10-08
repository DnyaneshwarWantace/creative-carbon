"use client"

import * as React from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { ExternalLink } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { AppShell } from '@open-mercato/ui/backend/AppShell'
import { CRM_HOME, ERP_HOME, allowedOn, homeFor, pathKind, workspaceOf, type Workspace, type WorkspaceAccess } from '../lib/workspace'
import { WorkspaceDenied } from './WorkspaceDenied'

type AppShellProps = React.ComponentProps<typeof AppShell>

function WorkspaceLink({ workspace, access }: { workspace: Workspace; access: WorkspaceAccess }) {
  const t = useT()
  const other: Workspace = workspace === 'crm' ? 'erp' : 'crm'
  if (!access[other]) return null
  const target = other === 'erp' ? ERP_HOME : CRM_HOME
  return (
    <a
      href={target}
      target="_blank"
      rel="noopener"
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
      title={other === 'erp' ? t('cc_departments.workspace.erpHint', 'Open the ERP in a new tab') : t('cc_departments.workspace.crmHint', 'Open the CRM in a new tab')}
    >
      {other === 'erp' ? t('cc_departments.workspace.openErp', 'ERP') : t('cc_departments.workspace.openCrm', 'CRM')}
      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
    </a>
  )
}

export function CcAppShell({ adminNavApi, rightHeaderSlot, productName, children, workspaceAccess, ...props }: AppShellProps & { workspaceAccess: WorkspaceAccess }) {
  const pathname = usePathname()
  const router = useRouter()
  const access = workspaceAccess
  const workspace = workspaceOf(pathname, access)
  const kind = pathKind(pathname)
  const allowed = allowedOn(kind, access)
  const home = homeFor(access)
  const redirectTo = !allowed && home && home !== pathname ? home : null

  React.useEffect(() => {
    if (redirectTo) router.replace(redirectTo)
  }, [redirectTo, router])

  return (
    <AppShell
      {...props}
      productName={workspace === 'crm' ? `${productName ?? ''} · CRM` : productName}
      logo={{ src: '/cc-logo.png', alt: 'Creative Carbon Composites', preserveAspectRatio: true }}
      adminNavApi={adminNavApi ? `/api/cc_departments/nav?workspace=${workspace}` : undefined}
      rightHeaderSlot={
        <div className="flex items-center gap-2">
          <WorkspaceLink workspace={workspace} access={access} />
          {rightHeaderSlot}
        </div>
      }
    >
      {allowed ? children : redirectTo ? null : <WorkspaceDenied home={home} />}
    </AppShell>
  )
}

export default CcAppShell
