import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { returnSchema } from '../../../data/validators'
import { returnMaterial } from '../../../lib/service'
import { storeAction } from '../../../lib/action'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['dermat_store.request'] },
}

const POST = storeAction(returnSchema, 'Enter the quantity to return and why', (ctx, request, input) => returnMaterial(ctx, request, input))

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat Store',
  summary: 'Return leftover material to the store',
  methods: {
    POST: {
      summary: 'Move stock from PRODUCTION back to the RM / PM store, per batch',
      tags: ['Dermat Store'],
      requestBody: { schema: returnSchema },
      responses: [{ status: 200, description: 'The updated request', schema: z.object({ id: z.string() }).passthrough() }],
      errors: [{ status: 409, description: 'More than production holds, request closed, or the request changed' }],
    },
  },
}

export { POST }
