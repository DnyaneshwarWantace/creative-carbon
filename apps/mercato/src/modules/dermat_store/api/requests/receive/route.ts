import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { receiveSchema } from '../../../data/validators'
import { receiveMaterial } from '../../../lib/service'
import { storeAction } from '../../../lib/action'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['dermat_store.request'] },
}

const POST = storeAction(receiveSchema, 'Invalid request', (ctx, request, input) => receiveMaterial(ctx, request, input.note ?? null, input.lines))

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat Store',
  summary: 'Production confirms it received the material',
  methods: {
    POST: {
      summary: 'Confirm what arrived. Send lines with the received quantity when less arrived than was sent; the shortfall goes back to store stock and the store sees it must send the rest.',
      tags: ['Dermat Store'],
      requestBody: { schema: receiveSchema },
      responses: [{ status: 200, description: 'The updated request', schema: z.object({ id: z.string() }).passthrough() }],
      errors: [{ status: 409, description: 'Nothing waiting to be received, or the request changed' }],
    },
  },
}

export { POST }
