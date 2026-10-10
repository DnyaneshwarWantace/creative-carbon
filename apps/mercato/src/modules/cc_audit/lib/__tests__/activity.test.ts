import type { EntityManager } from '@mikro-orm/postgresql'
import { diffFields, recordActivity } from '../activity'

describe('diffFields', () => {
  const fields = { name: { label: 'Name' }, rate: { label: 'Rate per kg', money: true }, phone: { label: 'Phone' } }

  it('keeps only the fields that changed, with their form labels', () => {
    const changes = diffFields({ name: 'Sunshine', rate: 312, phone: '+919800000000' }, { name: 'Sunshine', rate: 298, phone: '+919800000000' }, fields)
    expect(changes).toEqual([{ field: 'rate', label: 'Rate per kg', from: 312, to: 298, money: true }])
  })

  it('treats empty, null and undefined as the same blank value', () => {
    expect(diffFields({ name: 'A', phone: null }, { name: 'A', phone: '' }, fields)).toEqual([])
  })

  it('ignores fields the update did not send', () => {
    expect(diffFields({ name: 'A', rate: 1 }, { name: 'B' }, fields)).toEqual([{ field: 'name', label: 'Name', from: 'A', to: 'B' }])
  })

  it('on create lists only the fields that have a value', () => {
    expect(diffFields(null, { name: 'A', phone: null }, fields)).toEqual([{ field: 'name', label: 'Name', from: null, to: 'A' }])
  })
})

describe('recordActivity', () => {
  it('adds the row to the caller’s unit of work without flushing, so it commits or rolls back with the change', () => {
    const created: Array<Record<string, unknown>> = []
    const em = {
      create: jest.fn((_entity: unknown, data: Record<string, unknown>) => {
        created.push(data)
        return data
      }),
      persist: jest.fn(),
      flush: jest.fn(),
    } as unknown as EntityManager
    recordActivity(em, { tenantId: 't', organizationId: 'o' }, { recordType: 'vendor', recordId: 'v1', action: 'edited', changes: [], actorName: 'Asha' })
    expect(em.persist).toHaveBeenCalledTimes(1)
    expect((em as unknown as { flush: jest.Mock }).flush).not.toHaveBeenCalled()
    expect(created[0]).toMatchObject({ tenantId: 't', organizationId: 'o', recordType: 'vendor', recordId: 'v1', action: 'edited', changes: null, actorName: 'Asha', source: 'screen', kind: 'change' })
  })
})
