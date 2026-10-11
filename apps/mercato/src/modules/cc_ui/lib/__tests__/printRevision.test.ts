import { revisionTag, supersededBlock } from '../printRevision'

describe('revision marks on printed documents', () => {
  it('shows Rev n from the second revision on, or when asked', () => {
    expect(revisionTag({ revision: 1 })).toBe('')
    expect(revisionTag({ revision: 2 })).toContain('Rev 2')
    expect(revisionTag({ revision: 1, showRevision: true })).toContain('Rev 1')
  })

  it('marks an old revision as superseded by the current one', () => {
    expect(supersededBlock({ revision: 1 })).toBe('')
    const block = supersededBlock({ revision: 1, supersededBy: 3 })
    expect(block).toContain('SUPERSEDED')
    expect(block).toContain('Rev 3')
    expect(revisionTag({ revision: 1, supersededBy: 3 })).toContain('Rev 1')
  })
})
