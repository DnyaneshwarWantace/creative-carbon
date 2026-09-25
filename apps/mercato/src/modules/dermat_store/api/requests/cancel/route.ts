import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { cancelSchema } from '../../../data/validators'
import { cancelRequest } from '../../../lib/service'
import { storeAction } from '../../../lib/action'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['dermat_store.request'] },
}

const POST = storeAction(cancelSchema, 'Write why it is cancelled', (ctx, request, input) => cancelRequest(ctx, request, input.note))

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat Store',
  summary: 'Cancel a store request',
  methods: {
    POST: {
      summary: 'Cancel a request the store has not issued anything on',
      tags: ['Dermat Store'],
      requestBody: { schema: cancelSchema },
      responses: [{ status: 200, description: 'The updated request', schema: z.object({ id: z.string() }).passthrough() }],
      errors: [{ status: 409, description: 'Material already issued, or the request changed' }],
    },
  },
}

export { POST }
