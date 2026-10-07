import type { EntityManager } from '@mikro-orm/postgresql'
import { Dryer, LoadingTolerance, Mould, Press, Reactor } from '../data/entities'

export type PlantSeedScope = { tenantId: string; organizationId: string }

const REACTORS = ['CCCPL-VES-1', 'CCCPL-VES-2']

const DRYERS: Array<{ code: string; kind: 'dryer' | 'mixer' }> = [
  { code: 'Dryer 1', kind: 'dryer' },
  { code: 'Dryer 2', kind: 'dryer' },
  { code: 'Dryer 3', kind: 'dryer' },
  { code: 'Mixer oven', kind: 'mixer' },
]

const TOLERANCES = [
  { thicknessMm: '25.00', minKg: '117.600', maxKg: '118.200' },
  { thicknessMm: '15.00', minKg: '69.300', maxKg: '69.800' },
  { thicknessMm: '10.00', minKg: '45.800', maxKg: '46.300' },
]

const KNOWN_DIES = ['500', '177', '520', '1138', '1142', '1155', '1206', '1221', '1230', '4306L', '7100', '1140RL', '1401RA', '115N', '16x11x1000']

function pressFor(number: number): { pressType: 'small' | 'big'; usage: 'laminate' | 'moulding' | 'both' } {
  if (number >= 21 && number <= 24) return { pressType: 'big', usage: 'laminate' }
  if (number <= 20) return { pressType: 'small', usage: 'moulding' }
  return { pressType: 'small', usage: 'both' }
}

export async function seedPlantMasters(em: EntityManager, scope: PlantSeedScope) {
  const base = { ...scope, deletedAt: null }
  for (const code of REACTORS) {
    if (await em.findOne(Reactor, { ...base, code })) continue
    em.persist(em.create(Reactor, { ...scope, code }))
  }
  for (const dryer of DRYERS) {
    if (await em.findOne(Dryer, { ...base, code: dryer.code })) continue
    em.persist(em.create(Dryer, { ...scope, ...dryer }))
  }
  for (let number = 1; number <= 25; number += 1) {
    if (await em.findOne(Press, { ...base, number })) continue
    em.persist(em.create(Press, { ...scope, number, ...pressFor(number) }))
  }
  for (const tolerance of TOLERANCES) {
    if (await em.findOne(LoadingTolerance, { ...base, thicknessMm: tolerance.thicknessMm })) continue
    em.persist(em.create(LoadingTolerance, { ...scope, ...tolerance }))
  }
  for (const dieNo of KNOWN_DIES) {
    if (await em.findOne(Mould, { ...base, dieNo })) continue
    em.persist(em.create(Mould, { ...scope, dieNo, mouldType: 'die' }))
  }
  await em.flush()
}
