import type { ModuleCli } from '@open-mercato/shared/modules/registry'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { seedPlantMasters } from './lib/seeds'

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

const seed: ModuleCli = {
  command: 'seed',
  async run(rest) {
    const tenantId = readFlag(rest, ['tenant', 'tenantId'])
    const organizationId = readFlag(rest, ['org', 'organizationId'])
    if (!tenantId || !organizationId) {
      console.error('Usage: mercato cc_production seed --tenant <tenantId> --org <organizationId>')
      return
    }
    const container = await createRequestContainer()
    const em = container.resolve('em') as EntityManager
    await em.transactional((tem) => seedPlantMasters(tem, { tenantId, organizationId }))
    console.log('Plant masters (reactors, dryers, presses, tolerance, known dies) seeded for organization', organizationId)
  },
}

export default [seed]
