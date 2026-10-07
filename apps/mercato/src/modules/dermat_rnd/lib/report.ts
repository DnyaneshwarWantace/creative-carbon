import type { OrderContext } from '../../dermat_orders/lib/server'
import { RdRequest, RdTrial } from '../data/entities'

function monthBounds(month: string) {
  const [year, value] = month.split('-').map(Number)
  const start = new Date(Date.UTC(year, value - 1, 1))
  const end = new Date(Date.UTC(year, value, 1))
  return { start, end, startDay: start.toISOString().slice(0, 10), endDay: end.toISOString().slice(0, 10) }
}

export function currentMonth(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).slice(0, 7)
}

export async function buildReport(ctx: OrderContext, month: string) {
  const scope = { tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null }
  const { start, end, startDay, endDay } = monthBounds(month)
  const trials = await ctx.em.find(RdTrial, { ...scope, batchDate: { $gte: startDay, $lt: endDay } }, { orderBy: { batchDate: 'asc' } })
  const raised = await ctx.em.count(RdRequest, { ...scope, createdAt: { $gte: start, $lt: end } })
  const requests = await ctx.em.find(RdRequest, { ...scope, updatedAt: { $gte: start } }, { fields: ['id', 'rounds', 'history'] })
  const samplesSent = requests.reduce((sum, request) => sum + (request.rounds ?? []).filter((round) => round.sentOn && round.sentOn >= startDay && round.sentOn < endDay).length, 0)
  const approvedFormulas = requests.reduce((sum, request) => sum + (request.history ?? []).filter((entry) => entry.action === 'formula_approved' && entry.at >= start.toISOString() && entry.at < end.toISOString()).length, 0)

  const byChemist = new Map<string, { chemist: string; trials: number; passed: number; failed: number; approved: number; pending: number }>()
  for (const trial of trials) {
    const chemist = trial.chemistName ?? '—'
    const row = byChemist.get(chemist) ?? { chemist, trials: 0, passed: 0, failed: 0, approved: 0, pending: 0 }
    row.trials += 1
    if (trial.status === 'approved') row.approved += 1
    if (trial.status === 'passed' || trial.status === 'approved') row.passed += 1
    else if (trial.status === 'failed' || trial.status === 'rejected') row.failed += 1
    else row.pending += 1
    byChemist.set(chemist, row)
  }

  const trend = await ctx.em.getConnection().execute<Array<{ month: string; total: string }>>(
    `select substr(batch_date, 1, 7) as month, count(*) as total from dermat_rnd_trials
      where tenant_id = ? and organization_id = ? and deleted_at is null and batch_date is not null
        and batch_date >= to_char((date_trunc('month', ?::date) - interval '11 months'), 'YYYY-MM-DD') and batch_date < ?
      group by 1 order by 1`,
    [ctx.tenantId, ctx.organizationId, startDay, endDay],
  )

  const passed = trials.filter((trial) => trial.status === 'passed' || trial.status === 'approved').length
  const decided = trials.filter((trial) => ['passed', 'approved', 'failed', 'rejected'].includes(trial.status)).length
  return {
    month,
    totals: { trials: trials.length, passed, failed: decided - passed, pending: trials.length - decided, passRate: decided ? Math.round((passed / decided) * 100) : null, requestsRaised: raised, samplesSent, approvedFormulas },
    byChemist: Array.from(byChemist.values()).sort((left, right) => right.trials - left.trials),
    trend: trend.map((row) => ({ month: row.month, trials: Number(row.total) })),
    trials: trials.map((trial) => ({ id: trial.id, requestId: trial.requestId, code: trial.code, batchDate: trial.batchDate ?? null, chemistName: trial.chemistName ?? null, status: trial.status, stabilityStatus: trial.stabilityStatus })),
  }
}
