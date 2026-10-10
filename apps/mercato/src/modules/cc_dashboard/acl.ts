export const features = [
  { id: 'cc_dashboard.view', title: 'See the overview dashboard', module: 'cc_dashboard' },
  { id: 'cc_dashboard.my_work', title: 'See my pending work', module: 'cc_dashboard' },
  { id: 'cc_dashboard.everyone', title: "See everyone's pending work", module: 'cc_dashboard', dependsOn: ['cc_dashboard.my_work'] },
  { id: 'cc_dashboard.golive', title: 'Run the go-live checklist (cutover date, on-site ticks)', module: 'cc_dashboard', dependsOn: ['cc_dashboard.view'] },
]

export default features
