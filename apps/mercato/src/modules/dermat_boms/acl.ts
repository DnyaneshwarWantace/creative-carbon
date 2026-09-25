export const features = [
  { id: 'dermat_boms.view', title: 'View BOMs', module: 'dermat_boms' },
  { id: 'dermat_boms.manage', title: 'Create and edit BOMs', module: 'dermat_boms', dependsOn: ['dermat_boms.view'] },
  { id: 'dermat_boms.approve', title: 'Approve BOMs', module: 'dermat_boms', dependsOn: ['dermat_boms.view'] },
]

export default features
