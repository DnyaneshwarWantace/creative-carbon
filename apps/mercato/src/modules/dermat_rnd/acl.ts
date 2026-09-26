export const features = [
  { id: 'dermat_rnd.view', title: 'See R&D requests and samples', module: 'dermat_rnd' },
  { id: 'dermat_rnd.request', title: 'Raise R&D requests and record client feedback', module: 'dermat_rnd', dependsOn: ['dermat_rnd.view'] },
  { id: 'dermat_rnd.manage', title: 'Work R&D requests: start, make and send samples, approve or drop', module: 'dermat_rnd', dependsOn: ['dermat_rnd.view'] },
]

export default features
