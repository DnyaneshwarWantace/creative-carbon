import type { ModuleCli } from '@open-mercato/shared/modules/registry'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { sendDigests } from './lib/digest'
import { sweepOverdueStages } from '../dermat_orders/lib/notify'

function readFlag(args: string[], names: string[]): string {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    for (const name of names) {
      if (arg === `--${name}` && args[index + 1]) return args[index + 1]
      if (arg.startsWith(`--${name}=`)) return arg.slice(name.length + 3)
    }
  }
  return ''
}

const sendDigest: ModuleCli = {
  command: 'send-digest',
  async run(rest) {
    const tenantId = readFlag(rest, ['tenant', 'tenantId'])
    const organizationId = readFlag(rest, ['org', 'organizationId'])
    const baseUrl = readFlag(rest, ['base-url']) || process.env.APP_URL || 'http://localhost:3000'
    const dryRun = rest.includes('--dry-run')
    if (!tenantId || !organizationId) {
      console.error('Usage: mercato dermat_dashboard send-digest --tenant <tenantId> --org <organizationId> [--base-url https://erp.example.com] [--dry-run]')
      return
    }
    const container = await createRequestContainer()
    const em = (container.resolve('em') as EntityManager).fork()
    const results = await sendDigests({ em, tenantId, organizationId }, { dryRun, baseUrl })
    if (!results.length) console.log('Nobody has assigned pending steps.')
    for (const result of results) {
      console.log(`${result.sent ? 'SENT ' : dryRun && !result.error ? 'WOULD SEND ' : 'NOT SENT '}${result.name} <${result.email ?? 'no email'}> · ${result.steps} steps${result.error ? ` · ${result.error}` : ''}`)
    }
  },
}

const overdueAlerts: ModuleCli = {
  command: 'overdue-alerts',
  async run(rest) {
    const tenantId = readFlag(rest, ['tenant', 'tenantId'])
    const organizationId = readFlag(rest, ['org', 'organizationId'])
    if (!tenantId || !organizationId) {
      console.error('Usage: mercato dermat_dashboard overdue-alerts --tenant <tenantId> --org <organizationId>')
      return
    }
    const container = await createRequestContainer()
    const em = (container.resolve('em') as EntityManager).fork()
    const sent = await sweepOverdueStages({ container, em, tenantId, organizationId } as Parameters<typeof sweepOverdueStages>[0], { force: true })
    console.log(sent ? `Sent ${sent} overdue alert(s).` : 'No stage is over its day limit (or everyone was already told).')
  },
}

const commands = [sendDigest, overdueAlerts]

export default commands
