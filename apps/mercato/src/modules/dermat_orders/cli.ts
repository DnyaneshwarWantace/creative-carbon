import type { ModuleCli } from '@open-mercato/shared/modules/registry'
import { spawn } from 'child_process'
import path from 'path'

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

const seedTransactions: ModuleCli = {
  command: 'seed-transactions',
  async run(rest) {
    const tenantId = readFlag(rest, ['tenant', 'tenantId'])
    const organizationId = readFlag(rest, ['org', 'organizationId'])
    
    const scriptPath = path.resolve(process.cwd(), 'scripts/seed-dermat-transactions.js')
    const args = [scriptPath]
    if (tenantId) args.push('--tenant', tenantId)
    if (organizationId) args.push('--org', organizationId)

    await new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, args, { stdio: 'inherit' })
      child.on('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error(`Seed script exited with code ${code}`))
      })
    })
  },
}

export default [seedTransactions]
