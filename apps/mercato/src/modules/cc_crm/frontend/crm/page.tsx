import { redirect } from 'next/navigation'
import { getAuthFromCookies } from '@open-mercato/shared/lib/auth/server'

export default async function CrmEntryPage() {
  const auth = await getAuthFromCookies()
  if (auth?.sub) redirect('/backend/crm')
  redirect(`/login?redirect=${encodeURIComponent('/backend/crm')}`)
}
