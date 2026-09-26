import type { PageRouteMiddleware } from '@open-mercato/shared/modules/middleware/page'

export const middleware: PageRouteMiddleware[] = [
  {
    id: 'dermat_dashboard.home',
    mode: 'backend',
    target: '/backend',
    run: () => ({ action: 'redirect', location: '/backend/overview' }),
  },
]

export default middleware
