import { featureBatches } from '../useGranted'

describe('rights check batches', () => {
  it('never asks the server for more than 50 rights at once', () => {
    const features = Array.from({ length: 123 }, (_, index) => `feature.${index}`)
    const batches = featureBatches(features)
    expect(batches.map((batch) => batch.length)).toEqual([50, 50, 23])
    expect(batches.flat()).toEqual(features)
  })
})
