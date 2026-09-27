export const features = [
  { id: 'dermat_quality.view', title: 'View QC checks and rules', module: 'dermat_quality' },
  { id: 'dermat_quality.chemical', title: 'Record and approve chemical QC', module: 'dermat_quality', dependsOn: ['dermat_quality.view'] },
  { id: 'dermat_quality.micro', title: 'Record and approve micro QC', module: 'dermat_quality', dependsOn: ['dermat_quality.view'] },
  { id: 'dermat_quality.rules', title: 'Manage QC rules', module: 'dermat_quality', dependsOn: ['dermat_quality.view'] },
  { id: 'dermat_quality.documents', title: 'Issue and revise QA documents (SOPs, formats, specifications)', module: 'dermat_quality', dependsOn: ['dermat_quality.view'] },
]

export default features
