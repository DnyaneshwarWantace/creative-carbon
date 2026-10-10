import { ACCESS_AREAS } from '../access'

describe('access areas', () => {
  it('list the Phase A rights so they can be given on the Access page', () => {
    const features = ACCESS_AREAS.flatMap((area) => area.abilities.map((ability) => ability.feature))
    for (const feature of ['cc_accounts.credit_note', 'cc_crm.merge', 'cc_production.quality.release', 'cc_store.approve', 'cc_audit.view']) {
      expect(features).toContain(feature)
    }
  })

  it('never list a right twice', () => {
    const features = ACCESS_AREAS.flatMap((area) => area.abilities.map((ability) => ability.feature))
    expect(new Set(features).size).toBe(features.length)
  })
})
