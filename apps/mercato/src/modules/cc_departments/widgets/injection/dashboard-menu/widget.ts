import { InjectionPosition } from '@open-mercato/shared/modules/widgets/injection-position'
import type { InjectionMenuItemWidget } from '@open-mercato/shared/modules/widgets/injection'

/**
 * The Operations dashboard at /backend has no module page, so it never appears
 * in the auto-discovered sidebar nav — the only way in was clicking the brand
 * logo. This adds a "Dashboard" entry to the main sidebar.
 *
 * An injected item with no groupId merges into whichever built-in group happens
 * to occupy index 0 (mergeSidebarGroupsWithInjected in AppShell.tsx) — that
 * landed this under "Raw Material Master" here, which made no sense. Giving it
 * its own groupId makes it its own standalone section instead of hijacking an
 * unrelated module's group.
 */
const widget: InjectionMenuItemWidget = {
  metadata: {
    id: 'cc_departments.injection.dashboard-menu',
    title: 'Dashboard sidebar link',
  },
  menuItems: [
    {
      id: 'cc-dashboard-link',
      labelKey: 'dashboard.nav.title',
      label: 'Dashboard',
      icon: 'LayoutDashboard',
      href: '/backend',
      groupId: 'cc-dashboard',
      groupLabelKey: 'dashboard.nav.groupTitle',
      groupLabel: 'Dashboard',
      placement: { position: InjectionPosition.First },
    },
  ],
}

export default widget
