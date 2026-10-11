export type RevisionPrint = { revision?: number | null; supersededBy?: number | null; showRevision?: boolean }

export const REVISION_CSS = `.rev{display:inline-block;margin-left:6px;padding:1px 6px;border:1px solid #1c1917;border-radius:4px;font-size:11px;font-weight:700;vertical-align:middle}
  .superseded-banner{margin:10px 0;padding:6px 10px;border:2px solid #b91c1c;color:#b91c1c;font-weight:700;text-align:center;letter-spacing:.08em;text-transform:uppercase}
  .superseded-mark{position:fixed;top:40%;left:0;right:0;text-align:center;font-size:72px;font-weight:800;color:rgba(185,28,28,.12);transform:rotate(-24deg);pointer-events:none;z-index:0}`

export function revisionTag(input: RevisionPrint): string {
  const revision = input.revision ?? 1
  return revision > 1 || input.supersededBy != null || input.showRevision ? `<span class="rev">Rev ${input.revision ?? 1}</span>` : ''
}

export function supersededBlock(input: RevisionPrint): string {
  if (!input.supersededBy) return ''
  return `<div class="superseded-mark">SUPERSEDED</div><div class="superseded-banner">Superseded by Rev ${input.supersededBy} · not valid</div>`
}
