export const features = [
  { id: 'dermat_dashboard.view', title: 'See the overview dashboard', module: 'dermat_dashboard' },
  { id: 'dermat_dashboard.my_work', title: 'See my pending work', module: 'dermat_dashboard' },
  { id: 'dermat_dashboard.everyone', title: "See everyone's pending work", module: 'dermat_dashboard', dependsOn: ['dermat_dashboard.my_work'] },
]

export default features
