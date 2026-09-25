export const features = [
  { id: 'dermat_planning.view', title: 'View the planning board and reservations', module: 'dermat_planning' },
  { id: 'dermat_planning.reserve', title: 'Reserve, clear and move stock reservations; save plans', module: 'dermat_planning', dependsOn: ['dermat_planning.view'] },
]

export default features
