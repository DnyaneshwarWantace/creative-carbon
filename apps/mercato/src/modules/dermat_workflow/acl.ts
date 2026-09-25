import { WORKFLOW_DEPARTMENTS } from './lib/defaultStages'

const departmentTitles: Record<string, string> = {
  sales: 'Sales',
  accounts: 'Accounts',
  rnd: 'R&D',
  planning: 'Planning',
  store: 'Store',
  production: 'Production',
  qc: 'Quality Control',
  qa: 'Quality Assurance',
  dispatch: 'Dispatch',
}

export const features = [
  { id: 'dermat_workflow.view', title: 'View order workflow and work queues', module: 'dermat_workflow' },
  {
    id: 'dermat_workflow.stages.manage',
    title: 'Configure workflow stages and their fields',
    module: 'dermat_workflow',
    dependsOn: ['dermat_workflow.view'],
  },
  ...WORKFLOW_DEPARTMENTS.map((department) => ({
    id: `dermat_workflow.department.${department}`,
    title: `Complete ${departmentTitles[department] ?? department} stages`,
    module: 'dermat_workflow',
    dependsOn: ['dermat_workflow.view'],
  })),
]

export default features
